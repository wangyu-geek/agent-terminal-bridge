import { ControlClient } from "./control.ts"
import { BridgeError, requireValue } from "./errors.ts"
import { Executor } from "./executor.ts"
import { msg } from "./i18n.ts"
import { processIdentity } from "./identity.ts"
import {
  inspectDirectoryLock,
  recoverDirectoryLock,
  withLock,
} from "./locking.ts"
import { type Binding, emptyShell, type PreparationPhase } from "./models.ts"
import { FrameParser } from "./protocol.ts"
import type { Sessions } from "./session.ts"
import { shellBootstrap, shellInitialization } from "./shell.ts"
import { resourceKey } from "./state.ts"
import { isPending } from "./tasks.ts"
import { randomNonce, Tmux } from "./tmux.ts"

export interface WorkflowHooks {
  at?: (phase: PreparationPhase, binding: Readonly<Binding>) => Promise<void>
  afterChunk?: (sequence: number, binding: Readonly<Binding>) => Promise<void>
}

export class Workflow {
  readonly executor: Executor
  constructor(
    readonly sessions: Sessions,
    readonly hooks: WorkflowHooks = {},
  ) {
    this.executor = new Executor(sessions)
  }

  async ready(name: string, timeout: number, expectedHost?: string) {
    const original = await this.sessions.state.load(name)
    return withLock(
      this.sessions.state.locks,
      resourceKey(original),
      async () =>
        this.prepareLocked(
          await this.sessions.state.load(name),
          timeout,
          expectedHost,
        ),
    )
  }

