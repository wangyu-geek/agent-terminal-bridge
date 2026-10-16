import { ControlClient } from "./control.ts"
import { BridgeError, requireValue } from "./errors.ts"
import { processIdentity } from "./identity.ts"
import { digest, withLock } from "./locking.ts"
import { type Binding, emptyShell } from "./models.ts"
import { FrameParser } from "./protocol.ts"
import type { Sessions } from "./session.ts"
import { shellInitialization } from "./shell.ts"
import { resourceKey } from "./state.ts"
import { isPending, type Task, Tasks } from "./tasks.ts"
import { randomNonce, Tmux } from "./tmux.ts"
import { requestId } from "./validate.ts"

export type ExecutionPhase =
  | "prepared"
  | "dispatched"
  | "running"
  | "before_commit"
  | "committed"
interface ExecutionHooks {
  at?: (phase: ExecutionPhase, task: Readonly<Task>) => Promise<void>
}

export class Executor {
  readonly tasks: Tasks
  constructor(
    readonly sessions: Sessions,
    readonly hooks: ExecutionHooks = {},
  ) {
    this.tasks = new Tasks(sessions.state)
  }

  async initialize(name: string) {
    const original = await this.sessions.state.load(name)
    return withLock(
      this.sessions.state.locks,
      resourceKey(original),
      async () => {
        const binding = await this.sessions.state.load(name)
        this.sessions.requirePermission(binding, "exec")
        await this.sessions.verify(binding, true)
        await this.tasks.requireIdle(binding)
        requireValue(
          binding.control === "human",
          "PERMISSION_DENIED",
          "Initialization requires human control",
          5,
        )
        const nonce = randomNonce()
        binding.shell = { ...emptyShell("pending"), nonce }
        await this.sessions.state.save(binding)
        await this.sessions.state.audit("shell-init", binding.id, "pending")
        return {
          session: name,
          profile: "bash-v1",
          code: shellInitialization(nonce),
          instructions:
            "Review and paste this code only into the selected Bash >=3.2 prompt; then confirm the expected hostname. The ready command performs automatic preparation after explicit handoff.",
        }
      },
    )
  }

  async confirmShell(name: string, expectedHost: string, timeout: number) {
    requireValue(
      expectedHost.length > 0 &&
        Buffer.byteLength(expectedHost) <= 255 &&
        !expectedHost.includes("\n"),
      "INVALID_INPUT",
      "An expected hostname is required",
    )
    const original = await this.sessions.state.load(name)
    return withLock(
      this.sessions.state.locks,
      resourceKey(original),
      async () => {
        const binding = await this.sessions.state.load(name)
        this.sessions.requirePermission(binding, "exec")
        requireValue(
          binding.control === "human" &&
            binding.shell.state === "pending" &&
            binding.shell.nonce,
          "SHELL_CONFIRMATION_REQUIRED",
          "Generate and install shell initialization first",
          5,
        )
        await this.tasks.requireIdle(binding)
        const transaction = await this.transaction(
          binding,
          `probe-${randomNonce()}`,
          "probe",
          expectedHost,
          timeout,
        )
        const probe = transaction.parser?.probe
        if (!transaction.result.ok || !probe || probe.host !== expectedHost) {
          if (probe && probe.host !== expectedHost) {
            binding.shell = emptyShell("unknown")
            binding.control = "human"
            await this.sessions.state.save(binding)
            throw new BridgeError(
              "ENDPOINT_MISMATCH",
              "Reported hostname does not match the user-confirmed destination",
              5,
            )
          }
          throw new BridgeError(
            "SHELL_CONFIRMATION_REQUIRED",
            "Shell handshake did not complete; inspect the session and recover",
            9,
          )
        }
        binding.shell = {
          state: "confirmed",
          nonce: binding.shell.nonce,
          endpoint: probe.host,
          user: probe.user,
          cwd: probe.cwd,
          version: probe.bashVersion,
        }
        await this.sessions.state.save(binding)
        return {
          session: name,
          shell: {
            state: "confirmed",
            profile: "bash-v1",
            endpoint_label: probe.host,
            endpoint_source: "user_confirmed_and_shell_reported",
            user: probe.user,
            cwd: probe.cwd,
          },
        }
      },
    )
  }

