import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, rename, symlink, unlink } from "node:fs/promises"
import { join } from "node:path"
import { writeAtomic } from "../../src/security.ts"
import { compatibleBash, Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fixture() {
  const f = await Fixture.create()
  fixtures.push(f)
  const bash = await compatibleBash()
  if (!bash) throw new Error("Bash >=3.2 is required for this fixture")
  f.env.ATB_FIXTURE_BASH = bash
  const bin = join(f.directory, "bin")
  await mkdir(bin, { mode: 0o700 })
  const ssh = join(bin, "ssh")
  await Bun.write(
    ssh,
    "#!/bin/sh\nPS1='fixture-ready> '; export PS1\nexec \"$ATB_FIXTURE_BASH\" --noprofile --norc\n",
  )
  await chmod(ssh, 0o755)
  f.env.PATH = `${bin}:${f.env.PATH}`
  return f
}
async function open(
  f: Fixture,
  ssh: string,
  name = "",
  fresh = false,
  operation = "open",
) {
  const p = Bun.spawn(
    [
      process.execPath,
      join(root, "tests/fixtures/connection-worker.ts"),
      operation,
      ssh,
      name,
      fresh ? "new" : "",
    ],
    { env: f.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  )
  const [code, stdout, stderr] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ])
  if (code !== 0) throw new Error(stdout + stderr)
  const result = JSON.parse(stdout)
  for (const binding of result.bindings) f.sockets.add(binding.socketPath)
  return result.bindings as Awaited<ReturnType<Fixture["binding"]>>[]
}
async function ended(f: Fixture, name: string) {
  const b = await f.binding(name)
  process.kill(b.panePid, "SIGKILL")
  const deadline = performance.now() + 3000
  while (
    (await f.cli(["status", "--session", name, "--json"])).result
      .display_state !== "connection_ended"
  ) {
    if (performance.now() > deadline)
      throw new Error(
        JSON.stringify(
          (await f.cli(["status", "--session", name, "--json"])).result,
        ),
      )
    await Bun.sleep(15)
  }
  return b
}

integration(
  "SSH entry reuse, explicit new, named return and multiple candidates preserve identities",
  async () => {
    const f = await fixture()
    await f.cli(["start", "--json"])
    const legacy = await f.binding()
    const [first] = await open(f, "entry-one")
    if (!first) throw new Error("Missing connection")
    expect(first.alias).toBe("entry-one")
    expect(first.id).not.toBe(legacy.id)
    expect((await open(f, "entry-one"))[0]?.id).toBe(first.id)
    expect((await open(f, "entry-one", "entry-one"))[0]?.panePid).toBe(
      first.panePid,
    )
    const [second] = await open(f, "entry-one", "", true)
    if (!second) throw new Error("Missing second connection")
    expect(second?.alias).toBe("entry-one-2")
    const candidates = await open(f, "entry-one")
    expect(new Set(candidates.map((value) => value.id))).toEqual(
      new Set([first.id, second.id]),
    )
    expect((await open(f, "entry-two"))[0]?.alias).toBe("entry-two")
    await expect(open(f, "entry-two", "entry-one")).rejects.toThrow(
      "another or unknown SSH",
    )
    const [dotted] = await open(f, "entry.one")
    expect(dotted?.alias).toBe("entry-one-3")
    expect(dotted?.id).not.toBe(first.id)
    expect((await open(f, "entry.one"))[0]?.id).toBe(dotted?.id)
    expect((await f.binding()).id).toBe(legacy.id)
  },
  15000,
)

integration(
  "concurrent connect calls converge on one current SSH binding",
  async () => {
    const f = await fixture()
    const [a, b] = await Promise.all([
      open(f, "entry-one"),
      open(f, "entry-one"),
    ])
    expect(a[0]?.id).toBe(b[0]?.id)
    expect((await f.cli(["list", "--json"])).result.sessions).toHaveLength(1)
  },
  15000,
)

