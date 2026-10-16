#!/usr/bin/env -S bun --no-env-file --config=/dev/null
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import pkg from "../package.json"
import { loadConfig } from "./config.ts"
import { BridgeError, requireValue } from "./errors.ts"
import { Executor, resultExitCode } from "./executor.ts"
import { inspectDirectoryLock, recoverDirectoryLock } from "./locking.ts"
import { OPERATIONS } from "./models.ts"
import { sanitizeText } from "./output.ts"
import { errorNextStep, humanResult } from "./presentation.ts"
import { Sessions } from "./session.ts"
import { State } from "./state.ts"
import { checkTmux, randomNonce } from "./tmux.ts"
import { alias, choice, integer } from "./validate.ts"
import { Workflow } from "./workflow.ts"

const OPTIONS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
  config: { type: "string" },
  session: { type: "string" },
  "session-id": { type: "string" },
  advanced: { type: "boolean" },
  pane: { type: "string" },
  socket: { type: "string" },
  ssh: { type: "string" },
  permissions: { type: "string" },
  lines: { type: "string" },
  screen: { type: "string" },
  raw: { type: "boolean" },
  text: { type: "string" },
  enter: { type: "boolean" },
  writable: { type: "boolean" },
  to: { type: "string" },
  confirm: { type: "boolean" },
  scope: { type: "string" },
  timeout: { type: "string" },
  "request-id": { type: "string" },
  "command-stdin": { type: "boolean" },
  "expected-host": { type: "string" },
  takeover: { type: "boolean" },
} as const
const COMMON = ["json", "help", "config", "session", "session-id"]
const COMMAND_OPTIONS: Record<string, string[]> = {
  doctor: [],
  capabilities: [],
  connect: [],
  ready: ["confirm", "expected-host", "timeout"],
  takeover: ["confirm", "timeout"],
  resume: ["confirm", "expected-host", "timeout"],
  start: ["ssh"],
  bind: ["socket", "pane", "permissions", "confirm"],
  unbind: ["confirm"],
  list: [],
  status: ["pane"],
  capture: ["lines", "screen", "pane"],
  send: ["raw", "text", "enter", "pane"],
  attach: ["writable"],
  handoff: ["to", "confirm", "takeover", "request-id"],
  stop: ["confirm"],
  "recover-lock": ["scope", "confirm"],
  "shell-init": [],
  "confirm-shell": ["confirm", "expected-host", "timeout"],
  exec: ["request-id", "command-stdin", "timeout", "pane"],
  request: ["request-id"],
  recover: ["request-id", "confirm"],
  interrupt: ["request-id", "confirm"],
}

export function capabilities() {
  return {
    version: pkg.version,
    backend: "tmux",
    features: {
      capture: true,
      raw_send: true,
      exec: true,
      shell_init: true,
      directory_lock_recovery: true,
      connect: true,
      session_id_selection: true,
      ready: true,
      takeover: true,
      resume: true,
    },
    shell_profiles: ["bash-v1"],
    requires_local_socket_access: true,
    requires_multimodal_model: false,
  }
}