  async execute(name: string, id: string, command: string, timeout: number) {
    requestId(id)
    requireValue(
      command.length > 0 &&
        !command.includes("\0") &&
        Buffer.byteLength(command) <= this.sessions.config.maxCommandBytes,
      "COMMAND_TOO_LARGE",
      "Command is empty, contains NUL or exceeds its byte limit",
    )
    const original = await this.sessions.state.load(name)
    let dispatched = false
    try {
      return await withLock(
        this.sessions.state.locks,
        resourceKey(original),
        async () => {
          const binding = await this.sessions.state.load(name)
          this.sessions.requirePermission(binding, "exec")
          const existing = await this.tasks.get(binding, id)
          if (existing) {
            requireValue(
              existing.fingerprint === digest(command) &&
                existing.kind === "run",
              "REQUEST_CONFLICT",
              "Request ID is already associated with another command",
            )
            return taskResult(binding, await this.tasks.observe(existing))
          }
          await this.tasks.requireIdle(binding)
          requireValue(
            binding.control === "agent" &&
              binding.shell.state === "confirmed" &&
              binding.shell.nonce,
            "SHELL_CONFIRMATION_REQUIRED",
            "A confirmed shell and Agent control are required",
            5,
          )
          return (
            await this.transaction(binding, id, "run", command, timeout, () => {
              dispatched = true
            })
          ).result
        },
      )
    } catch (error) {
      if (
        !dispatched ||
        (error instanceof BridgeError && error.executionState === "unknown")
      )
        throw error
      throw new BridgeError(
        "STATE_ERROR",
        "Execution coordination failed after dispatch; inspect durable request history",
        8,
        false,
        "unknown",
      )
    }
  }

  // The preparation coordinator holds the resource lock for installation,
  // this probe and the final ownership commit.
  async probeLocked(binding: Binding, timeout: number, expectedHost?: string) {
    const transaction = await this.transaction(
      binding,
      `probe-${randomNonce()}`,
      "probe",
      expectedHost ?? "",
      timeout,
    )
    const probe = transaction.parser?.probe
    requireValue(
      transaction.result.ok && probe,
      "SHELL_CONFIRMATION_REQUIRED",
      "Shell handshake failed; take over, inspect the terminal and resume",
      9,
    )
    requireValue(
      expectedHost === undefined || probe.host === expectedHost,
      "ENDPOINT_MISMATCH",
      "Reported hostname does not match the explicitly requested destination",
      5,
    )
    return probe
  }

  async query(name: string, id: string) {
    const binding = await this.sessions.state.load(name)
    this.sessions.requirePermission(binding, "read")
    const task = await this.tasks.get(binding, requestId(id))
    requireValue(task, "REQUEST_MISSING", "Request does not exist", 4)
    return taskResult(binding, await this.tasks.observe(task))
  }

  async recover(name: string, id: string) {
    const original = await this.sessions.state.load(name)
    return withLock(
      this.sessions.state.locks,
      resourceKey(original),
      async () => {
        const binding = await this.sessions.state.load(name)
        const task = await this.tasks.get(binding, requestId(id))
        requireValue(
          task && isPending(task),
          "RECOVERY_REQUIRED",
          "No matching unresolved request exists",
          9,
        )
        const active = await this.tasks.active(binding)
        requireValue(
          !active || active.id === id,
          "REQUEST_CONFLICT",
          "Another unresolved request is active",
        )
        task.state = "unknown"
        task.exitCode = null
        task.recovered = true
        task.reason = "OPERATOR_RECOVERED"
        task.updatedAt = new Date().toISOString()
        await this.tasks.save(binding, task)
        await this.tasks.setActive(binding, null)
        binding.shell = emptyShell("unknown")
        binding.control = "human"
        binding.generation = randomNonce()
        try {
          await this.sessions.restoreClients(binding)
        } catch (error) {
          if (
            !(error instanceof BridgeError) ||
            error.code !== "BINDING_CHANGED"
          )
            throw error
        }
        await this.sessions.state.save(binding)
        await this.sessions.state.audit(
          "recover",
          binding.id,
          "manual_recovery_recorded",
        )
        return {
          session: name,
          request_id: id,
          execution_state: "unknown",
          completed: false,
          exit_code: null,
          recovery_recorded: true,
          shell_reinitialization_required: true,
        }
      },
    )
  }

