export const MAIN_COMMANDS = ["connect", "status", "takeover", "resume"]

export function humanResult(result: object): string {
  if ("commands" in result && Array.isArray(result.commands))
    return [
      "remote-terminal — shared terminal for you and your Agent",
      "",
      "  connect SSH_ALIAS   Open a terminal and log in manually",
      "  connect             Return to an existing shared terminal",
      "  status              Show the current state and next step",
      "  takeover            Return input control to you",
      "  resume              Continue after you have inspected the shell",
      "",
      "After login, tell your Agent: Login is complete; take over and use the shared terminal for my task.",
      "Use --help --advanced for all commands; --json for the machine interface.",
      ...("advanced" in result && result.advanced
        ? ["", `All commands: ${result.commands.join(", ")}`]
        : []),
    ].join("\n")
  if ("sessions" in result && Array.isArray(result.sessions))
    return result.sessions.length
      ? result.sessions.map((item: object) => humanResult(item)).join("\n\n")
      : "No shared sessions. Next: remote-terminal connect SSH_ALIAS in a real terminal."
  if ("display_state" in result) {
    const states: Record<string, string> = {
      awaiting_human:
        "Waiting for you to finish login and choose the target shell",
      preparing: "Preparing the shared shell",
      ready: "Ready for authorized Agent commands",
      running: "Command is running",
      needs_human: "Needs human inspection; the remote outcome may be unknown",
      connection_ended: "Connection ended or binding changed",
    }
    const next =
      "next_action" in result &&
      typeof result.next_action === "object" &&
      result.next_action !== null &&
      "message" in result.next_action
        ? String(result.next_action.message)
        : "Inspect status before continuing."
    const target =
      "shell" in result &&
      typeof result.shell === "object" &&
      result.shell !== null &&
      "endpoint_label" in result.shell
        ? result.shell.endpoint_label
        : null
    return [
      `Session ${"session" in result ? result.session : ""} | session_id=${"session_id" in result ? result.session_id : ""}`,
      ...(target ? [`Last shell-reported host: ${target}`] : []),
      `State: ${states[String(result.display_state)] ?? result.display_state}`,
      `Next: ${next}`,
    ].join("\n")
  }
  if ("local_environment" in result)
    return `Local: ${fields(result.local_environment)}\nTarget: ${"target_environment" in result ? fields(result.target_environment) : "not checked"}`
  if ("ready" in result && result.ready)
    return `Session ${"session_id" in result ? result.session_id : ""} is ready for the authorized task.`
  if ("taken_over" in result && result.taken_over)
    return "Input control has returned to you. Inspect the terminal, then confirm resume when the shell is ready."
  if ("terminal_output" in result && typeof result.terminal_output === "string")
    return `${result.terminal_output}${"completed" in result ? `\nCompleted: ${result.completed}; exit: ${"exit_code" in result ? result.exit_code : "unknown"}` : ""}`
  return fields(result)
}

function fields(value: unknown): string {
  if (value === null) return "not checked"
  if (typeof value !== "object") return String(value)
  return Object.entries(value)
    .map(
      ([key, item]) =>
        `${key}: ${typeof item === "object" && item !== null ? fields(item) : String(item)}`,
    )
    .join(" | ")
}

export function errorNextStep(code: string): string {
  if (code === "TTY_REQUIRED")
    return "Open a real local terminal and run remote-terminal connect SSH_ALIAS."
  if (code === "DEPENDENCY_MISSING")
    return process.platform === "darwin"
      ? "Check local Bun/tmux/OpenSSH. Install tmux with brew install tmux if needed; the standalone binary includes Bun."
      : "Check local Bun/tmux/OpenSSH. On Debian/Ubuntu install tmux and openssh-client; the standalone binary includes Bun."
  if (
    [
      "INVALID_BINDING",
      "SESSION_CONFLICT",
      "SESSION_SELECTION_REQUIRED",
    ].includes(code)
  )
    return "Run remote-terminal list and select the exact session_id, or create a connection with a new --session name."
  if (
    [
      "RECOVERY_REQUIRED",
      "SHELL_CONFIRMATION_REQUIRED",
      "ENDPOINT_MISMATCH",
    ].includes(code)
  )
    return "Ask your Agent to take over this session; inspect it, then confirm resume."
  if (["BUSY", "TIMEOUT"].includes(code))
    return "Inspect status before any further input; never repeat an unknown command."
  if (code === "LOCK_OWNER_UNKNOWN")
    return "Stop Bridge writers and inspect the local lock owner before maintenance; do not delete an unverifiable lock."
  if (code === "STATE_ERROR")
    return "Stop Bridge writers and inspect the private state for corruption. Do not delete request records to bypass recovery."
  return "Inspect status and the reported error before continuing."
}
