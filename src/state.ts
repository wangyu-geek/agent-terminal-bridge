import { appendFile, readdir, rename, unlink } from "node:fs/promises"
import { join } from "node:path"
import { BridgeError, hasCode, requireValue } from "./errors.ts"
import { digest, withLock } from "./locking.ts"
import { type Binding, OPERATIONS } from "./models.ts"
import {
  checkExistingFile,
  privatePathError,
  readJsonSecure,
  secureDirectory,
  writeAtomic,
} from "./security.ts"
import {
  alias,
  boolean,
  choice,
  integer,
  keys,
  object,
  string,
  strings,
} from "./validate.ts"

export class State {
  readonly locks: string
  readonly bindings: string
  readonly requests: string
  constructor(readonly root: string) {
    this.locks = join(root, "locks")
    this.bindings = join(root, "bindings")
    this.requests = join(root, "requests")
  }
  async init(): Promise<void> {
    try {
      await secureDirectory(this.root)
      for (const path of [this.locks, this.bindings, this.requests])
        await secureDirectory(path)
    } catch (error) {
      throw privatePathError(error)
    }
  }
  bindingPath(name: string): string {
    return join(this.bindings, `${digest(alias(name))}.json`)
  }
  async load(name: string): Promise<Binding> {
    try {
      const binding = parseBinding(await readJsonSecure(this.bindingPath(name)))
      requireValue(
        binding.alias === name,
        "STATE_ERROR",
        "Binding alias does not match its record",
        8,
      )
      return binding
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        throw new BridgeError("INVALID_BINDING", "Session is not registered", 4)
      if (error instanceof BridgeError && error.code === "INVALID_INPUT")
        throw new BridgeError("STATE_ERROR", "Binding record is invalid", 8)
      throw privatePathError(error)
    }
  }
  async save(binding: Binding): Promise<void> {
    await writeAtomic(this.bindingPath(binding.alias), binding)
  }
  async remove(name: string): Promise<void> {
    await unlink(this.bindingPath(name))
  }
  async list(): Promise<Binding[]> {
    try {
      const result: Binding[] = []
      for (const file of await readdir(this.bindings)) {
        if (!file.endsWith(".json")) continue
        requireValue(
          /^[a-f0-9]{64}\.json$/.test(file),
          "STATE_ERROR",
          "Unexpected binding filename",
          8,
        )
        const binding = parseBinding(
          await readJsonSecure(join(this.bindings, file)),
        )
        requireValue(
          `${digest(binding.alias)}.json` === file,
          "STATE_ERROR",
          "Binding filename mismatch",
          8,
        )
        result.push(binding)
      }
      return result.sort((a, b) => a.alias.localeCompare(b.alias))
    } catch (error) {
      if (error instanceof BridgeError && error.code === "INVALID_INPUT")
        throw new BridgeError(
          "STATE_ERROR",
          "Binding registry contains invalid state",
        )
      throw privatePathError(error)
    }
  }
  async audit(
    operation: string,
    bindingId: string | null,
    outcome: string,
  ): Promise<void> {
    const deadline = performance.now() + 250
    while (true) {
      try {
        await withLock(this.locks, "audit", async () => {
          const path = join(this.root, "audit.jsonl")
          await checkExistingFile(path)
          const file = Bun.file(path)
          if (file.size > 1048576) {
            await checkExistingFile(`${path}.1`)
            await rename(path, `${path}.1`)
          }
          await appendFile(
            path,
            `${JSON.stringify({ time: new Date().toISOString(), operation, binding_id: bindingId, outcome })}\n`,
            { mode: 0o600 },
          )
        })
        return
      } catch (error) {
        if (
          !(error instanceof BridgeError) ||
          error.code !== "BUSY" ||
          performance.now() >= deadline
        )
          throw error
        // Only retry acquisition of this short local metadata lock, never a
        // terminal dispatch or an execution-resource lock.
        await Bun.sleep(5)
      }
    }
  }
}

export function resourceKey(binding: Binding): string {
  return [
    binding.socketPath,
    binding.serverInstance,
    binding.paneId,
    binding.paneProcess,
  ].join("|")
}

export function parseBinding(value: unknown): Binding {
  const data = object(value, "binding")
  keys(
    data,
    [
      "schemaVersion",
      "alias",
      "id",
      "generation",
      "ownership",
      "socketPath",
      "serverInstance",
      "serverPid",
      "serverProcess",
      "sessionId",
      "windowId",
      "paneId",
      "panePid",
      "paneProcess",
      "marker",
      "permissions",
      "control",
      "shell",
      "clientFlags",
      "createdAt",
    ],
    "binding",
  )
  requireValue(
    data.schemaVersion === 1,
    "STATE_ERROR",
    "Unsupported binding schema",
    8,
  )
  const shell = object(data.shell, "shell binding")
  keys(shell, ["state", "nonce", "endpoint", "user", "cwd"], "shell binding")
  const clients = object(data.clientFlags, "client flags")
  const flags: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(clients))
    flags[key] = boolean(val, "client flag")
  const nullable = (val: unknown, name: string) =>
    val === null ? null : string(val, name)
  const result: Binding = {
    schemaVersion: 1,
    alias: alias(string(data.alias, "alias")),
    id: string(data.id, "binding ID", 128),
    generation: string(data.generation, "generation", 128),
    ownership: choice(data.ownership, ["managed", "external"], "ownership"),
    socketPath: string(data.socketPath, "socket path"),
    serverInstance: string(data.serverInstance, "server instance", 128),
    serverPid: integer(data.serverPid, "server PID", 1),
    serverProcess: string(data.serverProcess, "server process"),
    sessionId: string(data.sessionId, "session ID", 32),
    windowId: string(data.windowId, "window ID", 32),
    paneId: string(data.paneId, "pane ID", 32),
    panePid: integer(data.panePid, "pane PID", 1),
    paneProcess: string(data.paneProcess, "pane process"),
    marker: string(data.marker, "binding marker", 128),
    permissions: strings(data.permissions, "permissions").map((item) =>
      choice(item, OPERATIONS, "operation"),
    ),
    control: choice(
      data.control,
      ["human", "agent", "recovery_required"],
      "control",
    ),
    shell: {
      state: choice(
        shell.state,
        ["uninitialized", "pending", "confirmed", "unknown"],
        "shell state",
      ),
      nonce: nullable(shell.nonce, "shell nonce"),
      endpoint: nullable(shell.endpoint, "endpoint"),
      user: nullable(shell.user, "user"),
      cwd: nullable(shell.cwd, "cwd"),
    },
    clientFlags: flags,
    createdAt: string(data.createdAt, "creation time", 64),
  }
  requireValue(
    /^\$\d+$/.test(result.sessionId) &&
      /^@\d+$/.test(result.windowId) &&
      /^%\d+$/.test(result.paneId),
    "STATE_ERROR",
    "Invalid tmux identity",
    8,
  )
  return result
}
