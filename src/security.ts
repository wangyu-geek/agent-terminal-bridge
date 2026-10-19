import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { accessDenied, BridgeError, hasCode, requireValue } from "./errors.ts"
import { parseJson } from "./validate.ts"

export async function secureDirectory(path: string): Promise<string> {
  const created = await mkdir(path, { recursive: true, mode: 0o700 })
  const stat = await lstat(path)
  requireValue(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 0o077) === 0,
    "UNSAFE_PATH",
    "State directory must be owned by the current user with mode 0700",
    8,
  )
  const canonical = await realpath(path)
  if (created) {
    // Persist newly created directory entries before dispatch relies on files
    // below them; syncing only the later JSON file does not persist parents.
    const stop = await realpath(dirname(created))
    let current = canonical
    while (true) {
      const directory = await open(current, "r")
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
      if (current === stop || current === dirname(current)) break
      current = dirname(current)
    }
  }
  return canonical
}

export async function readJsonSecure(
  path: string,
  maxBytes = 131072,
): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    requireValue(
      stat.isFile() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        stat.size <= maxBytes,
      "UNSAFE_PATH",
      "State file ownership, permissions or size is invalid",
      8,
    )
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    requireValue(
      bytesRead <= maxBytes,
      "STATE_ERROR",
      "State file is too large",
      8,
    )
    return parseJson(
      buffer.subarray(0, bytesRead).toString("utf8"),
      "State file",
    )
  } finally {
    await file.close()
  }
}

export async function writeAtomic(path: string, value: unknown): Promise<void> {
  await checkExistingFile(path)
  const temp = join(dirname(path), `.${crypto.randomUUID()}.tmp`)
  const file = await open(temp, "wx", 0o600)
  try {
    await file.writeFile(`${JSON.stringify(value)}\n`, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temp, path)
    const directory = await open(dirname(path), "r")
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await unlink(temp).catch((error: unknown) => {
      if (!hasCode(error, "ENOENT")) throw error
    })
  }
}

export async function checkExistingFile(path: string): Promise<void> {
  try {
    const stat = await lstat(path)
    requireValue(
      stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0,
      "UNSAFE_PATH",
      "State file is not a private regular file",
      8,
    )
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error
  }
}

export function validateRawInput(text: string, limit: number): void {
  const forbidden = [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return (
      code < 32 ||
      (code >= 127 && code <= 159) ||
      code === 0x2028 ||
      code === 0x2029
    )
  })
  requireValue(
    Buffer.byteLength(text) <= limit && !forbidden,
    "INVALID_INPUT",
    "Raw input contains control characters or exceeds the input limit",
  )
}

export function privatePathError(error: unknown): BridgeError {
  if (error instanceof BridgeError) return error
  if (accessDenied(error))
    return new BridgeError(
      "LOCAL_ACCESS_DENIED",
      "Cannot access private Bridge state; grant the selected state directory access",
      5,
    )
  return new BridgeError("STATE_ERROR", "Cannot access private Bridge state")
}
