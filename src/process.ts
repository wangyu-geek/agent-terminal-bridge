import { accessDenied, BridgeError, hasCode } from "./errors.ts"
import { msg } from "./i18n.ts"

export async function runProcess(
  cmd: string[],
  options: {
    maxBytes?: number
    timeoutMs?: number
    env?: Record<string, string | undefined>
  } = {},
) {
  const maxBytes = options.maxBytes ?? 65536
  let timedOut = false
  let overflow = false
  let proc: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>
  try {
    proc = Bun.spawn(cmd, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: options.env ?? process.env,
    })
  } catch (error) {
    if (accessDenied(error))
      throw new BridgeError(
        "LOCAL_ACCESS_DENIED",
        msg(
          "error.permission_denied_starting_a_required_local_program_inspect_doctor_local_access",
        ),
        5,
      )
    throw new BridgeError(
      hasCode(error, "ENOENT") ? "DEPENDENCY_MISSING" : "LOCAL_IO_ERROR",
      msg("error.cannot_start_required_local_program"),
      3,
    )
  }
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill("SIGTERM")
  }, options.timeoutMs ?? 5000)
  const collect = async (stream: ReadableStream<Uint8Array>, limit: number) => {
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of stream) {
      if (size + chunk.length > limit) {
        overflow = true
        proc.kill("SIGTERM")
        continue
      }
      chunks.push(chunk)
      size += chunk.length
    }
    return Buffer.concat(chunks).toString("utf8")
  }
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      collect(proc.stdout, maxBytes),
      collect(proc.stderr, 8192),
    ])
    if (timedOut)
      throw new BridgeError(
        "TIMEOUT",
        msg("error.local_operation_exceeded_its_deadline"),
        7,
      )
    if (overflow)
      throw new BridgeError(
        "OUTPUT_LIMIT",
        msg("error.local_operation_exceeded_its_output_limit"),
        8,
      )
    return { exitCode, stdout, stderr }
  } finally {
    clearTimeout(timer)
    if (proc.exitCode === null) proc.kill("SIGTERM")
  }
}