  async signal(name: string, id: string, type: "interrupt" | "takeover") {
    const binding = await this.sessions.state.load(name)
    return withLock(
      this.sessions.state.locks,
      `metadata:${resourceKey(binding)}`,
      async () => {
        const active = await this.tasks.active(binding)
        requireValue(
          active && active.id === requestId(id) && isPending(active),
          "REQUEST_MISSING",
          "No matching active request exists",
          4,
        )
        requireValue(
          (await this.tasks.observe(active)).state !== "unknown",
          "RECOVERY_REQUIRED",
          "No live execution coordinator remains; use explicit manual takeover",
          9,
        )
        await this.sessions.verify(binding, true)
        const old = await this.tasks.control(binding)
        const request = {
          id,
          generation: binding.generation,
          nonce: randomNonce(),
          type:
            old?.id === id && old.type === "takeover"
              ? ("takeover" as const)
              : type,
        }
        await this.tasks.saveControl(binding, request)
        await this.sessions.state.audit(type, binding.id, "requested")
        return {
          session: name,
          request_id: id,
          requested: true,
          sent: false,
          remote_processes_stopped: null,
        }
      },
    )
  }

  async takeover(name: string, id: string) {
    const original = await this.sessions.state.load(name)
    try {
      return await withLock(
        this.sessions.state.locks,
        resourceKey(original),
        async () => {
          const binding = await this.sessions.state.load(name)
          const task = await this.tasks.active(binding)
          requireValue(
            task && task.id === requestId(id) && isPending(task),
            "REQUEST_MISSING",
            "No matching unresolved request exists",
            4,
          )
          task.state = "unknown"
          task.exitCode = null
          task.reason = "MANUAL_TAKEOVER"
          await this.tasks.save(binding, task)
          binding.shell = emptyShell("unknown")
          binding.control = "human"
          try {
            await this.sessions.restoreClients(binding)
          } catch (error) {
            if (
              !(error instanceof BridgeError) ||
              error.code !== "BINDING_CHANGED"
            )
              throw error
          }
          await this.sessions.state.save(binding)
          return {
            session: name,
            control: "human",
            request_id: id,
            recovery_required: true,
          }
        },
      )
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== "BUSY") throw error
      return this.signal(name, id, "takeover")
    }
  }

  private async transaction(
    binding: Binding,
    id: string,
    kind: "run" | "probe",
    input: string,
    timeout: number,
    beforeInput: () => void = () => {},
  ) {
    const start = performance.now()
    const deadline = start + timeout * 1000
    const preparing =
      binding.preparation !== null && binding.preparation.phase !== "completed"
    requireValue(
      binding.shell.nonce && /^[a-f0-9]{32}$/.test(binding.shell.nonce),
      "SHELL_CONFIRMATION_REQUIRED",
      "Current shell initialization is missing",
      5,
    )
    const pane = await this.sessions.verify(binding, true)
    requireValue(
      !pane.alternate,
      "SHELL_CONFIRMATION_REQUIRED",
      "Alternate-screen applications cannot receive exec requests",
      5,
    )
    const tmux = new Tmux(binding.socketPath)
    const panes = (
      await tmux.run([
        "list-panes",
        "-s",
        "-t",
        binding.sessionId,
        "-F",
        "#{pane_id}",
      ])
    )
      .trim()
      .split("\n")
    requireValue(
      panes.length === 1 && panes[0] === binding.paneId,
      "UNSUPPORTED_CAPABILITY",
      "exec requires a dedicated single-pane session",
      3,
    )
    await this.checkClients(binding, kind, preparing)
    const nonce = randomNonce()
    const line = `__atb_${binding.shell.nonce} ${kind} ${nonce}${kind === "run" ? ` ${Buffer.from(input).toString("base64")}` : ""}`
    requireValue(
      Buffer.byteLength(line) <= this.sessions.config.maxInputLineBytes,
      "COMMAND_TOO_LARGE",
      "Encoded execution line exceeds its limit",
    )
    const parser = new FrameParser(
      binding.shell.nonce,
      nonce,
      kind,
      this.sessions.config.maxOutputBytes,
    )
    const now = new Date().toISOString()
    const task: Task = {
      schemaVersion: 1,
      id,
      bindingId: binding.id,
      generation: binding.generation,
      nonce,
      kind,
      fingerprint: digest(input),
      state: "prepared",
      exitCode: null,
      reason: null,
      ownerPid: process.pid,
      ownerProcess: await processIdentity(process.pid),
      createdAt: now,
      updatedAt: now,
      durationMs: null,
      interruptSent: false,
      recovered: false,
    }
    await this.tasks.save(binding, task)
    await this.tasks.setActive(binding, task)
    await this.hooks.at?.("prepared", task)
    let control: ControlClient | undefined
    let sent = false
    let changed = false
    let lastSignal = ""
    try {
      control = await ControlClient.open(
        binding,
        (bytes) => parser.feed(bytes),
        () => {
          changed = true
        },
        deadline,
      )
      await this.sessions.verify(binding, true)
      // Persist the dispatch claim before any terminal input; an interrupted send is unknown.
      task.state = "sent"
      await this.tasks.save(binding, task)
      sent = true
      beforeInput()
      await control.sendLine(line, deadline)
      await this.hooks.at?.("dispatched", task)
      let nextInspection = 0
      while (!parser.completed && !parser.rejected) {
        control.check()
        if (changed)
          throw new BridgeError(
            "BINDING_CHANGED",
            "Terminal topology or mode changed during execution",
            4,
          )
        if (performance.now() >= deadline)
          throw new BridgeError(
            "TIMEOUT",
            "Deadline exceeded; the remote command may still be running",
            7,
          )
        if (parser.running && task.state !== "running") {
          task.state = "running"
          await this.tasks.save(binding, task)
          await this.hooks.at?.("running", task)
        }
        const signal = await this.tasks.control(binding)
        if (
          signal &&
          signal.id === id &&
          signal.generation === binding.generation &&
          signal.nonce !== lastSignal
        ) {
          lastSignal = signal.nonce
          await this.sessions.verify(binding, true)
          if (signal.type === "takeover")
            throw new BridgeError(
              "MANUAL_TAKEOVER",
              "User requested manual takeover; command outcome is uncertain",
              9,
            )
          await control.command(`send-keys -t ${binding.paneId} C-c`, deadline)
          task.interruptSent = true
          await this.tasks.save(binding, task)
        }
        if (performance.now() >= nextInspection) {
          await this.sessions.verify(binding, true)
          await this.checkClients(binding, kind, preparing)
          nextInspection = performance.now() + 200
        }
        await Bun.sleep(20)
      }
      control.check()
      if (changed)
        throw new BridgeError(
          "BINDING_CHANGED",
          "Terminal changed before completion was committed",
          4,
        )
      if (parser.completedAt !== null && parser.completedAt > deadline)
        throw new BridgeError(
          "TIMEOUT",
          "Completion arrived after the execution deadline",
          7,
        )
      task.state = parser.rejected ? "not_started" : "completed"
      task.exitCode = parser.exitCode
      task.reason = parser.rejected
      if (parser.rejected) {
        binding.shell = emptyShell("unknown")
        binding.control = preparing ? "recovery_required" : "human"
        if (!preparing) await this.sessions.restoreClients(binding)
        await this.sessions.state.save(binding)
      }
      task.durationMs = Math.round(performance.now() - start)
      task.updatedAt = new Date().toISOString()
      await this.hooks.at?.("before_commit", task)
      await this.sessions.state.audit(
        kind === "run" ? "exec" : "probe",
        binding.id,
        task.state,
      )
      await this.tasks.save(binding, task)
      await this.tasks.setActive(binding, null)
      await this.hooks.at?.("committed", task)
      const output = parser.finish()
      return {
        parser,
        result: {
          ...taskResult(binding, task),
          output_available: true,
          terminal_output: output,
          truncated: parser.output.truncated,
          encoding_lossy: parser.output.encodingLossy,
        },
      }
    } catch (error) {
      const failure =
        error instanceof BridgeError
          ? error
          : new BridgeError(
              "LOCAL_IO_ERROR",
              "Local execution coordination failed",
            )
      task.state = sent ? "unknown" : "not_started"
      task.exitCode = null
      task.reason = failure.code
      task.durationMs = Math.round(performance.now() - start)
      task.updatedAt = new Date().toISOString()
      binding.shell = emptyShell("unknown")
      binding.control =
        (preparing || sent) && failure.code !== "MANUAL_TAKEOVER"
          ? "recovery_required"
          : "human"
      if (failure.code === "MANUAL_TAKEOVER")
        await this.sessions.restoreClients(binding)
      try {
        await this.tasks.save(binding, task)
        if (!sent) await this.tasks.setActive(binding, null)
        await this.sessions.state.save(binding)
      } catch {
        throw new BridgeError(
          "STATE_ERROR",
          "Cannot persist execution outcome; the durable dispatch claim remains unresolved",
          8,
          false,
          sent ? "unknown" : "not_started",
        )
      }
      const output = parser.finish()
      return {
        parser,
        result: {
          ...taskResult(binding, task),
          output_available: true,
          terminal_output: output,
          truncated: parser.output.truncated,
          encoding_lossy: parser.output.encodingLossy,
        },
      }
    } finally {
      await control?.close()
    }
  }

  private async checkClients(
    binding: Binding,
    kind: "run" | "probe",
    preparing = false,
  ) {
    if (kind === "probe" && !preparing) return
    await this.sessions.requireReadonly(binding)
  }
}