  private async prepareLocked(
    binding: Binding,
    timeout: number,
    expectedHost?: string,
  ) {
    this.sessions.requirePermission(binding, "exec")
    const pane = await this.sessions.verify(binding, true)
    requireValue(
      !pane.alternate,
      "SHELL_CONFIRMATION_REQUIRED",
      msg(
        "error.leave_the_alternate_screen_application_before_handing_over_the_shell",
      ),
      5,
    )
    await this.executor.tasks.requireIdle(binding)
    if (binding.control === "agent" && binding.shell.state === "confirmed") {
      await this.sessions.requireReadonly(binding)
      requireValue(
        expectedHost === undefined || expectedHost === binding.shell.endpoint,
        "ENDPOINT_MISMATCH",
        msg(
          "error.the_previous_shell_report_does_not_match_the_requested_host",
        ),
        5,
      )
      return this.readyResult(binding, true)
    }
    requireValue(
      binding.control === "human" &&
        (!binding.preparation?.inputStarted ||
          binding.preparation.phase === "completed"),
      "RECOVERY_REQUIRED",
      msg(
        "error.take_over_inspect_the_terminal_and_use_resume_before_preparing_again",
      ),
      9,
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
      msg("error.preparation_requires_a_dedicated_single_pane_session"),
      3,
    )
    const deadline = performance.now() + timeout * 1000
    const nonce = randomNonce()
    binding.generation = randomNonce()
    binding.shell = { ...emptyShell("pending"), nonce }
    binding.control = "recovery_required"
    binding.preparation = {
      id: randomNonce(),
      generation: binding.generation,
      phase: "freezing",
      inputStarted: false,
      ownerPid: process.pid,
      ownerProcess: await processIdentity(process.pid),
      reason: null,
      startedAt: new Date().toISOString(),
    }
    await this.sessions.state.save(binding)
    let control: ControlClient | undefined
    let parser: FrameParser | undefined
    let changed = false
    try {
      await this.hooks.at?.("freezing", binding)
      await this.sessions.freezeClients(binding)
      control = await ControlClient.open(
        binding,
        (bytes) => parser?.feed(bytes),
        () => {
          changed = true
        },
        deadline,
      )
      const check = async () => {
        control?.check()
        requireValue(
          !changed && performance.now() < deadline,
          changed ? "BINDING_CHANGED" : "TIMEOUT",
          msg("error.preparation_stopped_take_over_and_inspect_the_terminal"),
          changed ? 4 : 7,
        )
        await this.sessions.verify(binding, true)
        await this.sessions.requireReadonly(binding)
      }
      const send = async (request: string, line: string) => {
        requireValue(
          Buffer.byteLength(line) <= this.sessions.config.maxInputLineBytes,
          "COMMAND_TOO_LARGE",
          msg(
            "error.initialization_transfer_line_exceeds_the_configured_limit",
          ),
        )
        await check()
        parser = new FrameParser(nonce, request, "install", 64)
        await control?.sendLine(line, deadline)
        while (!parser.completed && !parser.rejected) {
          await check()
          await Bun.sleep(10)
        }
        requireValue(
          !parser.rejected,
          "SHELL_CONFIRMATION_REQUIRED",
          msg(
            "error.the_target_rejected_initialization_take_over_inspect_and_resume",
            { rejected: String(parser.rejected) },
          ),
          9,
        )
        requireValue(
          parser.completedAt !== null && parser.completedAt <= deadline,
          "TIMEOUT",
          msg(
            "error.initialization_acknowledgement_arrived_after_its_deadline",
          ),
          7,
        )
      }
      const initialRequest = randomNonce()
      const bootstrap = shellBootstrap(nonce, initialRequest)
      const encoded = Buffer.from(shellInitialization(nonce)).toString("base64")
      requireValue(
        Buffer.byteLength(bootstrap) <= this.sessions.config.maxInputLineBytes,
        "COMMAND_TOO_LARGE",
        msg(
          "error.initialization_bootstrap_exceeds_the_configured_input_limit",
        ),
      )
      binding.preparation.phase = "transferring"
      binding.preparation.inputStarted = true
      await this.sessions.state.save(binding)
      await this.hooks.at?.("transferring", binding)
      await send(initialRequest, bootstrap)
      let sequence = 0
      for (let offset = 0; offset < encoded.length; offset += 384) {
        const request = randomNonce()
        await send(
          request,
          `__atb_load_${nonce} append ${request} ${sequence} ${encoded.slice(offset, offset + 384)}`,
        )
        await this.hooks.afterChunk?.(sequence, binding)
        sequence++
      }
      const commit = randomNonce()
      await send(
        commit,
        `__atb_load_${nonce} commit ${commit} ${sequence} ${encoded.length}`,
      )
      await control.close()
      control = undefined
      binding.preparation.phase = "handshaking"
      await this.sessions.state.save(binding)
      await this.hooks.at?.("handshaking", binding)
      const remaining = (deadline - performance.now()) / 1000
      requireValue(
        remaining > 0,
        "TIMEOUT",
        msg("error.preparation_deadline_expired_before_handshake"),
        7,
      )
      const probe = await this.executor.probeLocked(
        binding,
        remaining,
        expectedHost,
      )
      await this.sessions.requireReadonly(binding)
      await this.sessions.verify(binding, true)
      binding.shell = {
        state: "confirmed",
        nonce,
        endpoint: probe.host,
        user: probe.user,
        cwd: probe.cwd,
        version: probe.bashVersion,
      }
      binding.control = "agent"
      binding.preparation.phase = "completed"
      await this.hooks.at?.("completed", binding)
      await this.sessions.state.save(binding)
      await this.sessions.state.audit("ready", binding.id, "completed")
      return this.readyResult(binding, false)
    } catch (error) {
      const failure =
        error instanceof BridgeError
          ? error
          : new BridgeError(
              "LOCAL_IO_ERROR",
              msg(
                "error.preparation_failed_inspect_the_session_before_resuming",
              ),
            )
      binding.preparation.phase = "failed"
      binding.preparation.reason = failure.code
      binding.shell = emptyShell("unknown")
      binding.control = binding.preparation.inputStarted
        ? "recovery_required"
        : "human"
      if (!binding.preparation.inputStarted) {
        try {
          await this.sessions.restoreClients(binding)
        } catch {
          binding.control = "recovery_required"
        }
      }
      await this.sessions.state.save(binding)
      throw new BridgeError(
        failure.code,
        failure.userMessage,
        failure.exitCode,
        false,
        binding.preparation.inputStarted ? "unknown" : "not_started",
      )
    } finally {
      await control?.close()
    }
  }

  private readyResult(binding: Binding, existing: boolean) {
    return {
      session: binding.alias,
      session_id: binding.id,
      ready: true,
      already_ready: existing,
      control: binding.control,
      shell: {
        state: binding.shell.state,
        profile: "bash-v1",
        endpoint_label: binding.shell.endpoint,
        endpoint_source: "shell_reported",
        user: binding.shell.user,
        cwd: binding.shell.cwd,
        bash_version: binding.shell.version,
      },
    }
  }

  private async recoverDeadLocks(binding: Binding) {
    for (const key of [
      "registry",
      "audit",
      `metadata:${resourceKey(binding)}`,
      resourceKey(binding),
    ]) {
      const state = await inspectDirectoryLock(this.sessions.state.locks, key)
      requireValue(
        state !== "unknown",
        "LOCK_OWNER_UNKNOWN",
        msg(
          "error.lock_ownership_is_incomplete_or_unverifiable_stop_bridge_writers_for_maintenance",
        ),
        9,
      )
      if (state === "dead")
        await recoverDirectoryLock(this.sessions.state.locks, key)
    }
  }

