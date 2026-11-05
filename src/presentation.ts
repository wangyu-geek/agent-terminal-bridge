import { createI18n, type I18n, Message, msg } from "./i18n.ts"

export const MAIN_COMMANDS = ["connect", "status", "takeover", "resume"]

export function humanResult(
  result: object,
  i18n: I18n = createI18n("en"),
): string {
  if ("commands" in result && Array.isArray(result.commands))
    return [
      i18n.t("help.title"),
      "",
      i18n.t("help.connect"),
      i18n.t("help.return"),
      i18n.t("help.status"),
      i18n.t("help.takeover"),
      i18n.t("help.resume"),
      "",
      i18n.t("help.handoff"),
      i18n.t("help.controls"),
      i18n.t("help.advanced"),
      i18n.t("help.language"),
      ...("advanced" in result && result.advanced
        ? ["", i18n.t("help.all", { commands: result.commands.join(", ") })]
        : []),
    ].join("\n")
  if ("sessions" in result && Array.isArray(result.sessions))
    return result.sessions.length
      ? result.sessions
          .map((item: object) => humanResult(item, i18n))
          .join("\n\n")
      : i18n.t("session.empty")
  if ("display_state" in result) {
    const states: Record<string, Message> = {
      awaiting_human: msg("state.awaiting_human"),
      preparing: msg("state.preparing"),
      ready: msg("state.ready"),
      running: msg("state.running"),
      needs_human: msg("state.needs_human"),
      connection_ended: msg("state.connection_ended"),
      archived: msg("state.archived"),
      access_denied: msg("state.access_denied"),
      inspection_failed: msg("state.inspection_failed"),
    }
    const next =
      "next_action" in result &&
      typeof result.next_action === "object" &&
      result.next_action !== null &&
      "message" in result.next_action
        ? i18n.text(result.next_action.message)
        : i18n.t("next.inspect")
    const target =
      "shell" in result &&
      typeof result.shell === "object" &&
      result.shell !== null &&
      "endpoint_label" in result.shell
        ? result.shell.endpoint_label
        : null
    return [
      i18n.t("session.heading", {
        session: "session" in result ? String(result.session) : "",
        id: "session_id" in result ? String(result.session_id) : "",
      }),
      ...(target ? [i18n.t("session.host", { host: String(target) })] : []),
      i18n.t("session.state", {
        state: i18n.text(
          states[String(result.display_state)] ?? result.display_state,
        ),
      }),
      i18n.t("session.next", { next }),
    ].join("\n")
  }
  if ("local_environment" in result)
    return [
      i18n.t("label.local", { fields: fields(result.local_environment, i18n) }),
      i18n.t("label.target", {
        fields:
          "target_environment" in result
            ? fields(result.target_environment, i18n)
            : i18n.t("label.not_checked"),
      }),
      ...("local_access" in result &&
      typeof result.local_access === "object" &&
      result.local_access !== null
        ? [
            i18n.t("label.local_access"),
            ...Object.entries(result.local_access).map(
              ([key, value]) => `  ${key}: ${fields(value, i18n)}`,
            ),
          ]
        : []),
    ].join("\n")
  if ("ready" in result && result.ready)
    return i18n.t("session.ready", {
      id: "session_id" in result ? String(result.session_id) : "",
    })
  if ("taken_over" in result && result.taken_over)
    return i18n.t("session.taken_over")
  if ("terminal_output" in result && typeof result.terminal_output === "string")
    return (
      result.terminal_output +
      ("completed" in result
        ? i18n.t("result.completed", {
            completed: fields(result.completed, i18n),
            exit:
              "exit_code" in result
                ? String(result.exit_code)
                : i18n.t("label.unknown"),
          })
        : "")
    )
  return fields(result, i18n)
}

function fields(value: unknown, i18n: I18n): string {
  if (value instanceof Message) return i18n.text(value)
  if (value === null) return i18n.t("label.not_checked")
  if (typeof value === "boolean")
    return i18n.t(value ? "label.yes" : "label.no")
  if (typeof value !== "object") return String(value)
  if (Array.isArray(value))
    return value.map((item) => fields(item, i18n)).join(", ")
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${fields(item, i18n)}`)
    .join(" | ")
}

export function errorNextStep(code: string): Message {
  if (code === "INVALID_CONFIG") return msg("next.config")
  if (code === "LOCAL_ACCESS_DENIED" || code === "PROCESS_IDENTITY_UNKNOWN")
    return msg("next.local_access")
  if (code === "ARCHIVED_SESSION") return msg("next.archived")
  if (code === "TTY_REQUIRED") return msg("next.tty")
  if (code === "DEPENDENCY_MISSING")
    return msg(
      process.platform === "darwin"
        ? "next.dependencies_mac"
        : "next.dependencies_linux",
    )
  if (
    [
      "INVALID_BINDING",
      "SESSION_CONFLICT",
      "SESSION_SELECTION_REQUIRED",
    ].includes(code)
  )
    return msg("next.select")
  if (
    [
      "RECOVERY_REQUIRED",
      "SHELL_CONFIRMATION_REQUIRED",
      "ENDPOINT_MISMATCH",
    ].includes(code)
  )
    return msg("next.resume")
  if (["BUSY", "TIMEOUT"].includes(code)) return msg("next.busy")
  if (code === "LOCK_OWNER_UNKNOWN") return msg("next.lock")
  if (code === "STATE_ERROR") return msg("next.state")
  return msg("next.error")
}