export function taskResult(binding: Binding, task: Task) {
  const completed = task.state === "completed"
  const ok = completed && task.exitCode === 0
  const code = completed
    ? "REMOTE_EXIT_NONZERO"
    : (task.reason ?? (task.state === "unknown" ? "RECOVERY_REQUIRED" : "BUSY"))
  return {
    ok,
    session: binding.alias,
    session_id: binding.id,
    request_id: task.id,
    execution_state: task.state,
    completed,
    exit_code: completed ? task.exitCode : null,
    output_source: "shared_pty_between_frames",
    output_format: "sanitized_stream",
    output_available: false,
    terminal_output: "",
    truncated: false,
    encoding_lossy: false,
    duration_ms: task.durationMs,
    recovery_required: isPending(task),
    recovered: task.recovered,
    interrupt_sent: task.interruptSent,
    error: ok
      ? null
      : {
          code,
          message: completed
            ? "Remote command exited with a nonzero status"
            : "Request did not reach a confirmed completion; inspect its recorded state",
          retryable: false,
        },
  }
}

export function resultExitCode(result: ReturnType<typeof taskResult>): number {
  if (result.ok) return 0
  if (result.completed) return 1
  if (result.error?.code === "TIMEOUT") return 7
  if (
    [
      "PROTOCOL_ERROR",
      "LOCAL_IO_ERROR",
      "CONNECTION_LOST",
      "STATE_ERROR",
    ].includes(result.error?.code ?? "")
  )
    return 8
  if (result.execution_state === "unknown" || result.recovery_required) return 9
  return 8
}
