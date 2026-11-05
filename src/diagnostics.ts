import { lstat, open, unlink } from "node:fs/promises"
import { join } from "node:path"
import { accessDenied, BridgeError, hasCode, requireValue } from "./errors.ts"
import { type Message, msg } from "./i18n.ts"
import { processIdentity } from "./identity.ts"
import type { Config } from "./models.ts"
import { privatePathError } from "./security.ts"
import { State } from "./state.ts"
import { checkTmux, paneTarget, randomNonce, Tmux } from "./tmux.ts"

interface Check {
  state: "allowed" | "denied" | "missing" | "changed" | "error" | "not_checked"
  message?: string | Message
}

async function check(action: () => Promise<unknown>): Promise<Check> {
  try {
    await action()
    return { state: "allowed" }
  } catch (error) {
    const code = error instanceof BridgeError ? error.code : ""
    return {
      state:
        code === "LOCAL_ACCESS_DENIED" || accessDenied(error)
          ? "denied"
          : code === "BINDING_CHANGED"
            ? "changed"
            : [
                  "TMUX_OBJECT_MISSING",
                  "PROCESS_MISSING",
                  "DEPENDENCY_MISSING",
                  "INVALID_BINDING",
                ].includes(code) || hasCode(error, "ENOENT")
              ? "missing"
              : "error",
      message:
        error instanceof BridgeError
          ? error.userMessage
          : privatePathError(error).userMessage,
    }
  }
}

export async function diagnose(config: Config, id?: string, name?: string) {
  const state = new State(config.stateDir)
  let backend: Awaited<ReturnType<typeof checkTmux>> | undefined
  const backendCheck = await check(async () => {
    backend = await checkTmux(config.minimumTmux)
  })
  const stateRead = await check(async () => {
    // Missing state is normal before the first connect. Preserve ENOENT here
    // before registry parsing translates unexpected I/O into STATE_ERROR.
    await lstat(state.bindings)
    await state.list()
  })
  // This explicit doctor probe writes only its own temporary file, never a
  // request, lock owner or binding. It does not initialize missing state.
  const stateWrite = await check(async () => {
    const info = await lstat(state.root)
    requireValue(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        info.uid === process.getuid?.() &&
        (info.mode & 0o077) === 0,
      "UNSAFE_PATH",
      msg("error.state_root_is_not_a_private_owned_directory"),
      8,
    )
    const path = join(state.root, `.doctor-${randomNonce()}`)
    let created = false
    try {
      const file = await open(path, "wx", 0o600)
      created = true
      try {
        await file.writeFile("local access probe\n")
        await file.sync()
      } finally {
        await file.close()
      }
    } finally {
      if (created) await unlink(path)
    }
  })
  let binding: Awaited<ReturnType<State["load"]>> | undefined
  const selection =
    id || name
      ? await check(async () => {
          await lstat(state.bindings)
          const selected = await state.select(id, name)
          binding = await state.load(selected)
        })
      : { state: "not_checked" as const }
  let socket: Check = { state: "not_checked" }
  let processCheck: Check = { state: "not_checked" }
  if (binding && !state.isHistorical(binding)) {
    const selected = binding
    socket = await check(async () => {
      const pane = await new Tmux(selected.socketPath).inspect(
        paneTarget(selected),
      )
      requireValue(
        pane.marker === selected.marker &&
          pane.serverInstance === selected.serverInstance &&
          pane.pid === selected.panePid,
        "BINDING_CHANGED",
        msg("error.the_saved_terminal_identity_changed"),
        4,
      )
    })
    processCheck = await check(async () => {
      requireValue(
        (await processIdentity(selected.serverPid)) === selected.serverProcess,
        "BINDING_CHANGED",
        msg("error.the_saved_tmux_process_identity_changed"),
        4,
      )
    })
  }
  const checks = [
    backendCheck,
    stateRead,
    stateWrite,
    selection,
    socket,
    processCheck,
  ]
  const denied = checks.some((value) => value.state === "denied")
  const error = checks.some((value) => value.state === "error")
  const missingBackend = backendCheck.state === "missing"
  const missingSelection = Boolean(id || name) && selection.state === "missing"
  return {
    ...(denied
      ? {
          ok: false,
          error: {
            code: "LOCAL_ACCESS_DENIED",
            message: msg("doctor.denied"),
            retryable: false,
          },
        }
      : missingBackend
        ? {
            ok: false,
            error: {
              code: "DEPENDENCY_MISSING",
              message: msg("doctor.backend"),
              retryable: false,
            },
          }
        : missingSelection
          ? {
              ok: false,
              error: {
                code: "INVALID_BINDING",
                message: msg("doctor.selection"),
                retryable: false,
              },
            }
          : error
            ? {
                ok: false,
                error: {
                  code: "LOCAL_DIAGNOSTIC_FAILED",
                  message: msg("doctor.failed"),
                  retryable: false,
                },
              }
            : {}),
    bun_version: Bun.version,
    platform: globalThis.process.platform,
    arch: globalThis.process.arch,
    tmux_version: backend?.version ?? null,
    backend_capabilities: backend?.capabilities ?? null,
    state_directory: config.stateDir,
    local_environment: {
      bun_version: Bun.version,
      platform: globalThis.process.platform,
      arch: globalThis.process.arch,
      tmux_version: backend?.version ?? null,
      ssh_available: Bun.which("ssh") !== null,
    },
    target_environment: binding
      ? {
          state:
            binding.shell.state === "confirmed"
              ? "last_confirmed"
              : "not_checked",
          session_id: binding.id,
          profile: binding.shell.state === "confirmed" ? "bash-v1" : null,
          hostname: binding.shell.endpoint,
          bash_version: binding.shell.version,
        }
      : {
          state: "not_checked",
          message: msg("doctor.no_probe"),
        },
    local_access: {
      ready_for_session:
        Boolean(binding) &&
        [
          backendCheck,
          stateRead,
          stateWrite,
          selection,
          socket,
          processCheck,
        ].every((value) => value.state === "allowed"),
      backend: backendCheck,
      state_read: stateRead,
      state_write: stateWrite,
      selection,
      tmux_socket: socket,
      process_identity: processCheck,
      required_access: {
        state_directory: config.stateDir,
        unix_socket: binding?.socketPath ?? null,
        programs:
          globalThis.process.platform === "darwin"
            ? ["tmux", "/bin/ps", "/usr/sbin/sysctl"]
            : ["tmux", "/proc"],
        session_id: binding?.id ?? null,
        socket_access_is_session_isolation: false,
      },
      next_action: denied ? msg("doctor.grant") : msg("doctor.review"),
    },
  }
}
