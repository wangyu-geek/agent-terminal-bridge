import { readFile } from "node:fs/promises"
import { hostname } from "node:os"
import { BridgeError, hasCode } from "./errors.ts"
import { runProcess } from "./process.ts"

export async function processIdentity(pid: number): Promise<string> {
  if (process.platform === "linux") {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8")
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      const started = fields[19]
      if (!started || !/^\d+$/.test(started))
        throw new Error("Invalid process record")
      return `${await bootIdentity()}:${pid}:${started}`
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        throw new BridgeError("PROCESS_MISSING", "Process has exited", 4)
      throw new BridgeError(
        "PROCESS_IDENTITY_UNKNOWN",
        "Cannot verify process creation identity",
        4,
      )
    }
  }
  const result = await runProcess(
    ["/bin/ps", "-p", String(pid), "-o", "lstart="],
    { env: { ...process.env, LC_ALL: "C" } },
  )
  if (result.exitCode !== 0 || !result.stdout.trim())
    throw new BridgeError("PROCESS_MISSING", "Process has exited", 4)
  return `${await bootIdentity()}:${pid}:${result.stdout.trim()}`
}

let boot: Promise<string> | undefined
export function bootIdentity(): Promise<string> {
  boot ??= readBoot()
  return boot
}

async function readBoot(): Promise<string> {
  if (process.platform === "linux")
    return `${hostname()}:${(await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim()}`
  if (process.platform === "darwin") {
    const result = await runProcess(["/usr/sbin/sysctl", "-n", "kern.boottime"])
    if (result.exitCode === 0 && result.stdout.trim())
      return `${hostname()}:${result.stdout.trim()}`
  }
  throw new BridgeError(
    "UNSUPPORTED_PLATFORM",
    "Only macOS and Linux process identity is supported",
    3,
  )
}

export function processDefinitelyAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return hasCode(error, "ESRCH")
  }
}
