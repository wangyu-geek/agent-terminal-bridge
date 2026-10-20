import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import { DirectoryLock } from "../../src/locking.ts"
import { resourceKey } from "../../src/state.ts"
import { Tmux } from "../../src/tmux.ts"
import { closeTerminal, compatibleBash, Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fakeSsh(login = false) {
  const fixture = await Fixture.create()
  fixtures.push(fixture)
  const bash = await compatibleBash()
  if (!bash) throw new Error("Bash >=3.2 is required for this fixture")
  fixture.env.ATB_FIXTURE_BASH = bash
  await unlink(
    join(fixture.directory, "config/agent-terminal-bridge/config.json"),
  )
  const bin = join(fixture.directory, "bin")
  await mkdir(bin, { mode: 0o700 })
  const ssh = join(bin, "ssh")
  await Bun.write(
    ssh,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$ATB_FIXTURE_ARGS"\n' +
      (login
        ? 'exec "$ATB_FIXTURE_BASH" --noprofile --norc "$ATB_FIXTURE_LOGIN"\n'
        : "PS1='fixture-ready> '; export PS1\nexec \"$ATB_FIXTURE_BASH\" --noprofile --norc\n"),
  )
  await chmod(ssh, 0o755)
  fixture.env.PATH = `${bin}:${fixture.env.PATH ?? ""}`
  fixture.env.ATB_FIXTURE_ARGS = join(fixture.directory, "ssh-arguments")
  fixture.env.ATB_FIXTURE_LOGIN = join(
    root,
    "tests/fixtures/bastion-login.bash",
  )
  return fixture
}

for (const existingServer of [false, true]) {
  integration(
    `manual bastion selection and MFA survive Enter with ${existingServer ? "an existing" : "a new"} managed server`,
    async () => {
      const fixture = await fakeSsh(true)
      const clientLocale = {
        LANG: "C",
        LC_ALL: "C",
        LC_CTYPE: "C",
        LC_TERMINAL: "fixture-terminal",
        LC_TERMINAL_VERSION: "1.2",
      }
      Object.assign(fixture.env, clientLocale, {
        ATB_FIXTURE_KEEP: "preserved; 中文",
        SSH_AUTH_SOCK: join(fixture.directory, "fixture-agent.sock"),
        LC_TIME: "C",
      })
      if (existingServer) {
        expect(
          (await fixture.cli(["start", "--session", "keeper", "--json"])).code,
        ).toBe(0)
        const keeper = await fixture.binding("keeper")
        // Model a private server left running by an older Bridge binary.
        await new Tmux(keeper.socketPath).run([
          "set-option",
          "-g",
          "default-terminal",
          "tmux-256color",
        ])
        // The new client is clean, but the old server still holds the values.
        for (const variable of Object.keys(clientLocale))
          fixture.env[variable] = undefined
      }
      // Force the prompt to exist before the view attaches, so startup must
      // work through capture-pane rather than depend on fresh streamed bytes.
      expect(
        (
          await fixture.cli([
            "start",
            "--ssh",
            "bastion-example",
            "--session",
            "remote",
            "--json",
          ])
        ).code,
      ).toBe(0)
      await fixture.untilCapture((output) => output.includes("Select server>"))
      const owner = terminal(fixture, [
        "connect",
        "bastion-example",
        "--session",
        "remote",
      ])
      try {
        await until(async () => {
          const entries = (await fixture.cli(["list", "--json"])).result
            .sessions
          if (!Array.isArray(entries)) return false
          const binding = entries.find((entry) => entry.session === "remote")
          if (!binding) return false
          fixture.sockets.add((await fixture.binding()).socketPath)
          return owner.output().includes("Select server>")
        }, owner.output)
        expect(owner.output()).toContain("Terminal: screen-256color")
        expect(owner.output()).toContain("Locale variables present: []")
        expect(owner.output()).toContain(
          `Preserved environment: preserved; 中文|${fixture.env.SSH_AUTH_SOCK}|C`,
        )
        const binding = await fixture.binding()
        for (const [variable, value] of Object.entries(clientLocale))
          expect(
            (
              await new Tmux(binding.socketPath).run([
                "show-environment",
                "-g",
                variable,
              ])
            ).trim(),
          ).toBe(`${variable}=${value}`)
        expect(owner.output()).not.toContain("unknown terminal type")
        expect(owner.output()).not.toContain("Verification code> ")
        owner.process.terminal?.write("1\r")
        await until(async () => owner.output().includes("Verification code> "))
        // A second Enter or an automatic helper would consume/fail this read.
        await Bun.sleep(150)
        expect(owner.output()).not.toContain("Authentication failed")
        expect(owner.output()).not.toContain("Authenticated target> ")
        expect(owner.output()).not.toContain("Connection ended")
        for (const byte of "123456") {
          owner.process.terminal?.write(byte)
          await Bun.sleep(5)
        }
        owner.process.terminal?.write("\r")
        await until(async () =>
          owner.output().includes("Authenticated target> "),
        )
        expect(owner.output()).not.toContain("123456")
        expect(owner.output()).not.toContain("Connection ended")
        expect((await fixture.binding()).control).toBe("human")
        expect((await fixture.binding()).shell.state).toBe("uninitialized")
      } finally {
        await close(owner)
      }
    },
    15000,
  )
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
          (client) => client.control,
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
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
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

integration(
  "the local view streams readable commands, blocks remote typing, resizes and takes over locally",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
    try {
      await until(
        async () =>
          owner.output().includes("[You control input]") &&
          owner.output().includes("fixture-ready> "),
      )
      const binding = await fixture.binding()
      fixture.sockets.add(binding.socketPath)
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
      const prepared = await fixture.cli([
        "ready",
        "--session-id",
        binding.id,
        "--confirm",
        "--timeout",
        "3",
        "--json",
      ])
      if (prepared.code !== 0) {
        const snapshot = await fixture.cli(["capture", "--json"])
        throw new Error(
          JSON.stringify({
            prepared,
            binding: await fixture.binding(),
            output: owner.output(),
            capture: snapshot.result.terminal_output,
          }),
        )
      }
      const command =
        "printf 'live-result\\n'; sleep 2; printf 'still-running-after-takeover\\n'"
      const child = fixture.spawnCli([
        "exec",
        "--session-id",
        binding.id,
        "--request-id",
        "visible-command",
        "--timeout",
        "8",
        "--json",
        command,
      ])
      const result = new Response(child.stdout).text()
      const errors = new Response(child.stderr).text()
      await until(async () => owner.output().includes("live-result\r\n"))
      expect(owner.output()).toContain(`$ ${command}`)
      expect(owner.output()).not.toContain("__atb_")
      expect(owner.output()).not.toContain("ATB1|")
      expect(owner.output()).not.toContain("\x1b[?1049h")
      expect(owner.output()).not.toContain("\x1b[?1000h")
      expect(child.exitCode).toBeNull()
      owner.process.terminal?.resize(100, 30)
      owner.process.terminal?.write("printf forbidden-human-input\\n\r")
      await until(async () => owner.output().includes("[Input blocked"))
      await Bun.sleep(100)
      expect(child.exitCode).toBeNull()
      owner.process.terminal?.write("\x1d")
      await until(async () => owner.output().includes("[Local menu]"))
      owner.process.terminal?.write("t")
      await until(async () =>
        owner.output().includes("[Input returned to you]"),
      )
      const response = JSON.parse(await result)
      expect(await child.exited).toBe(9)
      expect(await errors).toBe("")
      expect(response.execution_state).toBe("unknown")
      expect((await fixture.binding()).control).toBe("human")
      await fixture.untilCapture((output) =>
        output.split("\n").includes("still-running-after-takeover"),
      )
      expect(owner.output()).not.toContain("ATB1|")
      const captured = await fixture.cli(["capture", "--json"])
      expect(captured.result.terminal_output).not.toContain(
        "forbidden-human-input",
      )
      owner.process.terminal?.write("printf 'manual-after-takeover\\n'\r")
      await fixture.untilCapture((output) =>
        output.split("\n").includes("manual-after-takeover"),
      )
    } finally {
      await close(owner)
    }
  },
  20000,
)

integration(
  "extended Ctrl+] and the ordinary help key open local controls without changing terminal settings",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
    try {
      await until(
        async () =>
          owner.output().includes("[You control input]") &&
          owner.output().includes("fixture-ready> "),
      )
      const binding = await fixture.binding()
      fixture.sockets.add(binding.socketPath)
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
      expect(
        (await fixture.cli(["ready", "--confirm", "--timeout", "3", "--json"]))
          .code,
      ).toBe(0)
      for (const sequence of [
        "\x1b[93;5u",
        "\x1b[93;5:1u",
        "\x1b[27;5;93~",
        "\x1d",
        "\x1b[47:63;2u",
        "?",
      ]) {
        const opened = owner.output().split("[Local menu]").length
        for (const char of sequence) {
          owner.process.terminal?.write(char)
          await Bun.sleep(2)
        }
        await until(
          async () =>
            owner.output().split("[Local menu]").length === opened + 1,
        )
        const continued = owner.output().split("[Viewing resumed]").length
        owner.process.terminal?.write("\x1b[99u")
        await until(
          async () =>
            owner.output().split("[Viewing resumed]").length === continued + 1,
        )
      }
      const opened = owner.output().split("[Local menu]").length
      owner.process.terminal?.write("\x1b[93;5:3u")
      await Bun.sleep(150)
      expect(owner.output().split("[Local menu]").length).toBe(opened)
      owner.process.terminal?.write("?")
      await until(
        async () => owner.output().split("[Local menu]").length === opened + 1,
      )
      owner.process.terminal?.write("\x1b[116;1u")
      await until(async () =>
        owner.output().includes("[Input returned to you]"),
      )
      expect((await fixture.binding()).control).toBe("human")
      owner.process.terminal?.write("printf 'human-question?\\n'\r")
      await fixture.untilCapture((output) =>
        output.split("\n").includes("human-question?"),
      )
      expect(owner.output().split("[Local menu]").length).toBe(opened + 1)
      owner.process.terminal?.write(
        "read -r -s -n 1 key; printf 'escape-value:%d\\n' \"'$key\"\r",
      )
      await fixture.untilCapture((output) => output.includes("escape-value:%d"))
      owner.process.terminal?.write("\x1b")
      await fixture.untilCapture((output) =>
        output.split("\n").includes("escape-value:27"),
      )
      owner.process.terminal?.write("\x1b[93;5u")
      await until(
        async () => owner.output().split("[Local menu]").length === opened + 2,
      )
      owner.process.terminal?.write("\x1b[113u")
      expect(await owner.process.exited).toBe(0)
    } finally {
      await close(owner)
    }
  },
  20000,
)

