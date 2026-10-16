import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { hostname, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { digest } from "../src/locking.ts"
import type { Binding } from "../src/models.ts"
import { paneTarget, Tmux } from "../src/tmux.ts"

export const root = resolve(import.meta.dir, "..")
export class Fixture {
  readonly sockets = new Set<string>()
  private constructor(
    readonly directory: string,
    readonly env: Record<string, string | undefined>,
  ) {}
  static async create(raw = false) {
    const directory = await mkdtemp(join(tmpdir(), "atb-test-"))
    const configHome = join(directory, "config")
    const configDir = join(configHome, "agent-terminal-bridge")
    await mkdir(configDir, { recursive: true, mode: 0o700 })
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({ schema_version: 1, security: { allow_raw_send: raw } }),
      { mode: 0o600 },
    )
    return new Fixture(directory, {
      ...process.env,
      HOME: directory,
      XDG_CONFIG_HOME: configHome,
      XDG_STATE_HOME: join(directory, "state"),
      TMUX: undefined,
      BASH_ENV: undefined,
      ENV: undefined,
      BUN_OPTIONS: undefined,
      BUN_BE_BUN: undefined,
    })
  }
  get statePath() {
    return join(this.directory, "state/agent-terminal-bridge")
  }
  spawnCli(args: string[], stdin?: string) {
    return Bun.spawn(
      [process.execPath, "--no-env-file", join(root, "src/cli.ts"), ...args],
      {
        cwd: root,
        env: this.env,
        stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
  }
  async cli(args: string[], stdin?: string) {
    const child = this.spawnCli(args, stdin)
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const result: Record<string, unknown> = args.includes("--json")
      ? JSON.parse(stdout)
      : {}
    if (args[0] === "start" && code === 0) {
      const binding = await this.binding(option(args, "--session") ?? "remote")
      this.sockets.add(binding.socketPath)
    }
    return { code, stdout, stderr, result }
  }
  async bashSession() {
    const bash = await compatibleBash()
    if (!bash) throw new Error("Bash >=3.2 is required for this fixture")
    const external = await this.external([bash, "--noprofile", "--norc"])
    const bound = await this.cli([
      "bind",
      "--socket",
      external.socket,
      "--pane",
      external.pane,
      "--permissions",
      "read,exec,raw_send",
      "--confirm",
      "--json",
    ])
    if (bound.code !== 0) throw new Error(bound.stdout)
    return this.reinitialize()
  }
  async reinitialize() {
    const generated = await this.cli(["shell-init", "--json"])
    if (generated.code !== 0 || typeof generated.result.code !== "string")
      throw new Error(generated.stdout)
    const binding = await this.binding()
    await this.installFixtureCode(binding, generated.result.code)
    const confirmed = await this.cli([
      "confirm-shell",
      "--expected-host",
      hostname(),
      "--confirm",
      "--timeout",
      "3",
      "--json",
    ])
    if (confirmed.code !== 0) throw new Error(confirmed.stdout)
    const handed = await this.cli([
      "handoff",
      "--to",
      "agent",
      "--confirm",
      "--json",
    ])
    if (handed.code !== 0) throw new Error(handed.stdout)
    return this.binding()
  }
  async installFixtureCode(binding: Binding, code: string) {
    // Source exact generated text in the owned fixture. Rapid unbracketed
    // multiline keystrokes can overrun a PTY. Production never writes this file.
    const path = join(this.directory, `init-${crypto.randomUUID()}.bash`)
    await writeFile(path, code, { mode: 0o600 })
    const quoted = `'${path.replaceAll("'", "'\\''")}'`
    await new Tmux(binding.socketPath).sendBytes(
      paneTarget(binding),
      Buffer.from(`. ${quoted}`),
      true,
    )
  }
  async binding(name = "remote"): Promise<Binding> {
    return JSON.parse(
      await readFile(
        join(this.statePath, "bindings", `${digest(name)}.json`),
        "utf8",
      ),
    )
  }
  async configure(value: object) {
    const path = join(
      this.directory,
      "config/agent-terminal-bridge/config.json",
    )
    await writeFile(path, JSON.stringify(value))
    await chmod(path, 0o600)
  }
  async tmux(socket: string, args: string[]) {
    const child = Bun.spawn(["tmux", "-S", socket, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: this.env,
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (code !== 0) throw new Error(`Test tmux failed: ${stderr}`)
    return stdout.trim()
  }
  async external(command: string[] = ["/bin/sh"]) {
    const socket = join("/tmp", `atb-external-${crypto.randomUUID()}.sock`)
    this.sockets.add(socket)
    const pane = await this.tmux(socket, [
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-s",
      "fixture",
      ...command,
    ])
    return { socket, pane }
  }
  async untilCapture(predicate: (output: string) => boolean, name = "remote") {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      const response = await this.cli(["capture", "--session", name, "--json"])
      const output = String(response.result.terminal_output ?? "")
      if (predicate(output)) return output
      await Bun.sleep(20)
    }
    throw new Error("Expected terminal content did not arrive")
  }
  async cleanup() {
    for (const socket of this.sockets) {
      try {
        const sessions = await this.tmux(socket, [
          "list-sessions",
          "-F",
          "#{session_id}",
        ])
        for (const id of sessions.split("\n"))
          if (/^\$\d+$/.test(id))
            await this.tmux(socket, ["kill-session", "-t", id])
      } catch {
        /* The fixture may intentionally have killed its own sessions. */
      }
    }
    await rm(this.directory, { recursive: true, force: true })
  }
}

export async function compatibleBash(): Promise<string | null> {
  const override = process.env.ATB_TEST_BASH
  if (override && !(await Bun.file(override).exists()))
    throw new Error("ATB_TEST_BASH does not exist")
  for (const path of override
    ? [override]
    : [
        Bun.which("bash"),
        "/opt/homebrew/bin/bash",
        "/usr/local/bin/bash",
        "/usr/bin/bash",
        "/bin/bash",
      ]) {
    if (!path) continue
    if (!(await Bun.file(path).exists())) continue
    const child = Bun.spawn(
      [
        path,
        "--noprofile",
        "--norc",
        "-c",
        "(( BASH_VERSINFO[0] > 3 || (BASH_VERSINFO[0] == 3 && BASH_VERSINFO[1] >= 2) ))",
      ],
      { stdout: "ignore", stderr: "ignore" },
    )
    if ((await child.exited) === 0) return path
    if (override)
      throw new Error("ATB_TEST_BASH must select a runnable Bash >=3.2")
  }
  return null
}

function option(args: string[], key: string): string | undefined {
  const index = args.indexOf(key)
  return index < 0 ? undefined : args[index + 1]
}
