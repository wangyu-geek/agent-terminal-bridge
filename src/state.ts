import {
  appendFile,
  lstat,
  open,
  readdir,
  rename,
  unlink,
} from "node:fs/promises"
import { join } from "node:path"
import { BridgeError, hasCode, requireValue } from "./errors.ts"
import { digest, withLock } from "./locking.ts"
import { type Binding, OPERATIONS, PREPARATION_PHASES } from "./models.ts"
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
  private selection: {
    alias: string
    id: string
    historical?: boolean
  } | null = null
  readonly locks: string
  readonly bindings: string
  readonly requests: string
  readonly history: string
  constructor(readonly root: string) {
    this.locks = join(root, "locks")
    this.bindings = join(root, "bindings")
    this.requests = join(root, "requests")
    this.history = join(root, "history")
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
      if (this.selection?.alias === name && this.selection.historical) {
        const saved = await this.historical(this.selection.id)
        requireValue(
          saved?.alias === name,
          "STATE_ERROR",
          "Historical binding is missing or inconsistent",
          8,
        )
        return saved
      }
      const binding = parseBinding(await readJsonSecure(this.bindingPath(name)))
      requireValue(
        binding.alias === name,
        "STATE_ERROR",
        "Binding alias does not match its record",
        8,
      )
      requireValue(
        this.selection === null ||
          this.selection.alias !== name ||
          this.selection.id === binding.id,
        "BINDING_CHANGED",
        "The selected session_id was replaced; select a session again",
        4,
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
    this.requireActive(binding)
    await writeAtomic(this.bindingPath(binding.alias), binding)
  }
  isHistorical(binding: Binding): boolean {
    return (
      this.selection?.id === binding.id && this.selection.historical === true
    )
  }
  requireActive(binding: Binding): void {
    requireValue(
      !this.isHistorical(binding),
      "ARCHIVED_SESSION",
      "This session_id is historical and read-only; select a current connection for terminal operations",
      4,
    )
  }
  private async historyAvailable(): Promise<boolean> {
    try {
      const stat = await lstat(this.history)
      requireValue(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o077) === 0,
        "UNSAFE_PATH",
        "History directory must be a private owned directory, without symbolic links",
        8,
      )
      return true
    } catch (error) {
      if (hasCode(error, "ENOENT")) return false
      throw privatePathError(error)
    }
  }
  async historical(id: string): Promise<Binding | null> {
    requireValue(
      /^[a-f0-9]{32}$/.test(id),
      "INVALID_INPUT",
      "Invalid historical session_id",
    )
    if (!(await this.historyAvailable())) return null
    try {
      const binding = parseBinding(
        await readJsonSecure(join(this.history, `${id}.json`)),
      )
      requireValue(
        binding.id === id,
        "STATE_ERROR",
        "Historical session identity mismatch",
        8,
      )
      return binding
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null
      throw privatePathError(error)
    }
  }
  async listHistory(): Promise<Binding[]> {
    if (!(await this.historyAvailable())) return []
    let files: string[]
    try {
      files = await readdir(this.history)
    } catch (error) {
      if (hasCode(error, "ENOENT")) return []
      throw privatePathError(error)
    }
    const saved: Binding[] = []
    for (const file of files) {
      requireValue(
        /^[a-f0-9]{32}\.json$/.test(file),
        "STATE_ERROR",
        "Unexpected history filename",
        8,
      )
      const binding = await this.historical(file.slice(0, -5))
      requireValue(binding, "STATE_ERROR", "Historical session disappeared", 8)
      saved.push(binding)
    }
    const active = new Set((await this.list()).map((binding) => binding.id))
    return saved.filter((binding) => !active.has(binding.id))
  }
  // Caller holds the resource and registry locks. Persist ID history before
  // releasing the display name; a crash can leave a harmless duplicate copy.
  async archive(binding: Binding): Promise<void> {
    this.requireActive(binding)
    const current = await this.load(binding.alias)
    requireValue(
      current.id === binding.id,
      "BINDING_CHANGED",
      "Display name changed during archival",
      4,
    )
    await secureDirectory(this.history)
    const saved = await this.historical(binding.id)
    if (saved)
      requireValue(
        saved.alias === binding.alias &&
          saved.marker === binding.marker &&
          resourceKey(saved) === resourceKey(binding),
        "STATE_ERROR",
        "Historical ID is associated with another resource",
        8,
      )
    else await writeAtomic(join(this.history, `${binding.id}.json`), binding)
    await this.remove(binding.alias)
    const directory = await open(this.bindings, "r")
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
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
  async select(id?: string, name?: string): Promise<string> {
    requireValue(
      !(id !== undefined && name !== undefined),
      "INVALID_INPUT",
      "Use either --session-id or --session, not both",
    )
    if (name !== undefined) {
      const binding = await this.load(alias(name))
      this.selection = { alias: binding.alias, id: binding.id }
      return name
    }
    const bindings = await this.list()
    if (id !== undefined) {
      requireValue(
        /^[a-f0-9]{32}$/.test(id),
        "INVALID_INPUT",
        "session_id must be the complete 32-character Bridge ID",
      )
      const matches = bindings.filter((binding) => binding.id === id)
      const selected = matches[0] ?? (await this.historical(id))
      requireValue(
        matches.length <= 1 && selected,
        "INVALID_BINDING",
        "session_id is missing or no longer registered; inspect list",
        4,
      )
      this.selection = {
        alias: selected.alias,
        id: selected.id,
        historical: matches.length === 0,
      }
      return selected.alias
    }
    requireValue(
      bindings.length > 0,
      "INVALID_BINDING",
      "No shared session exists; run remote-terminal connect SSH_ALIAS in a real terminal",
      4,
    )
    requireValue(
      bindings.length === 1,
      "SESSION_SELECTION_REQUIRED",
      "Multiple sessions exist; select a session_id from remote-terminal list",
      5,
    )
    const selected = bindings[0]
    requireValue(selected, "INVALID_BINDING", "No shared session exists", 4)
    this.selection = { alias: selected.alias, id: selected.id }
    return selected.alias
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
      "preparation",
      "sshAlias",
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
  keys(
    shell,
    ["state", "nonce", "endpoint", "user", "cwd", "version"],
    "shell binding",
  )
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
      version:
        shell.version === undefined
          ? null
          : nullable(shell.version, "shell version"),
    },
    clientFlags: flags,
    createdAt: string(data.createdAt, "creation time", 64),
    preparation: null,
    sshAlias:
      data.sshAlias === undefined || data.sshAlias === null
        ? null
        : string(data.sshAlias, "SSH entry alias", 128),
  }
  if (data.preparation !== undefined && data.preparation !== null) {
    const preparation = object(data.preparation, "preparation")
    keys(
      preparation,
      [
        "id",
        "generation",
        "phase",
        "inputStarted",
        "ownerPid",
        "ownerProcess",
        "reason",
        "startedAt",
      ],
      "preparation",
    )
    result.preparation = {
      id: string(preparation.id, "preparation ID", 128),
      generation: string(preparation.generation, "preparation generation", 128),
      phase: choice(preparation.phase, PREPARATION_PHASES, "preparation phase"),
      inputStarted: boolean(preparation.inputStarted, "preparation input"),
      ownerPid: integer(preparation.ownerPid, "preparation owner PID", 1),
      ownerProcess: string(
        preparation.ownerProcess,
        "preparation owner process",
      ),
      reason:
        preparation.reason === null
          ? null
          : string(preparation.reason, "preparation reason", 64),
      startedAt: string(preparation.startedAt, "preparation start", 64),
    }
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
