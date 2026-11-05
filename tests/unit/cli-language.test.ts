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
  expect((await f.cli(["--help"])).stdout).toContain("shared terminal for you")
  f.env.LANG = "zh_CN.UTF-8"
  expect((await f.cli(["--help"])).stdout).toContain("你与 Agent 的共享终端")
  expect((await f.cli(["--help", "--lang", "en"])).stdout).toContain(
    "shared terminal for you",
  )
  await f.configure({ schema_version: 1, defaults: { language: "en" } })
  expect((await f.cli(["--help"])).stdout).toContain("shared terminal for you")
  expect((await f.cli(["--help", "--lang", "auto"])).stdout).toContain(
    "你与 Agent 的共享终端",
  )
  await f.configure({ schema_version: 1, defaults: { language: "zh-CN" } })
  f.env.LC_ALL = "C"
  expect((await f.cli(["--help"])).stdout).toContain("你与 Agent 的共享终端")
  expect((await f.cli(["--help", "--lang=auto"])).stdout).toContain(
    "shared terminal for you",
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

test("JSON help, capabilities and errors are independent of the display language", async () => {
  const f = await fixture()
  for (const args of [
    ["--help"],
    ["capabilities"],
    ["unknown"],
    ["status", "--pane", "bad"],
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
})

test("language flags after the argument terminator are treated as command data", async () => {
  const f = await fixture()
  expect((await f.cli(["--help", "--", "--lang", "zh-CN"])).stdout).toContain(
    "shared terminal for you",
  )
})
