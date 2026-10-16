import { lstat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { effectivePermissions } from "./config.ts"
import { BridgeError, requireValue } from "./errors.ts"
import { processIdentity } from "./identity.ts"
import { digest, recoverDirectoryLock, withLock } from "./locking.ts"
import {
  type Binding,
  type Config,
  emptyShell,
  type Operation,
  type Pane,
} from "./models.ts"
import { sanitizeText, truncateUtf8 } from "./output.ts"
import {
  checkExistingFile,
  secureDirectory,
  validateRawInput,
} from "./security.ts"
import { resourceKey, type State } from "./state.ts"
import { Tasks } from "./tasks.ts"
import {
  canonicalSocket,
  checkTmux,
  paneTarget,
  randomNonce,
  Tmux,
  tmuxCommandCapabilities,
} from "./tmux.ts"

export class Sessions {
  readonly tasks: Tasks
  constructor(
    readonly config: Config,
    readonly state: State,
  ) {
    this.tasks = new Tasks(state)
  }

  async start(name: string, ssh?: string): Promise<Binding> {
    await checkTmux(this.config.minimumTmux)
    if (ssh)
      requireValue(
        /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ssh),
        "INVALID_INPUT",
        "SSH destination must be a configuration alias",
      )
    return withLock(this.state.locks, "registry", async () => {
      const existing = (await this.state.list()).find(
        (binding) => binding.alias === name,
      )
      if (existing) {
        await this.verify(existing)
        return existing
      }
      // Use a short path: macOS sockaddr_un is too small for long TMPDIR paths.
      const socketRoot = await secureDirectory(
        join("/tmp", `agent-terminal-bridge-${process.getuid?.()}`),
      )
      const socket = join(
        socketRoot,
        `${digest(`${this.state.root}|${this.config.socketName}`).slice(0, 20)}.sock`,
      )
      const configPath = join(this.state.root, "managed.tmux.conf")
      await checkExistingFile(configPath)
      await writeFile(
        configPath,
        "set -g remain-on-exit on\nset -g history-limit 10000\nset -g default-shell /bin/sh\nset -g status off\nset -g synchronize-panes off\n",
        { mode: 0o600 },
      )
      const id = randomNonce()
      const sessionName = `atb-${id}`
      const tmux = new Tmux(socket)
      const result = await tmux.run([
        "-f",
        configPath,
        "new-session",
        "-d",
        "-P",
        "-F",
        "#{pane_id}",
        "-s",
        sessionName,
        "-x",
        "160",
        "-y",
        "48",
        ...(ssh ? ["ssh", "-tt", ssh] : ["/bin/sh"]),
      ])
      const paneId = result.trim()
      requireValue(
        /^%\d+$/.test(paneId),
        "PROTOCOL_ERROR",
        "tmux did not create the expected pane",
        8,
      )
      try {
        return await this.register(name, socket, paneId, "managed", [
          "read",
          "exec",
          "raw_send",
          "stop",
        ])
      } catch (error) {
        await tmux
          .run(["kill-session", "-t", `=${sessionName}`])
          .catch(() => {})
        throw error
      }
    })
  }

  async bind(
    name: string,
    socket: string,
    paneId: string,
    granted: Operation[],
  ): Promise<Binding> {
    requireValue(
      /^%\d+$/.test(paneId),
      "INVALID_INPUT",
      "An exact pane ID such as %3 is required",
    )
    await checkTmux(this.config.minimumTmux)
    return withLock(this.state.locks, "registry", async () => {
      requireValue(
        !(await this.state.list()).some((binding) => binding.alias === name),
        "INVALID_BINDING",
        "Alias is already registered",
        4,
      )
      return this.register(
        name,
        await canonicalSocket(socket),
        paneId,
        "external",
        granted,
      )
    })
  }

  private async register(
    name: string,
    socket: string,
    paneId: string,
    ownership: "managed" | "external",
    granted: Operation[],
  ): Promise<Binding> {
    const tmux = new Tmux(socket)
    const serverInstance = await tmux.serverInstance()
    const pane = await tmux.inspect(paneId)
    requireValue(
      !pane.dead &&
        !pane.marker &&
        (await tmux.memberships(paneId)).length === 1,
      "INVALID_BINDING",
      "Pane is exited, already marked or linked into multiple sessions",
      4,
    )
    const canonical = await canonicalSocket(socket)
    requireValue(
      !(await this.state.list()).some(
        (binding) =>
          binding.socketPath === canonical &&
          binding.serverInstance === serverInstance &&
          binding.paneId === paneId,
      ),
      "INVALID_BINDING",
      "Pane is already registered",
      4,
    )
    const marker = randomNonce()
    const binding: Binding = {
      schemaVersion: 1,
      alias: name,
      id: randomNonce(),
      generation: randomNonce(),
      ownership,
      socketPath: canonical,
      serverInstance,
      serverPid: pane.serverPid,
      serverProcess: await processIdentity(pane.serverPid),
      sessionId: pane.sessionId,
      windowId: pane.windowId,
      paneId,
      panePid: pane.pid,
      paneProcess: await processIdentity(pane.pid),
      marker,
      permissions: granted,
      control: "human",
      shell: emptyShell(),
      clientFlags: {},
      createdAt: new Date().toISOString(),
    }
    await tmux.run([
      "set-option",
      "-p",
      "-t",
      paneTarget(binding),
      "@atb_binding",
      marker,
    ])
    try {
      await this.state.save(binding)
    } catch (error) {
      await tmux
        .run(["set-option", "-pu", "-t", paneTarget(binding), "@atb_binding"])
        .catch(() => {})
      throw error
    }
    await this.state.audit("bind", binding.id, "registered")
    return binding
  }

  async verify(binding: Binding, write = false): Promise<Pane> {
    const stat = await lstat(binding.socketPath).catch(() => null)
    requireValue(
      stat?.isSocket() && stat.uid === process.getuid?.(),
      "BINDING_CHANGED",
      "Bound socket is missing or changed",
      4,
    )
    const tmux = new Tmux(binding.socketPath)
    let pane: Pane
    try {
      pane = await tmux.inspect(paneTarget(binding))
    } catch {
      throw new BridgeError("BINDING_CHANGED", "Bound pane no longer exists", 4)
    }
    requireValue(
      pane.serverInstance === binding.serverInstance &&
        pane.serverPid === binding.serverPid &&
        pane.sessionId === binding.sessionId &&
        pane.windowId === binding.windowId &&
        pane.paneId === binding.paneId &&
        pane.pid === binding.panePid &&
        pane.marker === binding.marker,
      "BINDING_CHANGED",
      "Bound pane identity changed",
      4,
    )
    requireValue(
      (await tmux.memberships(binding.paneId)).length === 1,
      "BINDING_CHANGED",
      "Pane is linked into another session",
      4,
    )
    requireValue(
      (await processIdentity(binding.serverPid)) === binding.serverProcess,
      "BINDING_CHANGED",
      "tmux server process changed",
      4,
    )
    if (!pane.dead)
      requireValue(
        (await processIdentity(binding.panePid)) === binding.paneProcess,
        "BINDING_CHANGED",
        "Pane process changed",
        4,
      )
    if (write)
      requireValue(
        !pane.dead && !pane.synchronized && !pane.inMode,
        "SHELL_CONFIRMATION_REQUIRED",
        "Pane exited, is in a tmux mode, or has synchronized input",
        5,
      )
    return pane
  }

  requirePermission(binding: Binding, operation: Operation): void {
    requireValue(
      effectivePermissions(
        this.config,
        binding.alias,
        binding.permissions,
      ).includes(operation),
      "PERMISSION_DENIED",
      "Operation is not authorized for this binding",
      5,
    )
  }

  async status(name: string) {
    const binding = await this.state.load(name)
    const active = await this.tasks.active(binding)
    const task = active ? await this.tasks.observe(active) : null
    const uncertain = task?.state === "unknown"
    try {
      const pane = await this.verify(binding)
      return {
        session: name,
        binding: "valid",
        pane: {
          id: pane.paneId,
          state: pane.dead ? "exited" : "alive",
          pid: pane.pid,
        },
        shell: {
          state: pane.dead || uncertain ? "unknown" : binding.shell.state,
          profile:
            binding.shell.state === "confirmed" && !pane.dead && !uncertain
              ? "bash-v1"
              : null,
          endpoint_label:
            pane.dead || uncertain ? null : binding.shell.endpoint,
        },
        control: binding.control,
        task: { state: task?.state ?? "idle", request_id: task?.id ?? null },
        permissions: effectivePermissions(
          this.config,
          name,
          binding.permissions,
        ),
      }
    } catch (error) {
      if (
        !(error instanceof BridgeError) ||
        !["BINDING_CHANGED", "PROCESS_MISSING"].includes(error.code)
      )
        throw error
      return {
        session: name,
        binding: "stale",
        pane: { id: binding.paneId, state: "missing", pid: null },
        shell: { state: "unknown", profile: null, endpoint_label: null },
        control: "recovery_required",
        task: { state: task?.state ?? "unknown", request_id: task?.id ?? null },
        permissions: [],
      }
    }
  }

  async capture(name: string, lines: number, screen: string) {
    const binding = await this.state.load(name)
    this.requirePermission(binding, "read")
    const pane = await this.verify(binding)
    if (screen === "alternate")
      requireValue(
        pane.alternate,
        "SCREEN_MISSING",
        "No alternate screen exists",
        5,
      )
    if (screen === "mode") {
      const commands = await new Tmux(binding.socketPath).run(["list-commands"])
      requireValue(
        tmuxCommandCapabilities(commands).capture_mode_screen,
        "UNSUPPORTED_CAPABILITY",
        "This tmux build cannot capture copy-mode screens",
        3,
      )
      requireValue(
        pane.inMode,
        "SCREEN_MISSING",
        "Pane is not in a tmux mode",
        5,
      )
    }
    const raw = await new Tmux(binding.socketPath).capture(
      binding,
      lines,
      screen,
      this.config.maxOutputBytes,
      pane.alternate,
    )
    const after = await this.verify(binding)
    requireValue(
      after.alternate === pane.alternate && after.inMode === pane.inMode,
      "SCREEN_CHANGED",
      "Terminal screen changed during capture; inspect it again",
      5,
    )
    const output = truncateUtf8(sanitizeText(raw), this.config.maxOutputBytes)
    return {
      session: name,
      pane_id: binding.paneId,
      source: "terminal_snapshot",
      screen,
      terminal_output: output.text,
      truncated: output.truncated,
      execution_result: false,
    }
  }

  async send(name: string, text: string, enter: boolean) {
    validateRawInput(text, this.config.maxInputLineBytes)
    const original = await this.state.load(name)
    return withLock(this.state.locks, resourceKey(original), async () => {
      const binding = await this.state.load(name)
      await this.verify(binding, true)
      this.requirePermission(binding, "raw_send")
      await this.tasks.requireIdle(binding)
      requireValue(
        binding.control === "human",
        binding.control === "recovery_required"
          ? "RECOVERY_REQUIRED"
          : "PERMISSION_DENIED",
        "Raw input requires human control",
        binding.control === "recovery_required" ? 9 : 5,
      )
      binding.shell = emptyShell("unknown")
      binding.control = "recovery_required"
      await this.state.save(binding)
      try {
        await new Tmux(binding.socketPath).sendBytes(
          paneTarget(binding),
          Buffer.from(text),
          enter,
          binding,
        )
        await this.state.audit("send", binding.id, "sent")
        binding.control = "human"
        await this.state.save(binding)
      } catch {
        throw new BridgeError(
          "RAW_INPUT_UNKNOWN",
          "Input may be partial; inspect the terminal and explicitly hand control back to human",
          8,
          false,
          "unknown",
        )
      }
      return { session: name, sent: true, completed: false, exit_code: null }
    })
  }

  async handoff(name: string, to: "human" | "agent") {
    const original = await this.state.load(name)
    return withLock(this.state.locks, resourceKey(original), async () => {
      const binding = await this.state.load(name)
      await this.verify(binding, true)
      await this.tasks.requireIdle(binding)
      const tmux = new Tmux(binding.socketPath)
      const clients = await tmux.clients(binding.sessionId)
      if (to === "agent") {
        requireValue(
          binding.shell.state === "confirmed",
          "SHELL_CONFIRMATION_REQUIRED",
          "Confirm the shell before handing execution control to an Agent",
          5,
        )
        for (const client of clients.filter((item) => !item.control)) {
          if (!(client.key in binding.clientFlags))
            binding.clientFlags[client.key] = client.readonly
        }
        // Persist restoration data before changing any interactive client.
        await this.state.save(binding)
        for (const client of clients.filter((item) => !item.control)) {
          if (!client.readonly)
            await tmux.setReadonly(client.name, true, binding.sessionId)
        }
      } else {
        await this.restoreClients(binding)
        binding.shell = emptyShell("unknown")
      }
      binding.control = to
      await this.state.save(binding)
      await this.state.audit("handoff", binding.id, to)
      return { session: name, control: to }
    })
  }

  async unbind(name: string) {
    const original = await this.state.load(name)
    return withLock(this.state.locks, resourceKey(original), async () =>
      withLock(this.state.locks, "registry", async () => {
        const binding = await this.state.load(name)
        await this.tasks.requireIdle(binding)
        try {
          await this.verify(binding)
          await new Tmux(binding.socketPath).run([
            "set-option",
            "-pu",
            "-t",
            paneTarget(binding),
            "@atb_binding",
          ])
        } catch (error) {
          if (
            !(error instanceof BridgeError) ||
            error.code !== "BINDING_CHANGED"
          )
            throw error
        }
        await this.state.remove(name)
        await this.state.audit("unbind", binding.id, "revoked")
        return { session: name, unbound: true }
      }),
    )
  }

  async stop(name: string) {
    const original = await this.state.load(name)
    return withLock(this.state.locks, resourceKey(original), async () => {
      const binding = await this.state.load(name)
      this.requirePermission(binding, "stop")
      await this.tasks.requireIdle(binding)
      requireValue(
        binding.ownership === "managed",
        "PERMISSION_DENIED",
        "External panes can only be unbound",
        5,
      )
      await this.verify(binding)
      await new Tmux(binding.socketPath).run([
        "kill-session",
        "-t",
        binding.sessionId,
      ])
      binding.control = "recovery_required"
      binding.shell = emptyShell("unknown")
      await this.state.save(binding)
      await this.state.audit("stop", binding.id, "local_session_stopped")
      return {
        session: name,
        local_session_stopped: true,
        remote_processes_stopped: null,
      }
    })
  }

  async recoverLock(name: string, scope: string) {
    const key =
      scope === "registry" || scope === "audit"
        ? scope
        : `${scope === "metadata" ? "metadata:" : ""}${resourceKey(await this.state.load(name))}`
    await recoverDirectoryLock(this.state.locks, key)
    return {
      session: name,
      local_lock_recovered: true,
      remote_state_recovered: false,
    }
  }

  async restoreClients(binding: Binding): Promise<void> {
    await this.verify(binding)
    const tmux = new Tmux(binding.socketPath)
    for (const client of await tmux.clients(binding.sessionId)) {
      if (binding.clientFlags[client.key] === false && client.readonly)
        await tmux.setReadonly(client.name, false, binding.sessionId)
    }
    binding.clientFlags = {}
  }
}
