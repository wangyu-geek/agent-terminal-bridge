import { afterEach, expect, test } from "bun:test"
import { chmod, lstat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { Fixture } from "../helpers.ts"

const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fixture() {
  const f = await Fixture.create()
  fixtures.push(f)
  await f.configure({ schema_version: 1 })
  Object.assign(f.env, {
    LC_ALL: undefined,
    LC_MESSAGES: undefined,
    LANG: undefined,
  })
  return f
}

test("help detects the local language and supports manual and persistent overrides", async () => {
  const f = await fixture()
  const english = (await f.cli(["--help"])).stdout
  expect(english).toContain("Shared terminal for you and your Agent")
  expect(english).toContain("Open a new SSH session")
  expect(english).toContain("return to an existing session")
  expect(english).toContain("List and manage sessions")
  f.env.LANG = "zh_CN.UTF-8"
  const chinese = (await f.cli(["--help"])).stdout
  expect(chinese).toContain("你与 Agent 的共享终端")
  expect(chinese).toContain("新建 SSH 会话")
  expect(chinese).toContain("返回已有会话")
  expect(chinese).toContain("查看和管理会话")
  expect((await f.cli(["--help", "--lang", "en"])).stdout).toContain(
    "Shared terminal for you",
  )
  await f.configure({ schema_version: 1, defaults: { language: "en" } })
  expect((await f.cli(["--help"])).stdout).toContain("Shared terminal for you")
  expect((await f.cli(["--help", "--lang", "auto"])).stdout).toContain(
    "你与 Agent 的共享终端",
  )
  await f.configure({ schema_version: 1, defaults: { language: "zh-CN" } })
  f.env.LC_ALL = "C"
  expect((await f.cli(["--help"])).stdout).toContain("你与 Agent 的共享终端")
  expect((await f.cli(["--help", "--lang=auto"])).stdout).toContain(
    "Shared terminal for you",
  )
  expect((await f.cli(["unknown"])).stderr).toContain("未知命令")
  expect((await f.cli(["--unknown", "--lang", "zh-CN"])).stderr).toContain(
    "命令行参数无效",
  )
  await expect(lstat(f.statePath)).rejects.toMatchObject({ code: "ENOENT" })
})

test("explicit config paths use the same language setting", async () => {
  const f = await fixture()
  const path = join(f.directory, "other config.json")
  await Bun.write(
    path,
    JSON.stringify({ schema_version: 1, defaults: { language: "zh-CN" } }),
  )
  // A normally readable configuration also works through an explicit path.
  await chmod(path, 0o644)
  expect((await f.cli(["--help", "--config", path])).stdout).toContain(
    "你与 Agent 的共享终端",
  )
})

test("a user-created configuration with a normal umask is immediately usable", async () => {
  const f = await fixture()
  const path = join(f.directory, "config/agent-terminal-bridge/config.json")
  await unlink(path)
  const writer = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "--config=/dev/null",
      "-e",
      'process.umask(0o022); await Bun.write(process.argv[1], JSON.stringify({ schema_version: 1, defaults: { language: "zh-CN" } }))',
      path,
    ],
    {
      env: f.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      timeout: 1000,
      killSignal: "SIGKILL",
    },
  )
  expect(await writer.exited).toBe(0)
  expect((await lstat(path)).mode & 0o777).toBe(0o644)
  expect((await f.cli(["--help"])).stdout).toContain("你与 Agent 的共享终端")
  expect((await f.cli(["capabilities", "--json"])).code).toBe(0)
  expect((await lstat(path)).mode & 0o777).toBe(0o644)
})

test("invalid settings and broken configuration use a usable startup language", async () => {
  const f = await fixture()
  f.env.LANG = "zh_CN.UTF-8"
  for (const args of [["--lang", "fr"], ["--lang"], ["--unknown"]]) {
    const result = await f.cli(args)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/无效/)
    expect(result.stdout).toBe("")
    expect(result.stderr).not.toContain("at main")
  }
  await f.configure({ schema_version: 1, defaults: { language: "fr" } })
  expect((await f.cli(["capabilities"])).code).toBe(2)
  expect((await f.cli(["--help"])).stdout).toContain("你与 Agent 的共享终端")
  await Bun.write(
    join(f.directory, "config/agent-terminal-bridge/config.json"),
    "{",
  )
  const broken = await f.cli(["capabilities", "--lang", "zh-CN"])
  expect(broken.code).toBe(2)
  expect(broken.stderr).toContain("不是有效的 JSON")
  expect((await f.cli(["--help", "--lang", "en"])).code).toBe(0)
})

