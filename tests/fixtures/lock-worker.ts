import { DirectoryLock } from "../../src/locking.ts"

const root = process.argv[2]
const key = process.argv[3]
if (!root || !key) throw new Error("Missing fixture arguments")
try {
  const lock = await DirectoryLock.acquire(root, key)
  console.log("held")
  await Bun.stdin.text()
  await lock.release()
} catch {
  console.log("busy")
  process.exitCode = 6
}
