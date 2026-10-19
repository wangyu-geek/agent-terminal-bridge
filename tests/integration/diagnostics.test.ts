import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup()
})
const quoted = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

integration(
  "first-run doctor reports missing state without creating it",
  async () => {
    const f = await Fixture.create()
    fixtures.push(f)
    const doctor = await f.cli(["doctor", "--json"])
    expect(doctor.code).toBe(0)
    expect(doctor.result).toMatchObject({
      ok: true,
      local_access: {
        state_read: { state: "missing" },
        state_write: { state: "missing" },
        ready_for_session: false,
      },
    })
    const selected = await f.cli([
      "doctor",
      "--session-id",
      "19b0b332d87e4df4ba70a47a549c5216",
      "--json",
    ])
    expect(selected.code).toBe(4)
    expect(selected.result.error).toMatchObject({ code: "INVALID_BINDING" })
    expect(await readdir(f.directory)).not.toContain("state")
  },
)

integration(
  "socket denial is unverified access, never a dead connection or automatic recreation",
  async () => {
    const f = await Fixture.create()
    fixtures.push(f)
    const real = Bun.which("tmux")
    if (!real) throw new Error("Missing tmux")
    await f.cli(["start", "--json"])
    const binding = await f.binding()
    const bin = join(f.directory, "deny-bin")
    await mkdir(bin, { mode: 0o700 })
    const executable = join(bin, "tmux")
    await Bun.write(
      executable,
      `#!/bin/sh\nfor arg in "$@"; do case "$arg" in -V|list-commands) exec ${quoted(real)} "$@" ;; esac; done\nprintf '%s\\n' 'Operation not permitted' >&2\nexit 1\n`,
    )
    await chmod(executable, 0o755)
    f.env.PATH = `${bin}:${f.env.PATH}`
    const status = await f.cli(["status", "--session-id", binding.id, "--json"])
    expect(status.code).toBe(5)
    expect(status.result).toMatchObject({
      binding: "unverified",
      display_state: "access_denied",
      next_action: { action: "inspect_local_access" },
      error: { code: "LOCAL_ACCESS_DENIED" },
    })
    expect((await f.binding()).control).toBe("human")
    const doctor = await f.cli(["doctor", "--session-id", binding.id, "--json"])
    expect(doctor.code).toBe(5)
    expect(doctor.result.local_access).toMatchObject({
      state_read: { state: "allowed" },
      state_write: { state: "allowed" },
      tmux_socket: { state: "denied" },
      process_identity: { state: "allowed" },
      ready_for_session: false,
    })
    expect(
      (await readdir(f.statePath)).filter((value) =>
        value.startsWith(".doctor-"),
      ),
    ).toEqual([])
  },
  10000,
)

const sandbox =
  process.platform === "darwin" && Bun.which("codex") ? integration : test.skip
sandbox(
  "real Codex workspace sandbox reports filesystem, Unix socket and process requirements independently",
  async () => {
    const f = await Fixture.create()
    fixtures.push(f)
    await f.cli(["start", "--json"])
    const binding = await f.binding()
    const run = async (command: string, grant = false) => {
      const p = Bun.spawn(
        [
          Bun.which("codex") ?? "codex",
          "sandbox",
          "-c",
          'sandbox_mode="workspace-write"',
          "-c",
          "sandbox_workspace_write.exclude_slash_tmp=true",
          "-c",
          "sandbox_workspace_write.exclude_tmpdir_env_var=true",
          ...(grant ? ["--allow-unix-socket", binding.socketPath] : []),
          "--",
          process.execPath,
          "--no-env-file",
          "--config=/dev/null",
          join(root, "src/cli.ts"),
          command,
          "--session-id",
          binding.id,
          "--json",
        ],
        {
          cwd: root,
          env: f.env,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const [code, out, err] = await Promise.all([
        p.exited,
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
      ])
      if (!out.trim().startsWith("{"))
        throw new Error(`Sandbox helper failed: ${err}`)
      return { code, result: JSON.parse(out) }
    }
    const before = await f.cli(["status", "--session-id", binding.id, "--json"])
    expect(before.result.binding).toBe("valid")
    const denied = await run("status")
    expect(denied.code).toBe(5)
    expect(denied.result).toMatchObject({
      binding: "unverified",
      display_state: "access_denied",
    })
    const doctor = await run("doctor")
    expect(doctor.result.local_access).toMatchObject({
      state_read: { state: "allowed" },
      state_write: { state: "denied" },
      tmux_socket: { state: "denied" },
      process_identity: { state: "denied" },
    })
    const granted = await run("doctor", true)
    expect(granted.result.local_access).toMatchObject({
      tmux_socket: { state: "allowed" },
      process_identity: { state: "denied" },
    })
    const normal = await f.cli(["doctor", "--session-id", binding.id, "--json"])
    expect(normal.code).toBe(0)
    expect(normal.result.local_access).toMatchObject({
      ready_for_session: true,
    })
    expect(
      (await f.cli(["status", "--session-id", binding.id, "--json"])).result
        .binding,
    ).toBe("valid")
  },
  30000,
)