integration(
  "typing during a pending local takeover is discarded instead of deferred into the shell",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
    let held: DirectoryLock | undefined
    try {
      await until(
        async () =>
          owner.output().includes("[You control input]") &&
          owner.output().includes("fixture-ready> "),
      )
      const binding = await fixture.binding()
      fixture.sockets.add(binding.socketPath)
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
      expect(
        (await fixture.cli(["ready", "--confirm", "--timeout", "3", "--json"]))
          .code,
      ).toBe(0)
      held = await DirectoryLock.acquire(
        join(fixture.statePath, "locks"),
        resourceKey(binding),
      )
      owner.process.terminal?.write("\x1d")
      await until(async () => owner.output().includes("[Local menu]"))
      owner.process.terminal?.write("t")
      await until(async () =>
        owner.output().includes("[Returning input control"),
      )
      owner.process.terminal?.write("printf should-never-be-deferred\r")
      await Bun.sleep(80)
      await held.release()
      held = undefined
      await until(async () =>
        owner.output().includes("[Input returned to you]"),
      )
      owner.process.terminal?.write("printf 'new-human-input\\n'\r")
      const capture = await fixture.untilCapture((output) =>
        output.split("\n").includes("new-human-input"),
      )
      expect(capture).not.toContain("should-never-be-deferred")
    } finally {
      await held?.release()
      await close(owner)
    }
  },
  15000,
)