export async function main(args: string[]): Promise<number> {
  const json = args.includes("--json")
  let currentRequestId: string | null = null
  try {
    const version = Bun.version
      .split(".")
      .map((part) => Number.parseInt(part, 10))
    requireValue(
      (version[0] ?? 0) > 1 ||
        (version[0] === 1 &&
          ((version[1] ?? 0) > 4 ||
            (version[1] === 4 && (version[2] ?? 0) >= 2))),
      "DEPENDENCY_MISSING",
      "Bun >=1.4.2 is required",
      3,
    )
    const parsed = parseArgs({
      args,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    })
    const { values, positionals } = parsed
    if (values.version) {
      emit({ version: pkg.version }, json)
      return 0
    }
    const command = positionals[0] ?? "help"
    if (values.help || command === "help") {
      const help = {
        command: "remote-terminal",
        version: pkg.version,
        commands: Object.keys(COMMAND_OPTIONS),
        advanced: values.advanced ?? false,
        usage:
          "remote-terminal <command> [--session-id ID | --session NAME] [--json]",
        notes: [
          "start/bind register a pane; authentication remains manual",
          "raw send is disabled by default; send is not exec",
          "--confirm acknowledges an explicit management action",
          "after manual login, ready prepares the selected Bash >=3.2 shell and hands it to the Agent",
        ],
      }
      emit(help, json)
      return 0
    }
    const allowed = COMMAND_OPTIONS[command]
    requireValue(allowed, "INVALID_INPUT", "Unknown command")
    requireValue(
      positionals.length === 1 ||
        (["exec", "connect"].includes(command) && positionals.length === 2),
      "INVALID_INPUT",
      "Unexpected positional arguments",
    )
    for (const key of Object.keys(values))
      requireValue(
        COMMON.includes(key) || allowed.includes(key),
        "INVALID_INPUT",
        `Option --${key} is not accepted for this command`,
      )
    requireValue(
      process.platform === "darwin" || process.platform === "linux",
      "UNSUPPORTED_PLATFORM",
      "Only macOS and Linux are supported",
      3,
    )
    const config = await loadConfig(values.config)
    requireValue(
      !(values["session-id"] !== undefined && values.session !== undefined),
      "INVALID_INPUT",
      "Use either --session-id or --session, not both",
    )
    if (command === "capabilities") {
      emit(capabilities(), json)
      return 0
    }
    if (command === "doctor") {
      const backend = await checkTmux(config.minimumTmux)
      let target: object = {
        state: "not_checked",
        message:
          "Complete login and ready before target capabilities can be reported; no remote probe was sent",
      }
      if (values["session-id"] || values.session) {
        const saved = new State(config.stateDir)
        await saved.init()
        const name = await saved.select(values["session-id"], values.session)
        const status = await new Sessions(config, saved).status(name)
        target = {
          state:
            status.shell.state === "confirmed"
              ? "last_confirmed"
              : "not_checked",
          session_id: status.session_id,
          profile: status.shell.profile,
          hostname: status.shell.endpoint_label,
          bash_version: status.shell.bash_version,
        }
      }
      emit(
        {
          bun_version: Bun.version,
          platform: process.platform,
          arch: process.arch,
          tmux_version: backend.version,
          backend_capabilities: backend.capabilities,
          state_directory: config.stateDir,
          actual_features: capabilities().features,
          local_environment: {
            bun_version: Bun.version,
            platform: process.platform,
            arch: process.arch,
            tmux_version: backend.version,
            ssh_available: Bun.which("ssh") !== null,
          },
          target_environment: target,
        },
        json,
      )
      return 0
    }
    const state = new State(config.stateDir)
    await state.init()
    const sessions = new Sessions(config, state)
    const executor = new Executor(sessions)
    const workflow = new Workflow(sessions)
    if (command === "connect") {
      requireValue(
        !json,
        "INVALID_INPUT",
        "connect is interactive; use list/status --json for inspection",
      )
      requireValue(
        process.stdin.isTTY && process.stdout.isTTY,
        "TTY_REQUIRED",
        "connect requires a real terminal; run remote-terminal connect SSH_ALIAS there",
        5,
      )
      let name: string
      if (positionals[1] !== undefined) {
        requireValue(
          values["session-id"] === undefined,
          "INVALID_INPUT",
          "A new SSH connection cannot reuse a session_id",
        )
        name = alias(values.session ?? config.session)
        const abandoned: string[] = []
        for (const scope of ["registry", "audit"]) {
          const lock = await inspectDirectoryLock(state.locks, scope)
          requireValue(
            lock !== "unknown",
            "LOCK_OWNER_UNKNOWN",
            "Local setup lock ownership cannot be verified; controlled maintenance is required",
            9,
          )
          if (lock === "dead") abandoned.push(scope)
        }
        if (abandoned.length) {
          await confirm(
            undefined,
            "A previous local setup process has ended. Recover its verified abandoned setup locks? Remote tasks will not be changed.",
          )
          for (const scope of abandoned)
            await recoverDirectoryLock(state.locks, scope)
        }
        const existing = (await state.list()).find(
          (binding) => binding.alias === name,
        )
        if (existing) {
          console.error(
            `Session ${existing.alias} already exists: session_id=${existing.id}, SSH entry=${existing.sshAlias ?? "unknown"}.`,
          )
          const selection = await question(
            "Reuse this exact session [r], choose a new session name [n], or cancel [Enter]? ",
          )
          if (selection === "n")
            name = alias(await question("New session name: "))
          else
            requireValue(
              selection === "r",
              "SESSION_CONFLICT",
              "Connection was not created; select an existing session or a new --session name",
              4,
            )
          if (selection === "r") {
            await state.select(existing.id)
            await sessions.showSessionId(existing)
            const status = await sessions.status(name)
            console.log(humanResult(status))
            return await sessions.attach(name, status.control === "human")
          }
        }
        requireValue(
          Bun.which("ssh"),
          "DEPENDENCY_MISSING",
          "Local OpenSSH is required for connect",
          3,
        )
        const created = await sessions.start(name, positionals[1], true)
        await state.select(created.id)
        await sessions.showSessionId(created)
      } else {
        if (values["session-id"] !== undefined || values.session !== undefined)
          name = await state.select(values["session-id"], values.session)
        else {
          const bindings = await state.list()
          if (bindings.length > 1) {
            console.error(
              bindings
                .map(
                  (binding, index) =>
                    `${index + 1}. ${binding.alias} | session_id=${binding.id}`,
                )
                .join("\n"),
            )
            const selected = integer(
              Number(await question("Choose a session number: ")),
              "session number",
              1,
              bindings.length,
            )
            const chosen = bindings[selected - 1]
            requireValue(
              chosen,
              "INVALID_INPUT",
              "Choose a listed session number",
            )
            name = await state.select(chosen.id)
          } else name = await state.select()
        }
        await sessions.showSessionId(await state.load(name))
      }
      const status = await sessions.status(name)
      console.log(humanResult(status))
      return await sessions.attach(name, status.control === "human")
    }
    const session =
      values["session-id"] !== undefined
        ? await state.select(values["session-id"])
        : ["ready", "takeover", "resume"].includes(command)
          ? await state.select(undefined, values.session)
          : alias(values.session ?? config.session)
    if (["ready", "takeover", "resume"].includes(command)) {
      const ended =
        command === "resume" &&
        (await sessions.status(session)).display_state === "connection_ended"
      await confirm(
        values.confirm,
        ended
          ? "Acknowledge the old unknown outcome without claiming the remote program stopped? This connection cannot be resumed; a new connection must be created explicitly."
          : command === "takeover"
            ? "Return this selected terminal to human control without automatically interrupting its program?"
            : "Login and target selection are complete, prior work is resolved, and this selected shell is idle and ready for the Agent?",
      )
      const timeout = timeoutSeconds(
        values.timeout,
        config.timeoutSeconds,
        config.maxTimeoutSeconds,
      )
      const result =
        command === "ready"
          ? await workflow.ready(session, timeout, values["expected-host"])
          : command === "takeover"
            ? await workflow.takeover(session, timeout)
            : await workflow.resume(session, timeout, values["expected-host"])
      emit(result, json)
      return "connection_ended" in result && result.connection_ended ? 4 : 0
    }
    if (values.pane && command !== "bind")
      requireValue(
        (await state.load(session)).paneId === values.pane,
        "PERMISSION_DENIED",
        "--pane cannot expand a registered binding",
        5,
      )
    if (command === "shell-init") {
      const initialized = await executor.initialize(session)
      if (json) emit(initialized, true)
      else console.log(initialized.code)
      return 0
    }
    if (command === "confirm-shell") {
      requireValue(
        values["expected-host"],
        "INVALID_INPUT",
        "confirm-shell requires --expected-host",
      )
      await confirm(
        values.confirm,
        "Confirm the expected destination and an empty compatible Bash prompt?",
      )
      emit(
        await executor.confirmShell(
          session,
          values["expected-host"],
          timeoutSeconds(
            values.timeout,
            config.timeoutSeconds,
            config.maxTimeoutSeconds,
          ),
        ),
        json,
      )
      return 0
    }
    if (command === "exec") {
      requireValue(
        Boolean(values["command-stdin"]) !== (positionals[1] !== undefined),
        "INVALID_INPUT",
        "Provide exactly one command argument or --command-stdin",
      )
      const commandText = values["command-stdin"]
        ? await readCommand(config.maxCommandBytes)
        : (positionals[1] ?? "")
      currentRequestId = values["request-id"] ?? `req-${randomNonce()}`
      const result = await executor.execute(
        session,
        currentRequestId,
        commandText,
        timeoutSeconds(
          values.timeout,
          config.timeoutSeconds,
          config.maxTimeoutSeconds,
        ),
      )
      emit(result, json)
      return resultExitCode(result)
    }
    if (
      command === "request" ||
      command === "recover" ||
      command === "interrupt"
    ) {
      requireValue(
        values["request-id"],
        "INVALID_INPUT",
        `${command} requires --request-id`,
      )
      currentRequestId = values["request-id"]
      if (command === "request") {
        const result = await executor.query(session, currentRequestId)
        emit(result, json)
        return resultExitCode(result)
      }
      await confirm(
        values.confirm,
        command === "recover"
          ? "Confirm that you inspected the terminal and resolved the outstanding command?"
          : "Attempt to interrupt the named foreground request?",
      )
      emit(
        command === "recover"
          ? await executor.recover(session, currentRequestId)
          : await executor.signal(session, currentRequestId, "interrupt"),
        json,
      )
      return 0
    }
    if (command === "start") {
      emit(bindingResult(await sessions.start(session, values.ssh)), json)
      return 0
    }
    if (command === "bind") {
      requireValue(
        values.socket && values.pane,
        "INVALID_INPUT",
        "bind requires --socket and --pane",
      )
      await confirm(values.confirm, "Register this exact external tmux pane?")
      const permissions = (values.permissions ?? "read")
        .split(",")
        .map((item) => choice(item, OPERATIONS, "operation"))
      emit(
        bindingResult(
          await sessions.bind(session, values.socket, values.pane, permissions),
        ),
        json,
      )
      return 0
    }
    if (command === "list") {
      emit(
        {
          sessions: await Promise.all(
            (await state.list()).map((binding) =>
              sessions.status(binding.alias),
            ),
          ),
        },
        json,
      )
      return 0
    }
    if (command === "status") {
      emit(await sessions.status(session), json)
      return 0
    }
    if (command === "capture") {
      const lines =
        values.lines === undefined
          ? config.captureLines
          : integer(Number(values.lines), "lines", 1, 10000)
      const result = await sessions.capture(
        session,
        lines,
        choice(
          values.screen ?? "normal",
          ["normal", "alternate", "mode"],
          "screen",
        ),
      )
      if (!json) console.log(result.terminal_output)
      else emit(result, true)
      return 0
    }
    if (command === "send") {
      requireValue(
        values.raw && values.text !== undefined,
        "INVALID_INPUT",
        "send requires --raw and --text",
      )
      emit(
        await sessions.send(session, values.text, values.enter ?? false),
        json,
      )
      return 0
    }
    if (command === "handoff") {
      const to = choice(values.to, ["human", "agent"], "control owner")
      await confirm(
        values.confirm,
        `Hand control to ${to}? Confirm an empty shell input line.`,
      )
      if (values.takeover) {
        requireValue(
          to === "human" && values["request-id"],
          "INVALID_INPUT",
          "takeover requires --to human and --request-id",
        )
        emit(await executor.takeover(session, values["request-id"]), json)
      } else emit(await sessions.handoff(session, to), json)
      return 0
    }
    if (
      command === "stop" ||
      command === "unbind" ||
      command === "recover-lock"
    ) {
      await confirm(
        values.confirm,
        `Confirm ${command} for this registered session?`,
      )
      const result =
        command === "stop"
          ? await sessions.stop(session)
          : command === "unbind"
            ? await sessions.unbind(session)
            : await sessions.recoverLock(
                session,
                choice(
                  values.scope ?? "execution",
                  ["execution", "registry", "metadata", "audit"],
                  "lock scope",
                ),
              )
      emit(result, json)
      return 0
    }
    if (command === "attach") {
      requireValue(
        !json,
        "INVALID_INPUT",
        "attach is interactive and does not support --json",
      )
      requireValue(
        process.stdin.isTTY && process.stdout.isTTY,
        "TTY_REQUIRED",
        "attach requires a real terminal",
        5,
      )
      return await sessions.attach(session, values.writable ?? false)
    }
    throw new BridgeError("INVALID_INPUT", "Unknown command", 2)
  } catch (error) {
    const argumentError =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("ERR_PARSE_ARGS")
    const failure =
      error instanceof BridgeError
        ? error
        : new BridgeError(
            argumentError ? "INVALID_INPUT" : "LOCAL_IO_ERROR",
            argumentError
              ? "Invalid command line arguments"
              : "Local operation failed",
            argumentError ? 2 : 8,
          )
    const result = {
      schema_version: 1,
      ok: false,
      request_id: currentRequestId,
      execution_state: failure.executionState,
      completed: false,
      exit_code: null,
      recovery_required: failure.executionState === "unknown",
      error: {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      },
      next_action: {
        action: "inspect",
        requires_confirmation: true,
        message: errorNextStep(failure.code),
      },
    }
    if (json) console.log(JSON.stringify(result))
    else
      console.error(
        sanitizeText(
          `${failure.code}: ${failure.message}\nNext: ${errorNextStep(failure.code)}`,
        ),
      )
    return failure.exitCode
  }
}