test("help groups commands into CLI subcommand sections", async () => {
  const f = await fixture()
  const root = (await f.cli(["--help", "--lang", "en"])).stdout
  const sections = [
    "DESCRIPTION",
    "USAGE",
    "GLOBAL FLAGS",
    "SUBCOMMANDS",
    "NOTES",
  ]
  const positions = sections.map((section) => root.indexOf(section))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  expect(root).toContain("remote-terminal <subcommand>")
  expect(root).not.toMatch(/^ {2}exec\s/m)
  const advanced = (await f.cli(["--help", "--advanced", "--lang", "en"]))
    .stdout
  expect(advanced).toMatch(/^ {2}exec\s/m)
  const grouped = (await f.cli(["session", "--help", "--lang", "en"])).stdout
  expect(grouped).toContain(
    "USAGE\n  remote-terminal session <subcommand> [flags]",
  )
  for (const name of ["list", "status", "stop", "unbind"])
    expect(grouped).toMatch(new RegExp(`^  ${name}\\s`, "m"))
  const listHelp = (await f.cli(["session", "list", "--help", "--lang", "en"]))
    .stdout
  expect(listHelp).toContain("remote-terminal session list [--history]")
  expect(listHelp).toContain("--history")
  expect(listHelp).not.toContain("SUBCOMMANDS")
  const connect = (await f.cli(["connect", "--help", "--lang", "en"])).stdout
  expect(connect).toContain("remote-terminal connect [SSH_ALIAS] [flags]")
  expect(connect).toContain("ARGUMENTS")
  expect(connect).toContain("--new")
  expect((await f.cli(["help", "session"])).stdout).toContain(
    "remote-terminal session <subcommand>",
  )
  expect((await f.cli(["unknown", "--help"])).stdout).toContain("DESCRIPTION")
  expect((await f.cli(["-v"])).stdout).toMatch(/0\.1\.0/)
})

test("JSON help, capabilities and errors are independent of the display language", async () => {
  const f = await fixture()
  for (const args of [
    ["--help"],
    ["session", "--help"],
    ["capabilities"],
    ["unknown"],
    ["session", "status", "--pane", "bad"],
  ]) {
    const english = await f.cli([...args, "--lang", "en", "--json"])
    const chinese = await f.cli([...args, "--lang", "zh-CN", "--json"])
    expect(chinese.code).toBe(english.code)
    expect(chinese.stdout).toBe(english.stdout)
    expect(chinese.stderr).toBe("")
  }
  const invalid = await f.cli(["--lang", "bad", "--json"])
  expect(invalid.result).toMatchObject({
    schema_version: 1,
    error: { code: "INVALID_INPUT", message: "Invalid language" },
  })
  const rootHelp = (await f.cli(["--help", "--json"])).result
  expect(rootHelp.commands).toContain("session")
  expect(rootHelp.commands).not.toContain("status")
  const sessionHelp = await f.cli(["session", "--help", "--json"])
  expect(sessionHelp.result.commands).toEqual([
    "list",
    "status",
    "stop",
    "unbind",
  ])
  const localized = await f.cli(["session", "--help", "--lang", "zh-CN"])
  expect(localized.stdout).toContain("查看指定会话状态")
  expect(localized.stdout).toContain("停止受管理会话")
  expect(localized.stdout).toContain("解除绑定，终端继续运行")
  const connectHelp = (await f.cli(["connect", "--help", "--json"])).result
  expect(connectHelp).toMatchObject({
    command: "remote-terminal connect",
    arguments: [{ name: "SSH_ALIAS string" }],
    flags: [{ flags: "--new" }],
  })
})

test("language flags after the argument terminator are treated as command data", async () => {
  const f = await fixture()
  expect((await f.cli(["--help", "--", "--lang", "zh-CN"])).stdout).toContain(
    "Shared terminal for you",
  )
})
