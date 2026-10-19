import { join } from "node:path"
import { BridgeError, hasCode, requireValue } from "./errors.ts"
import { processIdentity } from "./identity.ts"
import { digest } from "./locking.ts"
import type { Binding } from "./models.ts"
import { readJsonSecure, writeAtomic } from "./security.ts"
import type { State } from "./state.ts"
import {
  boolean,
  choice,
  integer,
  keys,
  object,
  requestId,
  string,
} from "./validate.ts"

export const TASK_STATES = [
  "prepared",
  "not_started",
  "sent",
  "running",
  "completed",
  "unknown",
] as const
export type TaskState = (typeof TASK_STATES)[number]
export interface Task {
  schemaVersion: 1
  id: string
  bindingId: string
  generation: string
  nonce: string
  kind: "run" | "probe"
  fingerprint: string
  state: TaskState
  exitCode: number | null
  reason: string | null
  ownerPid: number
  ownerProcess: string
  createdAt: string
  updatedAt: string
  durationMs: number | null
  interruptSent: boolean
  recovered: boolean
}
export interface ControlRequest {
  id: string
  generation: string
  nonce: string
  type: "interrupt" | "takeover"
}
export function isPending(task: Task): boolean {
  return !["completed", "not_started"].includes(task.state) && !task.recovered
}

export class Tasks {
  constructor(readonly state: State) {}
  private path(binding: Binding, id: string) {
    return join(
      this.state.requests,
      `request-${digest(`${binding.id}|${requestId(id)}`)}.json`,
    )
  }
  private activePath(binding: Binding) {
    return join(this.state.requests, `active-${digest(binding.id)}.json`)
  }
  private controlPath(binding: Binding) {
    return join(this.state.requests, `control-${digest(binding.id)}.json`)
  }
  async get(binding: Binding, id: string): Promise<Task | null> {
    const value = await optionalJson(this.path(binding, id))
    if (value === null) return null
    try {
      const task = parseTask(value)
      requireValue(
        task.bindingId === binding.id && task.id === id,
        "STATE_ERROR",
        "Request identity does not match its file",
        8,
      )
      return task
    } catch {
      throw new BridgeError("STATE_ERROR", "Request record is invalid")
    }
  }
  async save(binding: Binding, task: Task): Promise<void> {
    this.state.requireActive(binding)
    await writeAtomic(this.path(binding, task.id), task)
    if (task.kind === "run" && task.state === "prepared") {
      const ids = await this.recentIds(binding)
      await writeAtomic(this.recentPath(binding), {
        bindingId: binding.id,
        ids: [task.id, ...ids.filter((id) => id !== task.id)].slice(0, 20),
      })
    }
  }
  private recentPath(binding: Binding) {
    return join(this.state.requests, `recent-${digest(binding.id)}.json`)
  }
  private async recentIds(binding: Binding): Promise<string[]> {
    const value = await optionalJson(this.recentPath(binding))
    if (value === null) return []
    const data = object(value, "recent requests")
    keys(data, ["bindingId", "ids"], "recent requests")
    requireValue(
      data.bindingId === binding.id &&
        Array.isArray(data.ids) &&
        data.ids.length <= 20,
      "STATE_ERROR",
      "Recent request index is invalid",
      8,
    )
    return data.ids.map((id) => requestId(string(id, "recent request ID", 128)))
  }
  async recent(binding: Binding): Promise<Task[]> {
    const result: Task[] = []
    for (const id of await this.recentIds(binding)) {
      const task = await this.get(binding, id)
      requireValue(task, "STATE_ERROR", "Recent request record is missing", 8)
      result.push(await this.observe(task))
    }
    return result
  }
  async observe(task: Task): Promise<Task> {
    if (!isPending(task) || task.state === "unknown") return task
    try {
      if ((await processIdentity(task.ownerPid)) === task.ownerProcess)
        return task
    } catch {
      /* A missing or unverifiable owner cannot prove continued coordination. */
    }
    return { ...task, state: "unknown", reason: "OWNER_LOST", exitCode: null }
  }
  async setActive(binding: Binding, task: Task | null): Promise<void> {
    this.state.requireActive(binding)
    await writeAtomic(this.activePath(binding), {
      bindingId: binding.id,
      requestId: task?.id ?? null,
    })
  }
  async active(binding: Binding): Promise<Task | null> {
    const value = await optionalJson(this.activePath(binding))
    if (value === null) return null
    try {
      const data = object(value, "active request")
      keys(data, ["bindingId", "requestId"], "active request")
      requireValue(
        data.bindingId === binding.id,
        "STATE_ERROR",
        "Active request binding mismatch",
        8,
      )
      if (data.requestId === null) return null
      const id = requestId(string(data.requestId, "active request ID", 128))
      const task = await this.get(binding, id)
      requireValue(task, "STATE_ERROR", "Active request record is missing", 8)
      return task
    } catch {
      throw new BridgeError("STATE_ERROR", "Active request state is invalid")
    }
  }
  async requireIdle(binding: Binding): Promise<void> {
    const active = await this.active(binding)
    const observed = active ? await this.observe(active) : null
    if (observed && isPending(observed))
      throw new BridgeError(
        observed.state === "unknown" ? "RECOVERY_REQUIRED" : "BUSY",
        "An unresolved request prevents automatic input",
        observed.state === "unknown" ? 9 : 6,
      )
  }
  async control(binding: Binding): Promise<ControlRequest | null> {
    const value = await optionalJson(this.controlPath(binding))
    if (value === null) return null
    try {
      const data = object(value, "control request")
      keys(data, ["id", "generation", "nonce", "type"], "control request")
      return {
        id: requestId(string(data.id, "request ID", 128)),
        generation: string(data.generation, "generation", 128),
        nonce: string(data.nonce, "control nonce", 128),
        type: choice(data.type, ["interrupt", "takeover"], "control operation"),
      }
    } catch {
      throw new BridgeError("STATE_ERROR", "Control request state is invalid")
    }
  }
  async saveControl(binding: Binding, value: ControlRequest): Promise<void> {
    await writeAtomic(this.controlPath(binding), value)
  }
}

