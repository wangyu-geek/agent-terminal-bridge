import { afterEach, expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import { effectivePermissions, loadConfig } from "../../src/config.ts"
import { sanitizeText, truncateUtf8 } from "../../src/output.ts"
import { validateRawInput } from "../../src/security.ts"
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

test("minor versions compare numerically and unsafe configuration files are rejected", async () => {
  const f = await fixture()
  await f.configure({ schema_version: 1, backend: { minimum_version: "3.10" } })
  const path = `${f.directory}/config/agent-terminal-bridge/config.json`
  expect((await loadConfig(path)).minimumTmux).toBe("3.10")
  await chmod(path, 0o644)
  await expect(loadConfig(path)).rejects.toThrow("Cannot read configuration")
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