integration(
  "a dead SSH connection offers explicit reconnect in the same terminal, with a new ID and unchanged unknown request",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
    try {
      await until(
        async () =>
          owner.output().includes("[You control input]") &&
          owner.output().includes("fixture-ready> "),
      )
      const old = await fixture.binding()
      fixture.sockets.add(old.socketPath)
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
      expect(
        (
          await fixture.cli([
            "ready",
            "--session-id",
            old.id,
            "--confirm",
            "--json",
          ])
        ).code,
      ).toBe(0)
      const timedOut = await fixture.cli([
        "exec",
        "--session-id",
        old.id,
        "--request-id",
        "old-unknown",
        "--timeout",
        "1",
        "--json",
        "sleep 2; printf old-effect",
      ])
      expect(timedOut.result.execution_state).toBe("unknown")
      for (const variable of [
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "LC_TERMINAL",
        "LC_TERMINAL_VERSION",
      ])
        await new Tmux(old.socketPath).run([
          "set-environment",
          "-g",
          variable,
          "C",
        ])
      process.kill(old.panePid, "SIGKILL")
      await until(async () =>
        owner.output().includes("[r] Reconnect in this window"),
      )
      expect(
        (await fixture.cli(["list", "--json"])).result.sessions,
      ).toHaveLength(1)
      expect(owner.process.exitCode).toBeNull()
      const reconnectStart = owner.output().length
      owner.process.terminal?.write("r")
      let nextId = ""
      let nextAlias = ""
      await until(async () => {
        const entries = (await fixture.cli(["list", "--json"])).result.sessions
        if (!Array.isArray(entries)) return false
        const next = entries.find((entry) => entry.session_id !== old.id)
        if (!next) return false
        nextId = String(next.session_id)
        nextAlias = String(next.session)
        return owner.output().includes(`session_id=${nextId}`)
      })
      expect(nextId).not.toBe(old.id)
      const next = await fixture.binding(nextAlias)
      expect(next.sshAlias).toBe("bastion-example")
      expect(next.control).toBe("human")
      expect(next.shell.state).toBe("uninitialized")
      expect((await fixture.binding()).id).toBe(nextId)
      const historical = await fixture.cli([
        "request",
        "--session-id",
        old.id,
        "--request-id",
        "old-unknown",
        "--json",
      ])
      expect(historical.result.execution_state).toBe("unknown")
      expect(historical.result.completed).toBe(false)
      await until(
        async () =>
          owner
            .output()
            .slice(reconnectStart)
            .includes("[You control input]") &&
          owner.output().slice(reconnectStart).includes("fixture-ready>"),
      )
      owner.process.terminal?.write("printf 'reconnected-manual-input\\n'\r")
      await fixture.untilCapture(
        (output) => output.split("\n").includes("reconnected-manual-input"),
        nextAlias,
      )
      owner.process.terminal?.write(
        `printf 'reconnected-locale:[%s%s%s%s%s]\\n' "\${LANG+x}" "\${LC_ALL+x}" "\${LC_CTYPE+x}" "\${LC_TERMINAL+x}" "\${LC_TERMINAL_VERSION+x}"\r`,
      )
      await fixture.untilCapture(
        (output) => output.split("\n").includes("reconnected-locale:[]"),
        nextAlias,
      )
      expect(
        (await fixture.cli(["status", "--session-id", old.id, "--json"])).result
          .display_state,
      ).toBe("archived")
    } finally {
      await close(owner)
    }
  },
  20000,
)
async function close(owner: ReturnType<typeof terminal>) {
  await closeTerminal(owner.process)
}
async function until(
  condition: () => Promise<boolean>,
  details?: () => string,
) {
  const deadline = performance.now() + 8000
  while (!(await condition())) {
    if (performance.now() > deadline)
      throw new Error(
        `Expected terminal state did not arrive${details ? `\nOwned test view: ${details().slice(-6000)}` : ""}`,
      )
    await Bun.sleep(20)
  }
}

