import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import { Tmux } from "../../src/tmux.ts"
import { Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fakeSsh() {
  const fixture = await Fixture.create()
  fixtures.push(fixture)
  await unlink(
    join(fixture.directory, "config/agent-terminal-bridge/config.json"),
  )
  const bin = join(fixture.directory, "bin")
  await mkdir(bin, { mode: 0o700 })
  const ssh = join(bin, "ssh")
  await Bun.write(
    ssh,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$ATB_FIXTURE_ARGS"\nexec /bin/bash --noprofile --norc\n',
  )
  await chmod(ssh, 0o755)
  fixture.env.PATH = `${bin}:${fixture.env.PATH ?? ""}`
  fixture.env.ATB_FIXTURE_ARGS = join(fixture.directory, "ssh-arguments")
  return fixture
}
integration(
  "connect offers explicit selection when several sessions exist",
  async () => {
    const fixture = await fakeSsh()
    await fixture.cli(["start", "--session", "first", "--json"])
    await fixture.cli(["start", "--session", "second", "--json"])
    const first = await fixture.binding("first")
    const second = await fixture.binding("second")
    const owner = terminal(fixture, ["connect"])
    try {
      await until(async () =>
        owner.output().includes("Choose a session number"),
      )
      expect(
        (await new Tmux(first.socketPath).clients(first.sessionId)).length,
      ).toBe(0)
      expect(
        (await new Tmux(second.socketPath).clients(second.sessionId)).length,
      ).toBe(0)
      owner.process.terminal?.write("2\r")
      await until(async () =>
        (await new Tmux(second.socketPath).clients(second.sessionId)).some(
          (client) => !client.control && !client.readonly,
        ),
      )
      expect(
        (await new Tmux(first.socketPath).clients(first.sessionId)).length,
      ).toBe(0)
    } finally {
      await close(owner)
    }
  },
  20000,
)

integration(
  "an abandoned local setup lock is recovered only after one explicit prompt",
  async () => {
    const fixture = await fakeSsh()
    await fixture.cli(["list", "--json"])
    const holder = Bun.spawn(
      [
        process.execPath,
        join(root, "tests/fixtures/lock-worker.ts"),
        join(fixture.statePath, "locks"),
        "registry",
      ],
      { env: fixture.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    )
    const reader = holder.stdout.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "held",
    )
    holder.kill("SIGKILL")
    await holder.exited
    reader.releaseLock()
    const owner = terminal(fixture, ["connect", "bastion-example"])
    try {
      await until(async () =>
        owner.output().includes("Recover its verified abandoned setup locks"),
      )
      expect(
        await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
      ).toBe(false)
      owner.process.terminal?.write("y\r")
      await until(async () => {
        try {
          return Boolean((await fixture.binding()).id)
        } catch {
          return false
        }
      })
      fixture.sockets.add((await fixture.binding()).socketPath)
    } finally {
      await close(owner)
    }
  },
  20000,
)

function terminal(fixture: Fixture, args: string[]) {
  let output = ""
  const process = Bun.spawn(
    [
      Bun.which("bun") ?? "bun",
      "--no-env-file",
      "--config=/dev/null",
      join(root, "src/cli.ts"),
      ...args,
    ],
    {
      cwd: root,
      env: { ...fixture.env, TERM: "xterm-256color" },
      terminal: {
        cols: 160,
        rows: 35,
        data(_terminal, bytes) {
          output = (output + new TextDecoder().decode(bytes)).slice(-65536)
        },
      },
    },
  )
  return { process, output: () => output }
}
async function close(owner: ReturnType<typeof terminal>) {
  if (owner.process.exitCode === null) owner.process.kill("SIGTERM")
  owner.process.terminal?.close()
  await owner.process.exited
}
async function until(condition: () => Promise<boolean>) {
  const deadline = performance.now() + 8000
  while (!(await condition())) {
    if (performance.now() > deadline)
      throw new Error("Expected terminal state did not arrive")
    await Bun.sleep(20)
  }
}

integration(
  "connect rejects a non-TTY before creating an unseen SSH connection",
  async () => {
    const fixture = await fakeSsh()
    const result = await fixture.cli(["connect", "bastion-example"])
    expect(result.code).toBe(5)
    expect(result.stderr).toContain("real terminal")
    expect((await fixture.cli(["list", "--json"])).result.sessions).toEqual([])
    expect(
      await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
    ).toBe(false)
  },
)

integration(
  "one connect command exposes session_id and preserves the terminal across handoffs",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, ["connect", "bastion-example"])
    try {
      await until(async () => {
        const listed = (await fixture.cli(["list", "--json"])).result.sessions
        return Array.isArray(listed) && listed.length === 1
      })
      const binding = await fixture.binding()
      fixture.sockets.add(binding.socketPath)
      const tmux = new Tmux(binding.socketPath)
      await until(async () =>
        (await tmux.clients(binding.sessionId)).some(
          (client) => !client.control && !client.readonly,
        ),
      )
      await until(
        async () =>
          await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
      )
      expect(
        await Bun.file(join(fixture.directory, "ssh-arguments")).text(),
      ).toBe("-tt\nbastion-example\n")
      expect(
        await tmux.run([
          "show-options",
          "-v",
          "-t",
          binding.sessionId,
          "status-left",
        ]),
      ).toContain(`session_id=${binding.id}`)
      expect(owner.output()).toContain(binding.id)
      expect(
        (
          await fixture.cli([
            "ready",
            "--session-id",
            binding.id,
            "--confirm",
            "--json",
          ])
        ).result.ready,
      ).toBe(true)
      expect(
        (await tmux.clients(binding.sessionId))
          .filter((client) => !client.control)
          .every((client) => client.readonly),
      ).toBe(true)
      expect(
        (
          await fixture.cli([
            "exec",
            "--session-id",
            binding.id,
            "--request-id",
            "shared-command",
            "--json",
            "printf shared-output",
          ])
        ).result.terminal_output,
      ).toBe("shared-output")
      expect(
        (
          await fixture.cli([
            "takeover",
            "--session-id",
            binding.id,
            "--confirm",
            "--json",
          ])
        ).result.taken_over,
      ).toBe(true)
      expect(
        (await tmux.clients(binding.sessionId))
          .filter((client) => !client.control)
          .some((client) => !client.readonly),
      ).toBe(true)
      owner.process.terminal?.write("printf 'manual-operation\\n'\r")
      await fixture.untilCapture((output) =>
        output.split("\n").includes("manual-operation"),
      )
      expect(
        (
          await fixture.cli([
            "resume",
            "--session-id",
            binding.id,
            "--confirm",
            "--json",
          ])
        ).result.ready,
      ).toBe(true)
      const client = (await tmux.clients(binding.sessionId)).find(
        (item) => !item.control,
      )
      if (!client) throw new Error("The owned terminal client disappeared")
      await tmux.run(["detach-client", "-t", client.name])
      expect(await owner.process.exited).toBe(0)
      expect(
        (await fixture.cli(["status", "--session-id", binding.id, "--json"]))
          .result.binding,
      ).toBe("valid")
      const observer = terminal(fixture, [
        "connect",
        "--session-id",
        binding.id,
      ])
      try {
        await until(async () =>
          (await tmux.clients(binding.sessionId)).some((item) => !item.control),
        )
        expect(
          (await tmux.clients(binding.sessionId))
            .filter((item) => !item.control)
            .every((item) => item.readonly),
        ).toBe(true)
      } finally {
        await close(observer)
      }
    } finally {
      await close(owner)
    }
  },
  30000,
)

integration(
  "connect asks before reusing an occupied session name",
  async () => {
    const fixture = await fakeSsh()
    await fixture.cli(["start", "--json"])
    const previous = await fixture.binding()
    const owner = terminal(fixture, ["connect", "another-entry"])
    try {
      await until(async () =>
        owner.output().includes("Reuse this exact session"),
      )
      expect((await fixture.binding()).id).toBe(previous.id)
      expect(
        await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
      ).toBe(false)
      owner.process.terminal?.write("n\r")
      await until(async () => owner.output().includes("New session name"))
      owner.process.terminal?.write("second\r")
      await until(async () => {
        try {
          return (await fixture.binding("second")).sshAlias === "another-entry"
        } catch {
          return false
        }
      })
      const second = await fixture.binding("second")
      fixture.sockets.add(second.socketPath)
      expect(second.id).not.toBe(previous.id)
      expect((await fixture.binding()).id).toBe(previous.id)
      await until(
        async () =>
          await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
      )
      expect(
        await Bun.file(join(fixture.directory, "ssh-arguments")).text(),
      ).toBe("-tt\nanother-entry\n")
    } finally {
      await close(owner)
    }
  },
  30000,
)