integration(
  "ended names are reused while old unknown history stays queryable and read-only",
  async () => {
    const f = await fixture()
    const [first] = await open(f, "entry-one")
    if (!first) throw new Error("Missing connection")
    await f.untilCapture(
      (output) => output.includes("fixture-ready>"),
      first.alias,
    )
    expect(
      (
        await f.cli([
          "ready",
          "--session-id",
          first.id,
          "--confirm",
          "--timeout",
          "3",
          "--json",
        ])
      ).code,
    ).toBe(0)
    const gate = f.commandGate(":")
    try {
      const result = await f.cli([
        "exec",
        "--session-id",
        first.id,
        "--request-id",
        "old-unknown",
        "--timeout",
        "2",
        "--json",
        gate.command,
      ])
      // Observe real execution; a short deadline can expire before dispatch.
      expect(await gate.started()).toBe(true)
      expect(result.code).toBe(7)
      expect(result.result).toMatchObject({
        execution_state: "unknown",
        completed: false,
        exit_code: null,
        recovery_required: true,
        error: { code: "TIMEOUT" },
      })
      await ended(f, first.alias)
    } finally {
      await gate.release()
    }
    const [next] = await open(f, "entry-one", first.alias)
    expect(next?.alias).toBe(first.alias)
    expect(next?.id).not.toBe(first.id)
    const history = await f.cli([
      "request",
      "--session-id",
      first.id,
      "--request-id",
      "old-unknown",
      "--json",
    ])
    expect(history.result).toMatchObject({
      execution_state: "unknown",
      completed: false,
      recovered: false,
    })
    expect(
      (await f.cli(["status", "--session-id", first.id, "--json"])).result,
    ).toMatchObject({
      binding: "archived",
      display_state: "archived",
      session_id: first.id,
    })
    expect((await f.cli(["list", "--json"])).result.sessions).toHaveLength(1)
    expect(
      (await f.cli(["list", "--history", "--json"])).result.sessions,
    ).toHaveLength(2)
    for (const command of ["ready", "takeover", "resume", "stop", "unbind"]) {
      const denied = await f.cli([
        command,
        "--session-id",
        first.id,
        "--confirm",
        "--json",
      ])
      expect(denied.result.error).toMatchObject({ code: "ARCHIVED_SESSION" })
    }
    const forbidden = await f.cli([
      "exec",
      "--session-id",
      first.id,
      "--request-id",
      "forbidden",
      "--json",
      `printf bad > '${f.directory}/effect'`,
    ])
    expect(forbidden.code).toBe(4)
    expect(await Bun.file(join(f.directory, "effect")).exists()).toBe(false)
  },
  20000,
)

integration(
  "history lookup rejects a non-private or symlinked parent instead of following it",
  async () => {
    const f = await fixture()
    const [first] = await open(f, "entry-one")
    if (!first) throw new Error("Missing connection")
    await ended(f, first.alias)
    await open(f, first.alias, "", false, "archive")
    const history = join(f.statePath, "history")
    await chmod(history, 0o755)
    expect(
      (await f.cli(["status", "--session-id", first.id, "--json"])).result
        .error,
    ).toMatchObject({ code: "UNSAFE_PATH" })
    await chmod(history, 0o700)
    const saved = join(f.statePath, "saved-history")
    await rename(history, saved)
    await symlink(saved, history)
    try {
      expect(
        (await f.cli(["status", "--session-id", first.id, "--json"])).result
          .error,
      ).toMatchObject({ code: "UNSAFE_PATH" })
    } finally {
      await unlink(history)
      await rename(saved, history)
    }
    expect(
      (await f.cli(["status", "--session-id", first.id, "--json"])).result
        .binding,
    ).toBe("archived")
  },
  10000,
)

integration(
  "archive-before-name-release crash copies and archive-before-create gaps retain old IDs",
  async () => {
    const f = await fixture()
    const [first] = await open(f, "entry-one")
    if (!first) throw new Error("Missing connection")
    await ended(f, first.alias)
    await mkdir(join(f.statePath, "history"), { mode: 0o700 })
    await writeAtomic(join(f.statePath, "history", `${first.id}.json`), first)
    // Simulate a persisted history copy with the old active index still present.
    await open(f, first.alias, "", false, "archive")
    expect(
      (await f.cli(["status", "--session-id", first.id, "--json"])).result
        .binding,
    ).toBe("archived")
    expect((await f.cli(["list", "--json"])).result.sessions).toEqual([])
    // A later creation reuses the display name without making the old ID writable.
    const [next] = await open(f, "entry-one")
    expect(next?.alias).toBe(first.alias)
    expect(next?.id).not.toBe(first.id)
    expect(
      (await f.cli(["status", "--session-id", first.id, "--json"])).result
        .binding,
    ).toBe("archived")
  },
  15000,
)