integration(
  "connect rejects a non-TTY before creating an unseen SSH connection",
  async () => {
    const fixture = await fakeSsh()
    const result = await fixture.cli([
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
    expect(result.code).toBe(5)
    expect(result.stderr).toContain("real terminal")
    expect((await fixture.cli(["list", "--json"])).result.sessions).toEqual([])
    expect(
      await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
    ).toBe(false)
  },
)

integration(
  "returning to a missing managed pane still exposes the local recovery menu",
  async () => {
    const fixture = await fakeSsh()
    expect(
      (await fixture.cli(["start", "--ssh", "bastion-example", "--json"])).code,
    ).toBe(0)
    const binding = await fixture.binding()
    await fixture.tmux(binding.socketPath, [
      "kill-session",
      "-t",
      binding.sessionId,
    ])
    const owner = terminal(fixture, ["connect", "--session-id", binding.id])
    try {
      await until(async () =>
        owner.output().includes("[r] Reconnect in this window"),
      )
      expect(owner.output()).toContain(binding.id)
      expect(
        (await fixture.cli(["list", "--json"])).result.sessions,
      ).toHaveLength(1)
      owner.process.terminal?.write("q")
      expect(await owner.process.exited).toBe(0)
    } finally {
      await close(owner)
    }
  },
  15000,
)

integration(
  "one connect command exposes session_id and preserves the terminal across handoffs",
  async () => {
    const fixture = await fakeSsh()
    const owner = terminal(fixture, [
      "connect",
      "bastion-example",
      "--session",
      "remote",
    ])
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
          (client) => client.control,
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
      await until(
        async () =>
          owner.output().includes("[You control input]") &&
          owner.output().includes("fixture-ready> "),
      )
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
      const prepared = await fixture.cli([
        "ready",
        "--session-id",
        binding.id,
        "--confirm",
        "--json",
      ])
      if (prepared.code !== 0) throw new Error(prepared.stdout)
      expect(prepared.result.ready).toBe(true)
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
      expect((await fixture.binding()).control).toBe("human")
      owner.process.terminal?.write("printf 'manual-operation\\n'\r")
      try {
        await fixture.untilCapture((output) =>
          output.split("\n").includes("manual-operation"),
        )
      } catch (error) {
        throw new Error(
          `${String(error)}\nOwned test view: ${owner.output().slice(-6000)}`,
        )
      }
      await fixture.humanRoundTrip(owner.process.terminal, owner.output)
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
      owner.process.terminal?.write("\x1d")
      await until(async () => owner.output().includes("[Local menu]"))
      owner.process.terminal?.write("q")
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
          (await tmux.clients(binding.sessionId)).some((item) => item.control),
        )
        expect(observer.output()).toContain(binding.id)
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
  "--new opens a separate SSH session and normal connect asks only when several matching sessions exist",
  async () => {
    const fixture = await fakeSsh()
    const first = terminal(fixture, ["connect", "entry-one"])
    let second: ReturnType<typeof terminal> | undefined
    let picker: ReturnType<typeof terminal> | undefined
    try {
      await until(async () => first.output().includes("[You control input]"))
      const a = await fixture.binding("entry-one")
      fixture.sockets.add(a.socketPath)
      second = terminal(fixture, ["connect", "entry-one", "--new"])
      const extra = second
      await until(async () => extra.output().includes("[You control input]"))
      const b = await fixture.binding("entry-one-2")
      expect(b.id).not.toBe(a.id)
      picker = terminal(fixture, ["connect", "entry-one"])
      const selection = picker
      await until(async () =>
        selection.output().includes("Choose a session number"),
      )
      expect(selection.output()).toContain(a.id)
      expect(selection.output()).toContain(b.id)
      selection.process.terminal?.write("2\r")
      await until(async () =>
        selection.output().includes(`[Bridge entry-one-2] session_id=${b.id}`),
      )
      const conflict = terminal(fixture, [
        "connect",
        "entry-two",
        "--session",
        "entry-one",
      ])
      try {
        expect(await conflict.process.exited).toBe(4)
        expect(conflict.output()).toContain("another or unknown SSH entry")
      } finally {
        await close(conflict)
      }
      expect((await fixture.binding("entry-one")).id).toBe(a.id)
    } finally {
      if (picker) await close(picker)
      if (second) await close(second)
      await close(first)
    }
  },
  20000,
)

integration(
  "connect selects its SSH entry instead of an unrelated legacy default name",
  async () => {
    const fixture = await fakeSsh()
    await fixture.cli(["start", "--json"])
    const previous = await fixture.binding()
    const owner = terminal(fixture, ["connect", "another-entry"])
    try {
      await until(async () => owner.output().includes("[You control input]"))
      const created = await fixture.binding("another-entry")
      fixture.sockets.add(created.socketPath)
      expect(created.sshAlias).toBe("another-entry")
      expect(created.id).not.toBe(previous.id)
      expect((await fixture.binding()).id).toBe(previous.id)
      expect(owner.output()).not.toContain("already exists")
      expect(owner.output()).not.toContain("SESSION_CONFLICT")
      await until(
        async () =>
          await Bun.file(join(fixture.directory, "ssh-arguments")).exists(),
      )
      expect(
        await Bun.file(join(fixture.directory, "ssh-arguments")).text(),
      ).toBe("-tt\nanother-entry\n")
      owner.process.terminal?.write("\x1d")
      await until(async () => owner.output().includes("[Local menu]"))
      owner.process.terminal?.write("q")
      expect(await owner.process.exited).toBe(0)
      const returned = terminal(fixture, ["connect", "another-entry"])
      try {
        await until(async () =>
          returned.output().includes("[You control input]"),
        )
        expect((await fixture.binding("another-entry")).id).toBe(created.id)
        expect(returned.output()).not.toContain("already exists")
      } finally {
        await close(returned)
      }
    } finally {
      await close(owner)
    }
  },
  20000,
)
