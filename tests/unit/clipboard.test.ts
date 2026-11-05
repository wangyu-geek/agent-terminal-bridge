import { afterEach, expect, test } from "bun:test"
import { unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { copySessionId } from "../../src/clipboard.ts"
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

test("macOS copies the complete handoff text through stdin without a newline", async () => {
  const f = await fixture()
  const id = "0123456789abcdef0123456789abcdef"
  expect(await copySessionId(id, { platform: "darwin", env: f.env })).toBe(true)
  expect(await Bun.file(join(f.directory, "clipboard")).text()).toBe(
    `session_id=${id}`,
  )
  expect(await Bun.file(join(f.directory, "clipboard.args")).text()).toBe(
    `${join(f.directory, "clipboard-bin/pbcopy")}\n`,
  )
})

test("Wayland uses the text clipboard", async () => {
  const f = await fixture()
  expect(
    await copySessionId("wayland-session", {
      platform: "linux",
      env: { ...f.env, WAYLAND_DISPLAY: "fixture", DISPLAY: ":fixture" },
    }),
  ).toBe(true)
  expect(await Bun.file(join(f.directory, "clipboard.args")).text()).toBe(
    `${join(f.directory, "clipboard-bin/wl-copy")}\n--type\ntext/plain\n`,
  )
})

test("X11 writes the clipboard selection rather than the primary selection", async () => {
  const f = await fixture()
  expect(
    await copySessionId("x11-session", {
      platform: "linux",
      env: { ...f.env, WAYLAND_DISPLAY: undefined, DISPLAY: ":fixture" },
    }),
  ).toBe(true)
  expect(await Bun.file(join(f.directory, "clipboard.args")).text()).toBe(
    `${join(f.directory, "clipboard-bin/xclip")}\n-selection\nclipboard\n`,
  )
})

test("Linux falls back when a clipboard tool fails or is missing", async () => {
  const f = await fixture()
  const bin = join(f.directory, "clipboard-bin")
  await writeFile(join(bin, "wl-copy"), "#!/bin/sh\nexit 1\n")
  await unlink(join(bin, "xclip"))
  expect(
    await copySessionId("fallback-session", {
      platform: "linux",
      env: {
        ...f.env,
        PATH: bin,
        WAYLAND_DISPLAY: "fixture",
        DISPLAY: ":fixture",
      },
    }),
  ).toBe(true)
  expect(await Bun.file(join(f.directory, "clipboard.args")).text()).toBe(
    `${join(bin, "xsel")}\n--clipboard\n--input\n`,
  )
  expect(await Bun.file(join(f.directory, "clipboard")).text()).toBe(
    "session_id=fallback-session",
  )
})

test("headless Linux and unsupported platforms do not invoke clipboard tools", async () => {
  const f = await fixture()
  for (const platform of ["linux", "win32"] as const)
    expect(
      await copySessionId("unavailable", {
        platform,
        env: { ...f.env, WAYLAND_DISPLAY: undefined, DISPLAY: undefined },
      }),
    ).toBe(false)
  expect(await Bun.file(join(f.directory, "clipboard")).exists()).toBe(false)
})

test("missing and failed clipboard tools return a recoverable failure", async () => {
  const f = await fixture()
  expect(
    await copySessionId("missing", {
      platform: "darwin",
      env: { ...f.env, PATH: join(f.directory, "missing") },
    }),
  ).toBe(false)
  await writeFile(
    join(f.directory, "clipboard-bin/pbcopy"),
    "#!/bin/sh\nprintf 'ignored output'\nprintf 'ignored error' >&2\nexit 1\n",
  )
  expect(
    await copySessionId("failed", { platform: "darwin", env: f.env }),
  ).toBe(false)
})

test("an unresponsive clipboard tool is killed within a bounded time", async () => {
  const f = await fixture()
  await writeFile(
    join(f.directory, "clipboard-bin/pbcopy"),
    "#!/bin/sh\nexec /bin/sleep 30\n",
  )
  const start = performance.now()
  expect(
    await copySessionId("timeout", { platform: "darwin", env: f.env }),
  ).toBe(false)
  expect(performance.now() - start).toBeLessThan(3000)
})
