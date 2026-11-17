import { lstat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { effectivePermissions } from "./config.ts"
import { BridgeError, hasCode, requireValue } from "./errors.ts"
import { msg } from "./i18n.ts"
import { processIdentity } from "./identity.ts"
import {
  digest,
  inspectDirectoryLock,
  recoverDirectoryLock,
  withLock,
} from "./locking.ts"
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
  privatePathError,
  secureDirectory,
  validateRawInput,
} from "./security.ts"
import { resourceKey, type State } from "./state.ts"
import { isPending, Tasks } from "./tasks.ts"
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

  async start(name: string, ssh?: string, fresh = false): Promise<Binding> {
    await checkTmux(this.config.minimumTmux)
    if (ssh)
      requireValue(
        /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ssh),
        "INVALID_INPUT",
        msg("error.ssh_destination_must_be_a_configuration_alias"),
      )
    return withLock(this.state.locks, "registry", async () => {
      const existing = (await this.state.list()).find(
        (binding) => binding.alias === name,
      )
      if (existing) {
        requireValue(
          !fresh,
          "SESSION_CONFLICT",
          msg(
            "error.session_name_is_already_registered_select_it_explicitly_or_choose_a_new_session_name",
          ),
          4,
        )
        await this.verify(existing)
        return existing
      }
      return this.createManaged(name, ssh)
    })
  }

  async startConnection(ssh: string, name?: string): Promise<Binding> {
    await checkTmux(this.config.minimumTmux)
    requireValue(
      Bun.which("ssh"),
      "DEPENDENCY_MISSING",
      msg("error.local_openssh_is_required_for_a_new_connection"),
      3,
    )
    requireValue(
      /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ssh),
      "INVALID_INPUT",
      msg("error.ssh_destination_must_be_a_configuration_alias"),
    )
    return withLock(this.state.locks, "registry", async () => {
      const occupied = new Set(
        (await this.state.list()).map((binding) => binding.alias),
      )
      // SSH entry names also allow dots; Bridge display names do not.
      const base = ssh.slice(0, 48).replaceAll(".", "-")
      let selected = name ?? base
      if (name)
        requireValue(
          !occupied.has(name),
          "SESSION_CONFLICT",
          msg("error.connection_name_occupied"),
          4,
        )
      else {
        for (let index = 2; occupied.has(selected); index++)
          selected = `${base}-${index}`
      }
      return this.createManaged(selected, ssh)
    })
  }

  async archiveEnded(name: string, expectedId: string): Promise<void> {
    const original = await this.state.load(name)
    this.state.requireActive(original)
    return withLock(this.state.locks, resourceKey(original), async () =>
      withLock(this.state.locks, "registry", async () => {
        const binding = await this.state.load(name)
        requireValue(
          binding.id === expectedId,
          "BINDING_CHANGED",
          msg("error.session_changed_before_archival"),
          4,
        )
        let ended = false
        try {
          ended = (await this.verify(binding)).dead
        } catch (error) {
          if (
            !(error instanceof BridgeError) ||
            !["BINDING_CHANGED", "PROCESS_MISSING"].includes(error.code)
          )
            throw error
          ended = true
        }
        requireValue(
          ended,
          "SESSION_CONFLICT",
          msg("error.a_live_connection_cannot_be_retired_to_reuse_its_name"),
          4,
        )
        await this.state.archive(binding)
        await this.state.audit("archive", binding.id, "connection_ended")
      }),
    )
  }

  private async createManaged(name: string, ssh?: string): Promise<Binding> {
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
      // tmux's build-dependent default may be unknown on older SSH targets.
      // Queue this before creation: -f is ignored by an already running server,
      // and new-session -e TERM is overridden by tmux's default-terminal.
      "set-option",
      "-g",
      "default-terminal",
      "screen-256color",
      ";",
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
      // Remove locale at the SSH boundary, after tmux builds the pane's
      // environment. An existing server may still retain the client's values.
      ...(ssh
        ? [
            "/usr/bin/env",
            "-u",
            "LANG",
            "-u",
            "LC_ALL",
            "-u",
            "LC_CTYPE",
            "-u",
            "LC_TERMINAL",
            "-u",
            "LC_TERMINAL_VERSION",
            "ssh",
            "-tt",
            ssh,
          ]
        : ["/bin/sh"]),
    ])
    const paneId = result.trim()
    requireValue(
      /^%\d+$/.test(paneId),
      "PROTOCOL_ERROR",
      msg("error.tmux_did_not_create_the_expected_pane"),
      8,
    )
    try {
      return await this.register(
        name,
        socket,
        paneId,
        "managed",
        ["read", "exec", "raw_send", "stop"],
        ssh,
      )
    } catch (error) {
      await tmux.run(["kill-session", "-t", `=${sessionName}`]).catch(() => {})
      throw error
    }
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
      msg("error.an_exact_pane_id_such_as_3_is_required"),
    )
    await checkTmux(this.config.minimumTmux)
    return withLock(this.state.locks, "registry", async () => {
      requireValue(
        !(await this.state.list()).some((binding) => binding.alias === name),
        "INVALID_BINDING",
        msg("error.alias_is_already_registered"),
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
    sshAlias?: string,
  ): Promise<Binding> {
    const tmux = new Tmux(socket)
    const serverInstance = await tmux.serverInstance()
    const pane = await tmux.inspect(paneId)
    requireValue(
      !pane.dead &&
        !pane.marker &&
        (await tmux.memberships(paneId)).length === 1,
      "INVALID_BINDING",
      msg(
        "error.pane_is_exited_already_marked_or_linked_into_multiple_sessions",
      ),
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
      msg("error.pane_is_already_registered"),
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
      preparation: null,
      sshAlias: sshAlias ?? null,
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

  async freezeClients(binding: Binding): Promise<void> {
    const tmux = new Tmux(binding.socketPath)
    const clients = await tmux.clients(binding.sessionId)
    for (const client of clients.filter((item) => !item.control))
      if (!(client.key in binding.clientFlags))
        binding.clientFlags[client.key] = client.readonly
    await this.state.save(binding)
    for (const client of clients.filter(
      (item) => !item.control && !item.readonly,
    ))
      await tmux.setReadonly(client.name, true, binding.sessionId)
    await this.requireReadonly(binding)
  }

  async requireReadonly(binding: Binding): Promise<void> {
    const clients = await new Tmux(binding.socketPath).clients(
      binding.sessionId,
    )
    requireValue(
      !clients.some((client) => !client.control && !client.readonly),
      "RECOVERY_REQUIRED",
      msg(
        "error.a_writable_human_client_conflicts_with_agent_preparation_or_execution",
      ),
      9,
    )
  }

  async verify(binding: Binding, write = false): Promise<Pane> {
    this.state.requireActive(binding)
    const stat = await lstat(binding.socketPath).catch((error: unknown) => {
      if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) return null
      throw privatePathError(error)
    })
    requireValue(
      stat?.isSocket() && stat.uid === process.getuid?.(),
      "BINDING_CHANGED",
      msg("error.bound_socket_is_missing_or_changed"),
      4,
    )
    const tmux = new Tmux(binding.socketPath)
    let pane: Pane
    try {
      pane = await tmux.inspect(paneTarget(binding))
    } catch (error) {
      if (error instanceof BridgeError && error.code === "TMUX_OBJECT_MISSING")
        throw new BridgeError(
          "BINDING_CHANGED",
          msg("error.bound_pane_no_longer_exists"),
          4,
        )
      throw error
    }
    requireValue(
      pane.serverInstance === binding.serverInstance &&
        pane.serverPid === binding.serverPid &&
        pane.sessionId === binding.sessionId &&
        pane.windowId === binding.windowId &&
        pane.paneId === binding.paneId &&
        (pane.pid === binding.panePid || (pane.dead && pane.pid === 0)) &&
        pane.marker === binding.marker,
      "BINDING_CHANGED",
      msg("error.bound_pane_identity_changed"),
      4,
    )
    requireValue(
      (await tmux.memberships(binding.paneId)).length === 1,
      "BINDING_CHANGED",
      msg("error.pane_is_linked_into_another_session"),
      4,
    )
    requireValue(
      (await processIdentity(binding.serverPid)) === binding.serverProcess,
      "BINDING_CHANGED",
      msg("error.tmux_server_process_changed"),
      4,
    )
    if (!pane.dead)
      requireValue(
        (await processIdentity(binding.panePid)) === binding.paneProcess,
        "BINDING_CHANGED",
        msg("error.pane_process_changed"),
        4,
      )
    if (write)
      requireValue(
        !pane.dead && !pane.synchronized && !pane.inMode,
        "SHELL_CONFIRMATION_REQUIRED",
        msg("error.pane_exited_is_in_a_tmux_mode_or_has_synchronized_input"),
        5,
      )
    return pane
  }

  requirePermission(binding: Binding, operation: Operation): void {
    if (operation !== "read") this.state.requireActive(binding)
    requireValue(
      effectivePermissions(
        this.config,
        binding.alias,
        binding.permissions,
      ).includes(operation),
      "PERMISSION_DENIED",
      msg("error.operation_is_not_authorized_for_this_binding"),
      5,
    )
  }

  async status(name: string) {
    const binding = await this.state.load(name)
    const active = await this.tasks.active(binding)
    const task = active ? await this.tasks.observe(active) : null
    const uncertain = task?.state === "unknown"
    const preparation = binding.preparation
    let preparationAlive = false
    if (preparation && !["completed", "failed"].includes(preparation.phase)) {
      try {
        preparationAlive =
          (await processIdentity(preparation.ownerPid)) ===
          preparation.ownerProcess
      } catch {
        /* Read-only status keeps a failed owner uncertain. */
      }
    }
    const lock = await inspectDirectoryLock(
      this.state.locks,
      resourceKey(binding),
    )
    const recent = await this.tasks.recent(binding)
    const displayState =
      uncertain ||
      (preparation?.phase === "failed" &&
        (preparation.inputStarted || binding.control !== "human")) ||
      (preparation &&
        !["completed", "failed"].includes(preparation.phase) &&
        !preparationAlive) ||
      lock === "dead" ||
      lock === "unknown" ||
      binding.control === "recovery_required"
        ? preparationAlive
          ? "preparing"
          : "needs_human"
        : preparationAlive
          ? "preparing"
          : task && isPending(task)
            ? "running"
            : binding.control === "agent" && binding.shell.state === "confirmed"
              ? "ready"
              : "awaiting_human"
    const nextAction = {
      action:
        displayState === "ready"
          ? "exec"
          : displayState === "awaiting_human"
            ? "confirm_ready"
            : displayState === "needs_human"
              ? binding.control === "human"
                ? "confirm_resume"
                : "takeover"
              : "wait",
      session_id: binding.id,
      requires_confirmation: ["awaiting_human", "needs_human"].includes(
        displayState,
      ),
      message:
        displayState === "ready"
          ? msg("action.execute")
          : displayState === "awaiting_human"
            ? msg("action.ready", { id: binding.id })
            : displayState === "needs_human"
              ? binding.control === "human"
                ? msg("action.resume")
                : msg("action.takeover")
              : msg("action.wait"),
    }
    const details = {
      session_id: binding.id,
      ssh_entry: binding.sshAlias,
      preparation: preparation
        ? {
            operation_id: preparation.id,
            phase: preparation.phase,
            input_started: preparation.inputStarted,
            coordinator_alive: preparationAlive,
            reason: preparation.reason,
          }
        : null,
      local_lock: lock,
      recent_requests: recent.map((item) => ({
        request_id: item.id,
        execution_state: item.state,
        exit_code: item.exitCode,
        created_at: item.createdAt,
      })),
    }
    if (this.state.isHistorical(binding))
      return {
        session: name,
        ...details,
        lifecycle: "archived",
        display_state: "archived",
        binding: "archived",
        control: "recovery_required",
        pane: { id: binding.paneId, state: "historical", pid: null },
        shell: {
          state: "unknown",
          profile: null,
          endpoint_label: null,
          bash_version: null,
        },
        task: { state: task?.state ?? "idle", request_id: task?.id ?? null },
        permissions: effectivePermissions(
          this.config,
          name,
          binding.permissions,
        ).filter((value) => value === "read"),
        next_action: {
          action: "query_history",
          session_id: binding.id,
          requires_confirmation: false,
          message: msg("action.history"),
        },
      }
    try {
      const pane = await this.verify(binding)
      return {
        session: name,
        ...details,
        lifecycle: "active",
        display_state: pane.dead ? "connection_ended" : displayState,
        next_action: pane.dead
          ? {
              action: "reconnect",
              session_id: binding.id,
              requires_confirmation: true,
              message: msg("action.exited"),
            }
          : nextAction,
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
          endpoint_source:
            pane.dead || uncertain || binding.shell.endpoint === null
              ? null
              : "shell_reported",
          user: pane.dead || uncertain ? null : binding.shell.user,
          cwd: pane.dead || uncertain ? null : binding.shell.cwd,
          bash_version: pane.dead || uncertain ? null : binding.shell.version,
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
        error instanceof BridgeError &&
        ["LOCAL_ACCESS_DENIED", "PROCESS_IDENTITY_UNKNOWN"].includes(error.code)
      )
        return {
          ok: false,
          session: name,
          ...details,
          lifecycle: "active",
          display_state:
            error.code === "LOCAL_ACCESS_DENIED"
              ? "access_denied"
              : "inspection_failed",
          binding: "unverified",
          control: binding.control,
          pane: { id: binding.paneId, state: "unknown", pid: null },
          shell: {
            state: "unknown",
            profile: null,
            endpoint_label: null,
            bash_version: null,
          },
          task: { state: task?.state ?? "idle", request_id: task?.id ?? null },
          permissions: [],
          error: {
            code: error.code,
            message: error.userMessage,
            retryable: false,
          },
          next_action: {
            action: "inspect_local_access",
            session_id: binding.id,
            requires_confirmation: true,
            message: msg("action.local_access"),
          },
        }
      if (
        !(error instanceof BridgeError) ||
        !["BINDING_CHANGED", "PROCESS_MISSING"].includes(error.code)
      )
        throw error
      return {
        session: name,
        ...details,
        display_state: "connection_ended",
        next_action: {
          action: "reconnect",
          session_id: binding.id,
          requires_confirmation: true,
          message: msg("action.reconnect"),
        },
        binding: "stale",
        pane: { id: binding.paneId, state: "missing", pid: null },
        shell: {
          state: "unknown",
          profile: null,
          endpoint_label: null,
          bash_version: null,
        },
        control: "recovery_required",
        task: { state: task?.state ?? "unknown", request_id: task?.id ?? null },
        permissions: [],
      }
    }
  }

  async showSessionId(binding: Binding): Promise<void> {
    if (binding.ownership !== "managed") return
    await this.verify(binding)
    const tmux = new Tmux(binding.socketPath)
    for (const [option, value] of [
      ["status", "on"],
      ["status-left-length", "120"],
      ["status-right-length", "0"],
      [
        "status-left",
        `Bridge | ${binding.alias} | session_id=${binding.id} | Login, then hand over in Agent chat`,
      ],
      ["status-right", ""],
      ["status-justify", "left"],
    ] as const)
      await tmux.run(["set-option", "-t", binding.sessionId, option, value])
  }

  async attach(name: string, writable: boolean) {
    const original = await this.state.load(name)
    let child: ReturnType<Tmux["attach"]> | undefined
    try {
      await withLock(this.state.locks, resourceKey(original), async () => {
        const binding = await this.state.load(name)
        this.requirePermission(binding, "read")
        await this.verify(binding)
        requireValue(
          !writable || binding.control === "human",
          "PERMISSION_DENIED",
          msg("error.take_over_before_attaching_with_input_permission"),
          5,
        )
        const tmux = new Tmux(binding.socketPath)
        const proc = tmux.attach(binding.sessionId)
        child = proc
        const deadline = performance.now() + 5000
        while (performance.now() < deadline) {
          if (proc.exitCode !== null) return
          const client = (await tmux.clients(binding.sessionId)).find(
            (item) => item.pid === proc.pid,
          )
          if (client) {
            if (writable)
              await tmux.setReadonly(client.name, false, binding.sessionId)
            return
          }
          await Bun.sleep(10)
        }
        throw new BridgeError(
          "TIMEOUT",
          msg("error.terminal_client_did_not_attach_before_its_deadline"),
          7,
        )
      })
      requireValue(
        child,
        "LOCAL_IO_ERROR",
        msg("error.terminal_client_was_not_created"),
        8,
      )
      return await child.exited
    } finally {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM")
        await child.exited
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
        msg("error.no_alternate_screen_exists"),
        5,
      )
    if (screen === "mode") {
      const commands = await new Tmux(binding.socketPath).run(["list-commands"])
      requireValue(
        tmuxCommandCapabilities(commands).capture_mode_screen,
        "UNSUPPORTED_CAPABILITY",
        msg("error.this_tmux_build_cannot_capture_copy_mode_screens"),
        3,
      )
      requireValue(
        pane.inMode,
        "SCREEN_MISSING",
        msg("error.pane_is_not_in_a_tmux_mode"),
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
      msg("error.terminal_screen_changed_during_capture_inspect_it_again"),
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
        msg("error.raw_input_requires_human_control"),
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
          msg(
            "error.input_may_be_partial_inspect_the_terminal_and_explicitly_hand_control_back_to_human",
          ),
          8,
          false,
          "unknown",
        )
      }
      return { session: name, sent: true, completed: false, exit_code: null }
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
        await this.state.archive(binding)
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
        msg("error.external_panes_can_only_be_unbound"),
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