function timeoutSeconds(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const number = value === undefined ? fallback : Number(value)
  requireValue(
    Number.isFinite(number) && number > 0 && number <= maximum,
    "INVALID_INPUT",
    "timeout must be a finite positive number within the configured maximum",
  )
  return number
}

async function readCommand(limit: number): Promise<string> {
  requireValue(
    !process.stdin.isTTY,
    "INVALID_INPUT",
    "--command-stdin requires piped input",
  )
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of Bun.stdin.stream()) {
    bytes += chunk.length
    requireValue(
      bytes <= limit,
      "COMMAND_TOO_LARGE",
      "Command input exceeds its limit",
    )
    chunks.push(chunk)
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    )
  } catch {
    throw new BridgeError("INVALID_INPUT", "Command must be valid UTF-8", 2)
  }
}

function emit(result: object, json: boolean): void {
  console.log(
    json
      ? JSON.stringify({ schema_version: 1, ok: true, ...result })
      : sanitizeText(humanResult(result)),
  )
}

function bindingResult(binding: Awaited<ReturnType<Sessions["start"]>>) {
  return {
    session: binding.alias,
    binding_id: binding.id,
    session_id: binding.id,
    ownership: binding.ownership,
    pane_id: binding.paneId,
    control: binding.control,
    shell_state: binding.shell.state,
  }
}

async function question(prompt: string): Promise<string> {
  const input = createInterface({
    input: process.stdin,
    output: process.stderr,
  })
  try {
    return (await input.question(prompt)).trim()
  } finally {
    input.close()
  }
}

async function confirm(
  acknowledged: boolean | undefined,
  prompt: string,
): Promise<void> {
  if (acknowledged) return
  requireValue(
    process.stdin.isTTY,
    "CONFIRMATION_REQUIRED",
    "Explicit management confirmation is required; use --confirm after review",
    5,
  )
  const input = createInterface({
    input: process.stdin,
    output: process.stderr,
  })
  try {
    requireValue(
      (await input.question(`${prompt} [y/N] `)).toLowerCase() === "y",
      "CONFIRMATION_REQUIRED",
      "Operation was not confirmed",
      5,
    )
  } finally {
    input.close()
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
