import { afterEach, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  DirectoryLock,
  digest,
  recoverDirectoryLock,
} from "../../src/locking.ts"
import { readJsonSecure, secureDirectory } from "../../src/security.ts"
import { State } from "../../src/state.ts"
import { Fixture, root } from "../helpers.ts"

const fixtures: Fixture[] = []
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup()
})
async function fixture() {
  const f = await Fixture.create()
  fixtures.push(f)
  return f
}

test("separate processes contend, a killed holder remains locked until explicit recovery", async () => {
  const f = await fixture()
  const directory = join(f.directory, "locks")
  const child = Bun.spawn(
    [
      process.execPath,
      join(root, "tests/fixtures/lock-worker.ts"),
      directory,
      "pane",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  )
  const reader = child.stdout.getReader()
  const first = await reader.read()
  expect(new TextDecoder().decode(first.value)).toContain("held")
  await expect(DirectoryLock.acquire(directory, "pane")).rejects.toThrow(
    "locked",
  )
  await expect(recoverDirectoryLock(directory, "pane")).rejects.toThrow("alive")
  child.kill("SIGKILL")
  await child.exited
  await expect(DirectoryLock.acquire(directory, "pane")).rejects.toThrow(
    "locked",
  )
  await recoverDirectoryLock(directory, "pane")
  const lock = await DirectoryLock.acquire(directory, "pane")
  await lock.release()
  reader.releaseLock()
})

test("ownerless or tampered locks are never reclaimed automatically", async () => {
  const f = await fixture()
  const directory = await secureDirectory(join(f.directory, "locks"))
  await mkdir(join(directory, `${digest("orphan")}.lock`), { mode: 0o700 })
  await expect(recoverDirectoryLock(directory, "orphan")).rejects.toThrow(
    "cannot be verified",
  )
  const lock = await DirectoryLock.acquire(directory, "owned")
  await writeFile(
    join(lock.path, "owner.json"),
    JSON.stringify({
      token: "another",
      pid: process.pid,
      process: "unknown",
      boot: "unknown",
    }),
    { mode: 0o600 },
  )
  await expect(lock.release()).rejects.toThrow("ownership changed")
})

test("private state rejects symlinks and public files", async () => {
  const f = await fixture()
  const path = join(f.directory, "public.json")
  await writeFile(path, "{}", { mode: 0o644 })
  await expect(readJsonSecure(path)).rejects.toThrow("permissions")
  await symlink(path, join(f.directory, "link.json"))
  await expect(readJsonSecure(join(f.directory, "link.json"))).rejects.toThrow()
})

test("recovery refuses a symlinked lock directory without touching its target", async () => {
  const f = await fixture()
  const directory = await secureDirectory(join(f.directory, "locks"))
  const target = await secureDirectory(join(f.directory, "unrelated"))
  await writeFile(join(target, "owner.json"), "{}", { mode: 0o600 })
  await symlink(target, join(directory, `${digest("redirected")}.lock`))
  await expect(recoverDirectoryLock(directory, "redirected")).rejects.toThrow()
  expect(await Bun.file(join(target, "owner.json")).text()).toBe("{}")
})

test("short audit-lock contention waits locally without duplicating an event", async () => {
  const f = await fixture()
  const state = new State(f.statePath)
  await state.init()
  const lock = await DirectoryLock.acquire(state.locks, "audit")
  const result = state.audit("checked", null, "completed").then(
    () => true,
    () => false,
  )
  await Bun.sleep(30)
  await lock.release()
  expect(await result).toBe(true)
  const events = (await Bun.file(join(state.root, "audit.jsonl")).text())
    .trim()
    .split("\n")
  expect(events.length).toBe(1)
  expect(JSON.parse(events[0] ?? "{}").outcome).toBe("completed")
})
