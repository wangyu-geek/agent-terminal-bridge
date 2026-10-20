import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { DirectoryLock } from "../../src/locking.ts"
import { paneTarget, Tmux, tmuxCommandCapabilities } from "../../src/tmux.ts"
import { Fixture } from "../helpers.ts"

const available = Boolean(Bun.which("tmux"))
const integration = available ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup()
})
async function fixture(raw = false) {
  const f = await Fixture.create(raw)
  fixtures.push(f)
  return f
}

integration(
  "real CLI creates and reuses a registered pane with conservative state",
  async () => {
    const f = await fixture()
    const started = await f.cli(["start", "--json"])
    expect(started.code).toBe(0)
    const repeated = await f.cli(["start", "--json"])
    expect(repeated.result.binding_id).toBe(started.result.binding_id)
    const status = await f.cli(["status", "--json"])
    expect(status.result).toMatchObject({
      binding: "valid",
      control: "human",
      shell: { state: "uninitialized", endpoint_label: null },
    })
    expect(
      (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
        .code,
    ).toBe(5)
    expect((await f.cli(["stop", "--json"])).code).toBe(5)
    expect((await f.cli(["stop", "--confirm", "--json"])).code).toBe(0)
    expect((await f.cli(["status", "--json"])).result.binding).toBe("stale")
  },
)

integration(
  "raw UTF-8 input is literal, explicit Enter executes, capture is limited",
  async () => {
    const f = await fixture(true)
    expect((await f.cli(["start", "--json"])).code).toBe(0)
    expect(
      (
        await f.cli([
          "send",
          "--raw",
          "--text",
          "printf '你好;%s\\n' literal",
          "--enter",
          "--json",
        ])
      ).result,
    ).toMatchObject({ sent: true, completed: false })
    await f.untilCapture((output) =>
      output.split("\n").includes("你好;literal"),
    )
    const output = await f.cli(["capture", "--lines", "3", "--json"])
    expect(output.result.terminal_output).toContain("你好;literal")
    expect(
      String(output.result.terminal_output).split("\n").length,
    ).toBeLessThanOrEqual(3)
    expect(
      (
        await f.cli([
          "send",
          "--raw",
          "--text",
          "pwd\necho forbidden",
          "--enter",
          "--json",
        ])
      ).code,
    ).toBe(2)
    expect((await f.cli(["status", "--pane", "%999999", "--json"])).code).toBe(
      5,
    )
    const audit = await readFile(`${f.statePath}/audit.jsonl`, "utf8")
    expect(audit).not.toContain("literal")
    expect(audit).not.toContain("printf")
  },
)

integration(
  "pane respawn invalidates the binding even when its ID is unchanged",
  async () => {
    const f = await fixture(true)
    await f.cli(["start", "--json"])
    const binding = await f.binding()
    await f.tmux(binding.socketPath, [
      "respawn-pane",
      "-k",
      "-t",
      paneTarget(binding),
      "/bin/sh",
    ])
    expect((await f.cli(["status", "--json"])).result.binding).toBe("stale")
    expect(
      (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
        .code,
    ).toBe(4)
  },
)

integration(
  "external binding is explicit, permission-limited and cannot be stopped",
  async () => {
    const f = await fixture(true)
    const external = await f.external()
    const args = [
      "bind",
      "--socket",
      external.socket,
      "--pane",
      external.pane,
      "--json",
    ]
    expect((await f.cli(args)).code).toBe(5)
    expect((await f.cli([...args, "--confirm"])).code).toBe(0)
    expect(
      (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
        .code,
    ).toBe(5)
    expect((await f.cli(["stop", "--confirm", "--json"])).code).toBe(5)
    expect((await f.cli(["unbind", "--confirm", "--json"])).code).toBe(0)
    expect(
      await f.tmux(external.socket, [
        "display-message",
        "-p",
        "-t",
        external.pane,
        "#{pane_id}",
      ]),
    ).toBe(external.pane)
  },
)

integration(
  "synchronized input is refused and corrupted state fails closed",
  async () => {
    const f = await fixture(true)
    await f.cli(["start", "--json"])
    const binding = await f.binding()
    await f.tmux(binding.socketPath, [
      "set-option",
      "-w",
      "-t",
      binding.windowId,
      "synchronize-panes",
      "on",
    ])
    expect(
      (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
        .code,
    ).toBe(5)
    const files = await Array.fromAsync(
      new Bun.Glob("*.json").scan(`${f.statePath}/bindings`),
    )
    await writeFile(`${f.statePath}/bindings/${files[0]}`, "{broken", {
      mode: 0o600,
    })
    expect((await f.cli(["status", "--json"])).code).toBe(8)
  },
)

integration(
  "errors and capability discovery have one clean JSON result",
  async () => {
    const f = await fixture()
    for (const args of [
      ["nope", "--json"],
      ["capture", "--lines", "NaN", "--json"],
    ]) {
      const result = await f.cli(args)
      expect(result.code).toBe(2)
      expect(result.stderr).toBe("")
      expect(result.result.ok).toBe(false)
    }
    const capabilities = await f.cli(["capabilities", "--json"])
    expect(capabilities.result.features).toMatchObject({
      exec: true,
      raw_send: true,
    })
    expect((await f.cli(["exec", "--json", "pwd"])).code).toBe(4)
  },
)

integration(
  "snapshots distinguish main, active alternate and explicit mode screens",
  async () => {
    const f = await fixture(true)
    await f.cli(["start", "--json"])
    const binding = await f.binding()
    await f.cli([
      "send",
      "--raw",
      "--text",
      "printf '\\102\\101\\123\\105\\n\\033[?1049h\\101\\114\\124'",
      "--enter",
      "--json",
    ])
    const main = await f.cli(["capture", "--json"])
    const alternate = await f.cli([
      "capture",
      "--screen",
      "alternate",
      "--json",
    ])
    expect(main.result.terminal_output).toContain("BASE")
    expect(main.result.terminal_output).not.toContain("ALT")
    expect(alternate.result.terminal_output).toContain("ALT")
    expect(alternate.result.terminal_output).not.toContain("BASE")
    const supported = tmuxCommandCapabilities(
      await new Tmux(binding.socketPath).run(["list-commands"]),
    ).capture_mode_screen
    expect((await f.cli(["capture", "--screen", "mode", "--json"])).code).toBe(
      supported ? 5 : 3,
    )
    await f.tmux(binding.socketPath, ["copy-mode", "-t", paneTarget(binding)])
    const mode = await f.cli(["capture", "--screen", "mode", "--json"])
    expect(mode.code).toBe(supported ? 0 : 3)
    if (!supported)
      expect(mode.result.error).toMatchObject({
        code: "UNSUPPORTED_CAPABILITY",
      })
  },
)

integration(
  "SSH startup clears client locale, preserves other environment and uses literal alias arguments",
  async () => {
    const f = await fixture()
    const bin = `${f.directory}/bin`
    await mkdir(bin, { mode: 0o700 })
    const ssh = `${bin}/ssh`
    await Bun.write(
      ssh,
      `#!/bin/sh\numask 077\nprintf '%s\\n' "$@" > "$ATB_FIXTURE_ARGS"\nprintf '%s|%s|%s|%s|%s\\n%s\\n%s\\n%s\\n' "\${LANG+x}" "\${LC_ALL+x}" "\${LC_CTYPE+x}" "\${LC_TERMINAL+x}" "\${LC_TERMINAL_VERSION+x}" "$SSH_AUTH_SOCK" "$ATB_FIXTURE_KEEP" "$LC_TIME" > "$ATB_FIXTURE_ENV"\nexec /bin/sh\n`,
    )
    await chmod(ssh, 0o755)
    f.env.ATB_FIXTURE_ARGS = `${f.directory}/ssh-arguments`
    f.env.ATB_FIXTURE_ENV = `${f.directory}/ssh-environment`
    f.env.PATH = `${bin}:${f.env.PATH ?? ""}`
    Object.assign(f.env, {
      LANG: "C",
      LC_ALL: "C",
      LC_CTYPE: "C",
      LC_TERMINAL: "fixture-terminal",
      LC_TERMINAL_VERSION: "1.2",
      SSH_AUTH_SOCK: `${f.directory}/fixture-agent.sock`,
      ATB_FIXTURE_KEEP: "literal; value $(unused) 中文",
      LC_TIME: "C",
    })
    expect(
      (await f.cli(["start", "--ssh", "bastion-example", "--json"])).code,
    ).toBe(0)
    const deadline = performance.now() + 3000
    while (
      !(await Bun.file(`${f.directory}/ssh-environment`).exists()) &&
      performance.now() < deadline
    )
      await Bun.sleep(10)
    expect(await Bun.file(`${f.directory}/ssh-arguments`).text()).toBe(
      "-tt\nbastion-example\n",
    )
    expect(await Bun.file(`${f.directory}/ssh-environment`).text()).toBe(
      `||||\n${f.env.SSH_AUTH_SOCK}\n${f.env.ATB_FIXTURE_KEEP}\nC\n`,
    )
    expect(
      (
        await f.cli([
          "start",
          "--session",
          "bad",
          "--ssh",
          "bad;alias",
          "--json",
        ])
      ).code,
    ).toBe(2)
  },
)

integration(
  "audit failure after raw input reports uncertainty and prevents another write",
  async () => {
    const f = await fixture(true)
    await f.cli(["start", "--json"])
    const lock = await DirectoryLock.acquire(`${f.statePath}/locks`, "audit")
    try {
      const result = await f.cli([
        "send",
        "--raw",
        "--text",
        `printf x > '${f.directory}/effect'`,
        "--enter",
        "--json",
      ])
      expect(result.code).toBe(8)
      expect(result.result).toMatchObject({
        execution_state: "unknown",
        recovery_required: true,
      })
      expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(true)
    } finally {
      await lock.release()
    }
    expect(
      (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
        .code,
    ).toBe(9)
  },
)

integration(
  "Unicode snapshots remain UTF-8 when the local client locale is C",
  async () => {
    const f = await fixture(true)
    f.env.LANG = "C"
    f.env.LC_ALL = "C"
    await f.cli(["start", "--json"])
    await f.cli([
      "send",
      "--raw",
      "--text",
      // Emit known UTF-8 bytes without depending on the target readline's
      // non-ASCII key bindings under LC_ALL=C. This tests snapshot encoding.
      "printf '\\344\\275\\240\\345\\245\\275\\n'",
      "--enter",
      "--json",
    ])
    await f.untilCapture((output) => output.split("\n").includes("你好"))
  },
)
