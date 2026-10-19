import { expect, test } from "bun:test"
import { chmod, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { Terminal } from "@xterm/headless"
import { Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip

integration(
  "takeover, editing and repeated handoffs append below intact Agent records",
  async () => {
    const f = await Fixture.create()
    let owner: ReturnType<typeof Bun.spawn> | undefined
    const terminal = new Terminal({
      cols: 120,
      rows: 35,
      allowProposedApi: true,
      scrollback: 10000,
    })
    let rendering = Promise.resolve()
    let raw = ""
    const decoder = new TextDecoder()
    const rows = () =>
      Array.from(
        { length: terminal.buffer.active.length },
        (_, index) =>
          terminal.buffer.active.getLine(index)?.translateToString(true) ?? "",
      )
    const count = (value: string) => raw.split(value).length
    const until = async (check: () => boolean, label: string) => {
      const deadline = performance.now() + 8000
      while (!check()) {
        if (performance.now() > deadline) throw new Error(label)
        await Bun.sleep(15)
      }
      await rendering
    }
    try {
      const bin = join(f.directory, "bin")
      await mkdir(bin, { mode: 0o700 })
      const ssh = join(bin, "ssh")
      await Bun.write(
        ssh,
        "#!/bin/sh\nPS1='测试> '; export PS1\nexec /bin/bash --noprofile --norc\n",
      )
      await chmod(ssh, 0o755)
      f.env.PATH = `${bin}:${f.env.PATH}`
      owner = Bun.spawn(
        [
          process.execPath,
          "--no-env-file",
          join(root, "src/cli.ts"),
          "connect",
          "render-entry",
        ],
        {
          env: { ...f.env, TERM: "xterm-256color" },
          terminal: {
            cols: 120,
            rows: 35,
            data(_pty, bytes) {
              raw = (raw + decoder.decode(bytes, { stream: true })).slice(
                -1048576,
              )
              const copy = Buffer.from(bytes)
              rendering = rendering.then(
                () =>
                  new Promise<void>((resolve) => terminal.write(copy, resolve)),
              )
            },
          },
        },
      )
      await until(
        () => raw.includes("[You control input]") && raw.includes("测试> "),
        "Initial input projection",
      )
      const binding = await f.binding("render-entry")
      f.sockets.add(binding.socketPath)
      for (let cycle = 0; cycle < 3; cycle++) {
        const prepared = await f.cli([
          cycle === 0 ? "ready" : "resume",
          "--session-id",
          binding.id,
          "--confirm",
          "--timeout",
          "5",
          "--json",
        ])
        expect(prepared.code).toBe(0)
        const command = `printf 'REPORT_${cycle}_%02d\\n' {1..24}`
        const result = await f.cli([
          "exec",
          "--session-id",
          binding.id,
          "--request-id",
          `render-${cycle}`,
          "--json",
          command,
        ])
        expect(result.code).toBe(0)
        await until(() => raw.includes(`REPORT_${cycle}_24`), "Agent records")
        for (let index = 1; index <= 24; index++)
          expect(rows()).toContain(
            `REPORT_${cycle}_${String(index).padStart(2, "0")}`,
          )
        const before = count("[Local menu]")
        owner.terminal?.write("?")
        await until(
          () => count("[Local menu]") === before + 1,
          "Local takeover menu",
        )
        const returned = count("[Input returned to you]")
        owner.terminal?.write("t")
        await until(
          () => count("[Input returned to you]") === returned + 1,
          "Human takeover",
        )
        owner.terminal?.write(`MANUAL_${cycle}_ABC`)
        await until(
          () => rows().some((value) => value.includes(`MANUAL_${cycle}_ABC`)),
          "Immediate input without Enter",
        )
        owner.terminal?.write("\x1b[D\x7fZ\x05")
        await until(
          () => rows().some((value) => value.includes(`MANUAL_${cycle}_AZC`)),
          "Readline editing",
        )
        const screen = rows()
        const last = screen.indexOf(`REPORT_${cycle}_24`)
        const input = screen.findIndex((value) =>
          value.includes(`MANUAL_${cycle}_AZC`),
        )
        expect(input).toBeGreaterThan(last)
        for (let index = 1; index <= 24; index++)
          expect(screen).toContain(
            `REPORT_${cycle}_${String(index).padStart(2, "0")}`,
          )
        // Explicit user Ctrl+U clears the test's unsubmitted command. The view
        // must not send an Enter to make room for input during takeover.
        owner.terminal?.write("\x15printf 'HUMAN_DONE\\n'\r")
        await f.untilCapture(
          (value) => value.split("\n").includes("HUMAN_DONE"),
          binding.alias,
        )
      }
      expect(raw).not.toContain("\x1b[?1049l")
    } finally {
      if (owner?.exitCode === null) owner.kill("SIGTERM")
      if (owner) {
        await owner.exited
        owner.terminal?.close()
      }
      await rendering
      terminal.dispose()
      await f.cleanup()
    }
  },
  30000,
)
