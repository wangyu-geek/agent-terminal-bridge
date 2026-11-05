import { lstat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { accessDenied, BridgeError, hasCode, requireValue } from "./errors.ts"
import { LANGUAGE_SETTINGS, msg } from "./i18n.ts"
import { type Config, OPERATIONS, type Operation } from "./models.ts"
import {
  alias,
  boolean,
  choice,
  integer,
  keys,
  object,
  parseJson,
  string,
  strings,
} from "./validate.ts"

export async function loadConfig(explicitPath?: string): Promise<Config> {
  const configHome = absoluteEnv("XDG_CONFIG_HOME", join(homedir(), ".config"))
  const stateHome = absoluteEnv(
    "XDG_STATE_HOME",
    join(homedir(), ".local/state"),
  )
  const config: Config = {
    language: "auto",
    session: "remote",
    captureLines: 200,
    timeoutSeconds: 30,
    maxTimeoutSeconds: 300,
    maxOutputBytes: 1048576,
    maxCommandBytes: 2048,
    maxInputLineBytes: 4096,
    socketName: "agent-terminal-bridge",
    minimumTmux: "3.2",
    allowRawSend: false,
    policies: {},
    stateDir: join(stateHome, "agent-terminal-bridge"),
  }
  const path = explicitPath
    ? resolve(explicitPath)
    : join(configHome, "agent-terminal-bridge/config.json")
  let text: string
  try {
    const info = await lstat(path)
    requireValue(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.uid === process.getuid?.() &&
        (info.mode & 0o022) === 0,
      "INVALID_CONFIG",
      msg("config.unsafe_file", { path }),
    )
    const file = Bun.file(path)
    requireValue(
      file.size <= 65536,
      "INVALID_CONFIG",
      msg("error.configuration_exceeds_64_kib"),
    )
    text = await file.text()
  } catch (error) {
    if (!explicitPath && hasCode(error, "ENOENT")) return config
    if (error instanceof BridgeError) throw error
    if (accessDenied(error))
      throw new BridgeError(
        "LOCAL_ACCESS_DENIED",
        msg("error.cannot_read_local_bridge_configuration"),
        5,
      )
    throw new BridgeError(
      "INVALID_CONFIG",
      hasCode(error, "ENOENT")
        ? msg("config.missing_file", { path })
        : msg("config.cannot_read", { path }),
      2,
    )
  }
  const root = object(parseJson(text, "Configuration"), "configuration")
  keys(
    root,
    [
      "schema_version",
      "defaults",
      "backend",
      "security",
      "storage",
      "session_policies",
    ],
    "configuration",
  )
  requireValue(
    root.schema_version === 1,
    "INVALID_CONFIG",
    msg("error.unsupported_configuration_schema"),
  )
  if (root.defaults !== undefined) {
    const defaults = object(root.defaults, "defaults")
    keys(
      defaults,
      [
        "session",
        "language",
        "capture_lines",
        "timeout_seconds",
        "max_timeout_seconds",
        "max_output_bytes",
        "max_command_bytes",
        "max_input_line_bytes",
      ],
      "defaults",
    )
    if (defaults.session !== undefined)
      config.session = alias(string(defaults.session, "session"))
    if (defaults.language !== undefined)
      config.language = choice(defaults.language, LANGUAGE_SETTINGS, "language")
    if (defaults.capture_lines !== undefined)
      config.captureLines = integer(
        defaults.capture_lines,
        "capture_lines",
        1,
        10000,
      )
    if (defaults.max_timeout_seconds !== undefined)
      config.maxTimeoutSeconds = integer(
        defaults.max_timeout_seconds,
        "max_timeout_seconds",
        1,
        3600,
      )
    if (defaults.timeout_seconds !== undefined)
      config.timeoutSeconds = integer(
        defaults.timeout_seconds,
        "timeout_seconds",
        1,
        config.maxTimeoutSeconds,
      )
    if (defaults.max_output_bytes !== undefined)
      config.maxOutputBytes = integer(
        defaults.max_output_bytes,
        "max_output_bytes",
        64,
        16777216,
      )
    if (defaults.max_command_bytes !== undefined)
      config.maxCommandBytes = integer(
        defaults.max_command_bytes,
        "max_command_bytes",
        1,
        2048,
      )
    if (defaults.max_input_line_bytes !== undefined)
      config.maxInputLineBytes = integer(
        defaults.max_input_line_bytes,
        "max_input_line_bytes",
        128,
        4096,
      )
  }
  requireValue(
    config.timeoutSeconds <= config.maxTimeoutSeconds,
    "INVALID_CONFIG",
    msg("error.default_timeout_exceeds_maximum"),
  )
  if (root.backend !== undefined) {
    const backend = object(root.backend, "backend")
    keys(backend, ["type", "socket_name", "minimum_version"], "backend")
    if (backend.type !== undefined)
      requireValue(
        backend.type === "tmux",
        "INVALID_CONFIG",
        msg("error.unsupported_backend"),
      )
    if (backend.socket_name !== undefined)
      config.socketName = alias(string(backend.socket_name, "socket_name"))
    if (backend.minimum_version !== undefined) {
      const version = string(backend.minimum_version, "minimum_version", 20)
      requireValue(
        /^\d+\.\d+[a-z]?$/.test(version),
        "INVALID_CONFIG",
        msg("error.invalid_minimum_tmux_version"),
      )
      requireValue(
        Number(version.split(".")[0]) > 3 ||
          (Number(version.split(".")[0]) === 3 &&
            Number.parseInt(version.split(".")[1] ?? "0", 10) >= 2),
        "INVALID_CONFIG",
        msg("error.tmux_minimum_cannot_be_below_3_2"),
      )
      config.minimumTmux = version
    }
  }
  if (root.security !== undefined) {
    const security = object(root.security, "security")
    keys(
      security,
      [
        "require_explicit_binding",
        "require_shell_initialization",
        "allow_raw_send",
        "allow_auto_interrupt",
      ],
      "security",
    )
    for (const key of [
      "require_explicit_binding",
      "require_shell_initialization",
    ]) {
      if (security[key] !== undefined)
        requireValue(
          security[key] === true,
          "INVALID_CONFIG",
          msg("error.cannot_be_disabled", { key }),
        )
    }
    if (security.allow_auto_interrupt !== undefined)
      requireValue(
        security.allow_auto_interrupt === false,
        "INVALID_CONFIG",
        msg("error.automatic_interruption_is_unsupported"),
      )
    if (security.allow_raw_send !== undefined)
      config.allowRawSend = boolean(security.allow_raw_send, "allow_raw_send")
  }
  if (root.storage !== undefined) {
    const storage = object(root.storage, "storage")
    keys(storage, ["persist_commands", "persist_terminal_output"], "storage")
    for (const value of Object.values(storage))
      requireValue(
        value === false,
        "INVALID_CONFIG",
        msg("error.command_output_persistence_is_not_enabled_in_this_release"),
      )
  }
  if (root.session_policies !== undefined) {
    const policies = object(root.session_policies, "session_policies")
    requireValue(
      Object.keys(policies).length <= 128,
      "INVALID_CONFIG",
      msg("error.too_many_session_policies"),
    )
    for (const [name, value] of Object.entries(policies)) {
      alias(name)
      const policy = object(value, "session policy")
      keys(policy, ["description", "allowed_operations"], "session policy")
      if (policy.description !== undefined)
        string(policy.description, "description", 512)
      config.policies[name] = strings(
        policy.allowed_operations,
        "allowed_operations",
      ).map((item) => choice(item, OPERATIONS, "operation"))
    }
  }
  return config
}

export function effectivePermissions(
  config: Config,
  session: string,
  granted: Operation[],
): Operation[] {
  const policy = config.policies[session] ?? [...OPERATIONS]
  return granted.filter(
    (operation) =>
      policy.includes(operation) &&
      (operation !== "raw_send" || config.allowRawSend),
  )
}

function absoluteEnv(name: string, fallback: string): string {
  const value = process.env[name]
  if (!value) return fallback
  requireValue(
    isAbsolute(value),
    "INVALID_CONFIG",
    msg("error.must_be_absolute", { name }),
  )
  return resolve(value)
}
