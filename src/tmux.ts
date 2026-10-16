import { lstat, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { ControlClient } from "./control.ts"
import { BridgeError, requireValue } from "./errors.ts"
import type { Binding, Pane } from "./models.ts"
import { runProcess } from "./process.ts"

const PANE_FORMAT = [
  "#{pid}",
  "#{session_id}",
  "#{window_id}",
  "#{pane_id}",
  "#{pane_pid}",
  "#{pane_dead}",
  "#{pane_in_mode}",
  "#{alternate_on}",
  "#{pane_height}",
  "#{synchronize-panes}",
  "#{@atb_server_instance}",
  "#{@atb_binding}",
].join("\t")

export class Tmux {
  constructor(readonly socket: string) {}
  async run(
    args: string[],
    maxBytes = 65536,
    timeoutMs = 5000,
  ): Promise<string> {
    const result = await runProcess(
      ["tmux", "-u", "-S", this.socket, ...args],
      {
        maxBytes,
        timeoutMs,
      },
    )
    if (result.exitCode !== 0)
      throw new BridgeError(
        "TMUX_ERROR",
        "tmux operation failed; inspect session state",
        8,
      )
    return result.stdout
  }
  async inspect(target: string): Promise<Pane> {
    const fields = (
      await this.run(["display-message", "-p", "-t", target, PANE_FORMAT])
    )
      .replace(/\r?\n$/, "")
      .split("\t")
    requireValue(
      fields.length === 12,
      "PROTOCOL_ERROR",
      "Invalid tmux metadata",
      8,
    )
    const num = (index: number) => {
      const value = fields[index] ?? ""
      requireValue(
        /^\d+$/.test(value),
        "PROTOCOL_ERROR",
        "Invalid numeric tmux metadata",
        8,
      )
      return Number(value)
    }
    const sessionId = fields[1] ?? ""
    const windowId = fields[2] ?? ""
    const paneId = fields[3] ?? ""
    requireValue(
      /^\$\d+$/.test(sessionId) &&
        /^@\d+$/.test(windowId) &&
        /^%\d+$/.test(paneId),
      "PROTOCOL_ERROR",
      "Invalid tmux object identity",
      8,
    )
    return {
      serverPid: num(0),
      sessionId,
      windowId,
      paneId,
      pid: num(4),
      dead: num(5) !== 0,
      inMode: num(6) !== 0,
      alternate: num(7) !== 0,
      height: num(8),
      synchronized: fields[9] === "1" || fields[9] === "on",
      serverInstance: fields[10] ?? "",
      marker: fields[11] ?? "",
    }
  }
  async serverInstance(): Promise<string> {
    const value = (
      await this.run(["display-message", "-p", "#{@atb_server_instance}"])
    ).trim()
    if (value) {
      requireValue(
        /^[a-f0-9]{32}$/.test(value),
        "BINDING_CHANGED",
        "tmux server marker is invalid",
        4,
      )
      return value
    }
    const nonce = randomNonce()
    await this.run(["set-option", "-g", "@atb_server_instance", nonce])
    return nonce
  }
  async memberships(paneId: string): Promise<string[]> {
    const rows = (
      await this.run([
        "list-panes",
        "-a",
        "-F",
        "#{session_id}:#{window_id}:#{pane_id}",
      ])
    )
      .trim()
      .split("\n")
    return rows.filter((row) => row.split(":")[2] === paneId)
  }
  async clients(sessionId: string) {
    const output = await this.run([
      "list-clients",
      "-t",
      sessionId,
      "-F",
      "#{client_name}\t#{client_readonly}\t#{client_control_mode}\t#{client_pid}\t#{client_created}\t#{client_flags}",
    ])
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, readonly, control, pid, created, flags] = line.split("\t")
        requireValue(
          name &&
            /^[A-Za-z0-9_/.:-]{1,256}$/.test(name) &&
            /^(0|1)$/.test(readonly ?? "") &&
            /^(0|1)$/.test(control ?? "") &&
            /^\d+$/.test(pid ?? "") &&
            /^\d+$/.test(created ?? ""),
          "PROTOCOL_ERROR",
          "Invalid tmux client metadata",
          8,
        )
        return {
          name,
          readonly: readonly === "1",
          control: control === "1",
          key: `${name}|${pid}|${created}`,
          ignoreSize: (flags ?? "").split(",").includes("ignore-size"),
        }
      })
  }
  async setReadonly(
    client: string,
    value: boolean,
    sessionId: string,
  ): Promise<void> {
    const before = (await this.clients(sessionId)).find(
      (item) => item.name === client,
    )
    if (!before || before.readonly === value) return
    if (value)
      await this.run(["refresh-client", "-t", client, "-f", "read-only"])
    else {
      // refresh-client deliberately cannot remove READONLY in tmux 3.8.
      // The owner-only toggle also clears ignore-size; restore that flag.
      await this.run([
        "switch-client",
        "-E",
        "-c",
        client,
        "-t",
        sessionId,
        "-r",
      ])
      if (before.ignoreSize)
        await this.run(["refresh-client", "-t", client, "-f", "ignore-size"])
    }
    const after = (await this.clients(sessionId)).find(
      (item) => item.key === before.key,
    )
    requireValue(
      !after || after.readonly === value,
      "PROTOCOL_ERROR",
      "Client read-only transition was not applied",
    )
  }
  async sendBytes(
    target: string,
    bytes: Uint8Array,
    enter: boolean,
    expected?: Binding,
  ): Promise<void> {
    const pane = await this.inspect(target)
    const deadline = performance.now() + 5000
    // A command client otherwise inherits a read-only observer's context.
    // Disable subscriptions so raw input cannot expose other panes' output.
    const control = await ControlClient.open(
      {
        socketPath: this.socket,
        sessionId: pane.sessionId,
        paneId: pane.paneId,
        ...(expected
          ? {
              serverInstance: expected.serverInstance,
              marker: expected.marker,
              serverPid: expected.serverPid,
              panePid: expected.panePid,
            }
          : {}),
      },
      () => {},
      () => {},
      deadline,
      false,
    )
    try {
      await control.sendBytes(bytes, enter, deadline)
    } finally {
      await control.close()
    }
  }
  async capture(
    binding: Binding,
    lines: number,
    screen: string,
    limit: number,
    alternateActive = false,
  ): Promise<string> {
    const target = paneTarget(binding)
    // tmux -a reads saved_grid: the main screen saved while an alternate
    // application is active. Its default grid is the active alternate screen.
    const mode =
      screen === "mode"
        ? ["-M"]
        : screen === "normal" && alternateActive
          ? ["-a"]
          : []
    const text = await this.run(
      ["capture-pane", "-p", ...mode, "-t", target, "-S", String(-lines)],
      Math.max(limit * 4, 4 * 1024 * 1024),
    )
    return text.replace(/\n+$/, "").split("\n").slice(-lines).join("\n")
  }
}