  async takeover(name: string, timeout: number) {
    let binding = await this.sessions.state.load(name)
    this.sessions.requirePermission(binding, "exec")
    const active = await this.executor.tasks.active(binding)
    const observed = active ? await this.executor.tasks.observe(active) : null
    if (
      observed &&
      observed.kind === "run" &&
      isPending(observed) &&
      observed.state !== "unknown"
    ) {
      try {
        await this.executor.takeover(name, observed.id)
      } catch (error) {
        if (
          !(error instanceof BridgeError) ||
          !["REQUEST_MISSING", "BINDING_CHANGED", "PROCESS_MISSING"].includes(
            error.code,
          )
        )
          throw error
        // Completion may commit between the read and the cooperative request.
      }
    }
    const deadline = performance.now() + timeout * 1000
    while (
      (await inspectDirectoryLock(
        this.sessions.state.locks,
        resourceKey(binding),
      )) === "held"
    ) {
      requireValue(
        performance.now() < deadline,
        "TIMEOUT",
        msg("error.takeover_is_not_yet_complete_inspect_status_before_typing"),
        7,
      )
      await Bun.sleep(20)
    }
    await this.recoverDeadLocks(binding)
    return withLock(
      this.sessions.state.locks,
      resourceKey(binding),
      async () => {
        binding = await this.sessions.state.load(name)
        const current = await this.executor.tasks.active(binding)
        if (current && isPending(current)) {
          current.state = "unknown"
          current.exitCode = null
          current.reason = "MANUAL_TAKEOVER"
          await this.executor.tasks.save(binding, current)
        }
        binding.control = "human"
        binding.shell = emptyShell("unknown")
        if (binding.preparation?.phase === "completed")
          binding.preparation = null
        const ended = await this.connectionEnded(binding)
        if (!ended) await this.sessions.restoreClients(binding)
        await this.sessions.state.save(binding)
        await this.sessions.state.audit(
          "takeover",
          binding.id,
          ended ? "connection_ended" : "human",
        )
        const needsRecovery =
          Boolean(current && isPending(current)) ||
          Boolean(binding.preparation?.inputStarted)
        if (ended) return this.endedResult(binding, false, needsRecovery)
        return {
          session: name,
          session_id: binding.id,
          control: "human",
          taken_over: true,
          recovery_required: needsRecovery,
        }
      },
    )
  }

  async resume(name: string, timeout: number, expectedHost?: string) {
    const original = await this.sessions.state.load(name)
    this.sessions.requirePermission(original, "exec")
    await this.recoverDeadLocks(original)
    return withLock(
      this.sessions.state.locks,
      resourceKey(original),
      async () => {
        const binding = await this.sessions.state.load(name)
        requireValue(
          binding.control === "human",
          "RECOVERY_REQUIRED",
          msg("error.take_over_and_inspect_the_terminal_before_resuming"),
          9,
        )
        const active = await this.executor.tasks.active(binding)
        if (active && isPending(active)) {
          active.state = "unknown"
          active.exitCode = null
          active.recovered = true
          active.reason = "OPERATOR_RECOVERED"
          active.updatedAt = new Date().toISOString()
          await this.executor.tasks.save(binding, active)
        }
        await this.executor.tasks.setActive(binding, null)
        binding.preparation = null
        binding.shell = emptyShell("unknown")
        await this.sessions.state.save(binding)
        if (await this.connectionEnded(binding))
          return this.endedResult(binding, true, false)
        return this.prepareLocked(binding, timeout, expectedHost)
      },
    )
  }

  private async connectionEnded(binding: Binding): Promise<boolean> {
    try {
      return (await this.sessions.verify(binding)).dead
    } catch (error) {
      if (
        error instanceof BridgeError &&
        ["BINDING_CHANGED", "PROCESS_MISSING"].includes(error.code)
      )
        return true
      throw error
    }
  }

  private endedResult(
    binding: Binding,
    recoveryRecorded: boolean,
    needsRecovery: boolean,
  ) {
    return {
      ok: false,
      session: binding.alias,
      session_id: binding.id,
      ready: false,
      taken_over: false,
      control: "human",
      connection_ended: true,
      display_state: "connection_ended",
      recovery_recorded: recoveryRecorded,
      recovery_required: needsRecovery,
      error: {
        code: "BINDING_CHANGED",
        message: msg("result.ended"),
        retryable: false,
      },
      next_action: {
        action: "reconnect",
        session_id: binding.id,
        requires_confirmation: true,
        message: needsRecovery
          ? msg("action.reconnect_unknown")
          : msg("action.reconnect_new"),
      },
    }
  }
}
