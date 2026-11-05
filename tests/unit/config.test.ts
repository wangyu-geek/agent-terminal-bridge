import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, stat, symlink } from "node:fs/promises"
import { join } from "node:path"
import { effectivePermissions, loadConfig } from "../../src/config.ts"
import { sanitizeText, truncateUtf8 } from "../../src/output.ts"
import {
  checkExistingFile,
  readJsonSecure,
  validateRawInput,
} from "../../src/security.ts"
import { tmuxCommandCapabilities } from "../../src/tmux.ts"
import { Fixture } from "../helpers.ts"

const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fixture() {
  const value = await Fixture.create()
  fixtures.push(value)
  return value
}

test("strict configuration rejects unknown fields and disabled protocol guards", async () => {
  const f = await fixture()
  for (const value of [
    { schema_version: 1, mystery: true },
    { schema_version: 1, security: { require_shell_initialization: false } },
    { schema_version: 1, defaults: { timeout_seconds: -1 } },
  ]) {
    await f.configure(value)
    expect((await f.cli(["capabilities", "--json"])).code).toBe(2)
  }
})

test("permissions are the intersection of binding, session and global policy", async () => {
  const f = await fixture()
  const config = await loadConfig(
    `${f.directory}/config/agent-terminal-bridge/config.json`,
  )
  expect(
    effectivePermissions(config, "remote", ["read", "raw_send", "exec"]),
  ).toEqual(["read", "exec"])
  config.allowRawSend = true
  config.policies.remote = ["read"]
  expect(
    effectivePermissions(config, "remote", ["read", "raw_send", "exec"]),
  ).toEqual(["read"])
})

test("raw input rejects execution control characters and enforces a byte limit", () => {
  for (const value of ["pwd\n", "pwd\r", "\x1b[A", "a\0b", "\t", "\u2028"])
    expect(() => validateRawInput(value, 128)).toThrow()
  expect(() => validateRawInput("你", 2)).toThrow()
  expect(() => validateRawInput("printf '%s' '$HOME;你好'", 128)).not.toThrow()
})

test("UTF-8 truncation and terminal sanitization preserve bounded valid text", () => {
  expect(truncateUtf8("a你好b", 5)).toEqual({ text: "a你", truncated: true })
  expect(sanitizeText("\x1b[31mred\x1b[0m\r\n\x1b]0;title\x07ok\x1b")).toBe(
    "red\nok\\x1b",
  )
})

test("minor versions compare numerically with a normally created configuration", async () => {
  const f = await fixture()
  await f.configure({ schema_version: 1, backend: { minimum_version: "3.10" } })
  const path = `${f.directory}/config/agent-terminal-bridge/config.json`
  expect((await loadConfig(path)).minimumTmux).toBe("3.10")
  await chmod(path, 0o644)
  expect((await loadConfig(path)).minimumTmux).toBe("3.10")
})

test("user configuration accepts read access and rejects group or other write access", async () => {
  const f = await fixture()
  const path = join(f.directory, "config/agent-terminal-bridge/config.json")
  for (const mode of [0o600, 0o640, 0o644, 0o444]) {
    await chmod(path, mode)
    expect((await loadConfig(path)).language).toBe("en")
    expect((await stat(path)).mode & 0o777).toBe(mode)
    expect((await f.cli(["capabilities", "--json"])).code).toBe(0)
  }
  for (const mode of [0o620, 0o602, 0o664, 0o666]) {
    await chmod(path, mode)
    await expect(loadConfig(path)).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      exitCode: 2,
    })
  }
  await expect(loadConfig(path)).rejects.toMatchObject({
    code: "INVALID_CONFIG",
    exitCode: 2,
    message: expect.stringContaining("group/other write permission"),
  })
  const english = await f.cli(["capabilities", "--lang", "en", "--json"])
  const chinese = await f.cli(["capabilities", "--lang", "zh-CN", "--json"])
  expect(chinese.stdout).toBe(english.stdout)
  expect(english.result.error).toMatchObject({
    code: "INVALID_CONFIG",
    message: expect.stringContaining(path),
  })
  const human = await f.cli(["capabilities", "--lang", "zh-CN"])
  expect(human.stderr).toContain("不能允许组或其他用户写入")
  expect(human.stderr).toContain("chmod go-w")
  expect(human.stdout).toBe("")
  await chmod(path, 0o600)
  expect((await loadConfig(path)).language).toBe("en")
})

test("allowing readable configuration does not relax private state file checks", async () => {
  const f = await fixture()
  const path = join(f.directory, "config/agent-terminal-bridge/config.json")
  await chmod(path, 0o644)
  expect((await loadConfig(path)).language).toBe("en")
  await expect(checkExistingFile(path)).rejects.toMatchObject({
    code: "UNSAFE_PATH",
  })
  await expect(readJsonSecure(path)).rejects.toMatchObject({
    code: "UNSAFE_PATH",
  })
})

test("configuration path failures remain explicit without following symlinks", async () => {
  const f = await fixture()
  const path = join(f.directory, "config/agent-terminal-bridge/config.json")
  const link = join(f.directory, "config-link.json")
  await symlink(path, link)
  const directory = join(f.directory, "config-directory")
  await mkdir(directory, { mode: 0o700 })
  for (const invalid of [link, directory])
    await expect(loadConfig(invalid)).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: expect.stringContaining("without symbolic links"),
    })
  await expect(
    loadConfig(join(f.directory, "missing.json")),
  ).rejects.toMatchObject({
    code: "INVALID_CONFIG",
    message: expect.stringContaining("Configuration file does not exist:"),
  })
  expect((await loadConfig(path)).language).toBe("en")
})

test("configuration size errors preserve their actionable cause", async () => {
  const f = await fixture()
  const path = join(f.directory, "config/agent-terminal-bridge/config.json")
  await Bun.write(path, " ".repeat(65537))
  await expect(loadConfig(path)).rejects.toMatchObject({
    code: "INVALID_CONFIG",
    message: "Configuration exceeds 64 KiB",
  })
})

test("backend flags distinguish legacy capture support from copy-mode support", () => {
  expect(
    tmuxCommandCapabilities(
      "capture-pane (capturep) [-aCeJNpPq] [-S start-line]",
    ),
  ).toEqual({ capture_mode_screen: false })
  expect(
    tmuxCommandCapabilities(
      "capture-pane (capturep) [-aCeJMNpPq] [-S start-line]",
    ),
  ).toEqual({ capture_mode_screen: true })
})