async function optionalJson(path: string): Promise<unknown | null> {
  try {
    return await readJsonSecure(path)
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null
    throw new BridgeError("STATE_ERROR", "Cannot read durable request state")
  }
}

function parseTask(value: unknown): Task {
  const data = object(value, "request")
  keys(
    data,
    [
      "schemaVersion",
      "id",
      "bindingId",
      "generation",
      "nonce",
      "kind",
      "fingerprint",
      "state",
      "exitCode",
      "reason",
      "ownerPid",
      "ownerProcess",
      "createdAt",
      "updatedAt",
      "durationMs",
      "interruptSent",
      "recovered",
    ],
    "request",
  )
  requireValue(
    data.schemaVersion === 1,
    "STATE_ERROR",
    "Unsupported request schema",
    8,
  )
  const nonce = string(data.nonce, "nonce", 32)
  const fingerprint = string(data.fingerprint, "fingerprint", 64)
  requireValue(
    /^[a-f0-9]{32}$/.test(nonce) && /^[a-f0-9]{64}$/.test(fingerprint),
    "STATE_ERROR",
    "Invalid request identifiers",
    8,
  )
  return {
    schemaVersion: 1,
    id: requestId(string(data.id, "request ID", 128)),
    bindingId: string(data.bindingId, "binding ID", 128),
    generation: string(data.generation, "generation", 128),
    nonce,
    kind: choice(data.kind, ["run", "probe"], "request kind"),
    fingerprint,
    state: choice(data.state, TASK_STATES, "request state"),
    exitCode:
      data.exitCode === null
        ? null
        : integer(data.exitCode, "exit code", 0, 255),
    reason:
      data.reason === null ? null : string(data.reason, "failure reason", 64),
    ownerPid: integer(data.ownerPid, "owner PID", 1),
    ownerProcess: string(data.ownerProcess, "owner process"),
    createdAt: string(data.createdAt, "createdAt", 64),
    updatedAt: string(data.updatedAt, "updatedAt", 64),
    durationMs:
      data.durationMs === null ? null : integer(data.durationMs, "duration", 0),
    interruptSent: boolean(data.interruptSent, "interrupted"),
    recovered: boolean(data.recovered, "recovered"),
  }
}