export function paneTarget(binding: Binding): string {
  return `${binding.sessionId}:${binding.windowId}.${binding.paneId}`
}
export function randomNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex")
}

export async function canonicalSocket(path: string): Promise<string> {
  try {
    const stat = await lstat(path)
    requireValue(
      stat.isSocket() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.(),
      "INVALID_BINDING",
      "Socket is not owned by the current user",
      4,
    )
    // Bun 1.4.2 on macOS cannot realpath a Unix socket itself (EOPNOTSUPP).
    return join(await realpath(dirname(path)), basename(path))
  } catch {
    throw new BridgeError(
      "INVALID_BINDING",
      "tmux socket is missing or unsafe",
      4,
    )
  }
}

export async function checkTmux(minimum = "3.2") {
  const result = await runProcess(["tmux", "-V"])
  const version = /tmux (\d+)\.(\d+)([a-z]?)/.exec(result.stdout)
  const required = /^(\d+)\.(\d+)([a-z]?)$/.exec(minimum)
  requireValue(
    version && required,
    "DEPENDENCY_MISSING",
    "Cannot determine tmux version",
    3,
  )
  const actualMajor = Number(version[1])
  const actualMinor = Number(version[2])
  requireValue(
    actualMajor > Number(required[1]) ||
      (actualMajor === Number(required[1]) &&
        (actualMinor > Number(required[2]) ||
          (actualMinor === Number(required[2]) &&
            (version[3]?.codePointAt(0) ?? 0) >=
              (required[3]?.codePointAt(0) ?? 0)))),
    "DEPENDENCY_MISSING",
    `tmux >=${minimum} is required`,
    3,
  )
  const commands = await runProcess([
    "tmux",
    "-L",
    `atb-doctor-${process.pid}`,
    "list-commands",
  ])
  for (const name of [
    "capture-pane",
    "send-keys",
    "display-message",
    "refresh-client",
    "list-clients",
    "new-session",
    "switch-client",
  ]) {
    requireValue(
      commands.stdout.includes(`${name} `),
      "UNSUPPORTED_CAPABILITY",
      "Required tmux command is missing",
      3,
    )
  }
  requireValue(
    /send-keys.*\[[^\]]*H/.test(commands.stdout),
    "UNSUPPORTED_CAPABILITY",
    "tmux hexadecimal input is required",
    3,
  )
  return {
    version: result.stdout.trim(),
    capabilities: tmuxCommandCapabilities(commands.stdout),
  }
}

export function tmuxCommandCapabilities(commands: string) {
  const flags = /^capture-pane[^[]*\[([^\]]+)\]/m.exec(commands)?.[1] ?? ""
  return { capture_mode_screen: flags.includes("M") }
}
