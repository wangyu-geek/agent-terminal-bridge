import { createHash } from "node:crypto"
import { lstat, mkdir, rmdir, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { BridgeError, hasCode, requireValue } from "./errors.ts"
import {
  bootIdentity,
  processDefinitelyAbsent,
  processIdentity,
} from "./identity.ts"
import { readJsonSecure, secureDirectory, writeAtomic } from "./security.ts"
import { integer, keys, object, string } from "./validate.ts"

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

interface Owner {
  token: string
  pid: number
  process: string
  boot: string
}

export class DirectoryLock {
  private released = false
  private constructor(
    readonly path: string,
    readonly token: string,
    private readonly inode: number,
  ) {}

  static async acquire(
    root: string,
    key: string,
    maintenance = false,
  ): Promise<DirectoryLock> {
    const locks = await secureDirectory(root)
    const path = join(
      locks,
      `${digest(key)}${maintenance ? ".maintenance" : ".lock"}`,
    )
    const guard = join(locks, `${digest(key)}.maintenance`)
    if (!maintenance && (await exists(guard)))
      throw new BridgeError(
        "BUSY",
        "Resource lock maintenance is in progress",
        6,
        true,
      )
    try {
      await mkdir(path, { mode: 0o700 })
    } catch (error) {
      if (hasCode(error, "EEXIST"))
        throw new BridgeError(
          "BUSY",
          "Resource is locked; stale locks require explicit recovery",
          6,
          true,
        )
      throw error
    }
    const token = crypto.randomUUID()
    const inode = (await lstat(path)).ino
    // An ownerless directory is deliberately left fail-closed if initialization fails.
    await writeAtomic(join(path, "owner.json"), {
      token,
      pid: process.pid,
      process: await processIdentity(process.pid),
      boot: await bootIdentity(),
    })
    const lock = new DirectoryLock(path, token, inode)
    if (!maintenance && (await exists(guard))) {
      await lock.release()
      throw new BridgeError(
        "BUSY",
        "Resource lock maintenance is in progress",
        6,
        true,
      )
    }
    return lock
  }

  async release(): Promise<void> {
    if (this.released) return
    const owner = readOwner(await readJsonSecure(join(this.path, "owner.json")))
    const stat = await lstat(this.path)
    requireValue(
      stat.ino === this.inode && owner.token === this.token,
      "LOCK_OWNER_UNKNOWN",
      "Lock ownership changed; refusing cleanup",
      9,
    )
    await unlink(join(this.path, "owner.json"))
    await rmdir(this.path)
    this.released = true
  }
}

export async function recoverDirectoryLock(
  root: string,
  key: string,
): Promise<void> {
  const guard = await DirectoryLock.acquire(root, key, true)
  try {
    const path = join(dirname(guard.path), `${digest(key)}.lock`)
    let owner: Owner
    let inode: number
    try {
      const stat = await lstat(path)
      requireValue(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o077) === 0,
        "LOCK_OWNER_UNKNOWN",
        "Lock directory is unsafe",
        9,
      )
      inode = stat.ino
      owner = readOwner(await readJsonSecure(join(path, "owner.json")))
    } catch (error) {
      if (hasCode(error, "ENOENT") && !(await exists(path))) return
      throw new BridgeError(
        "LOCK_OWNER_UNKNOWN",
        "Lock owner cannot be verified; stop all Bridge writers before manual maintenance",
        9,
      )
    }
    requireValue(
      owner.boot === (await bootIdentity()),
      "LOCK_OWNER_UNKNOWN",
      "Lock belongs to another boot; manual maintenance is required",
      9,
    )
    requireValue(
      processDefinitelyAbsent(owner.pid),
      "LOCK_OWNER_UNKNOWN",
      "Lock PID is alive or unverifiable; refusing takeover",
      9,
    )
    const current = readOwner(await readJsonSecure(join(path, "owner.json")))
    requireValue(
      (await lstat(path)).ino === inode && current.token === owner.token,
      "LOCK_OWNER_UNKNOWN",
      "Lock changed during recovery",
      9,
    )
    await unlink(join(path, "owner.json"))
    await rmdir(path)
  } finally {
    await guard.release()
  }
}

export async function withLock<T>(
  root: string,
  key: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = await DirectoryLock.acquire(root, key)
  try {
    return await action()
  } finally {
    await lock.release()
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false
    throw error
  }
}

function readOwner(value: unknown): Owner {
  const data = object(value, "lock owner")
  keys(data, ["token", "pid", "process", "boot"], "lock owner")
  return {
    token: string(data.token, "owner token", 128),
    pid: integer(data.pid, "owner PID", 1),
    process: string(data.process, "process identity"),
    boot: string(data.boot, "boot identity"),
  }
}
