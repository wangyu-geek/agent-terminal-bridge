import { BridgeError, requireValue } from "./errors.ts"
import type { Binding } from "./models.ts"

type ControlScope = Pick<Binding, "socketPath" | "sessionId" | "paneId"> &
  Partial<Pick<Binding, "serverInstance" | "marker" | "serverPid" | "panePid">>

interface Reply {
  resolve: (lines: string[]) => void
  reject: (error: unknown) => void
}

export class ControlClient {
  private readonly proc
  private pending = Buffer.alloc(0)
  private reply: Reply | null = null
  private lines: string[] = []
  private readyResolve: (() => void) | undefined
  private readyReject: ((error: unknown) => void) | undefined
  private closed = false
  private stopping = false
  private initial = false
  private armed = false
  private readonly ready: Promise<void>
  private readonly reading: Promise<void>
  private failure: Error | null = null

  private constructor(
    readonly binding: ControlScope,
    readonly onOutput: (bytes: Uint8Array) => void,
    readonly onEvent: (name: string) => void,
    receiveOutput: boolean,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.proc = Bun.spawn(
      [
        "tmux",
        "-u",
        "-S",
        binding.socketPath,
        "-C",
        "attach-session",
        "-E",
        "-f",
        receiveOutput ? "ignore-size" : "ignore-size,no-output",
        "-t",
        binding.sessionId,
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    )
    this.reading = this.consume()
    this.reading.catch((error: unknown) => this.fail(error))
  }

  static async open(
    binding: ControlScope,
    onOutput: (bytes: Uint8Array) => void,
    onEvent: (name: string) => void,
    deadline: number,
    receiveOutput = true,
  ): Promise<ControlClient> {
    requireValue(
      performance.now() < deadline,
      "TIMEOUT",
      "Control deadline expired before connection",
      7,
    )
    const client = new ControlClient(binding, onOutput, onEvent, receiveOutput)
    try {
      await client.wait(client.ready, deadline)
      const identity =
        binding.serverInstance === undefined
          ? binding.paneId
          : `${binding.paneId}|${binding.serverInstance}|${binding.marker}|${binding.serverPid}|${binding.panePid}`
      const format =
        binding.serverInstance === undefined
          ? "ATB_ID #{pane_id}"
          : "ATB_ID #{pane_id}|#{@atb_server_instance}|#{@atb_binding}|#{pid}|#{pane_pid}"
      const reply = await client.command(
        `display-message -p -t ${binding.paneId} "${format}"`,
        deadline,
      )
      requireValue(
        reply.join("") === `ATB_ID ${identity}`,
        "BINDING_CHANGED",
        "Control stream attached to an unexpected pane",
        4,
      )
      client.armed = true
      return client
    } catch (error) {
      await client.close()
      throw error
    }
  }

  async command(command: string, deadline: number): Promise<string[]> {
    requireValue(
      performance.now() < deadline,
      "TIMEOUT",
      "Control deadline expired before input",
      7,
    )
    if (this.failure) throw this.failure
    requireValue(
      !this.reply && !this.closed,
      "PROTOCOL_ERROR",
      "Control client is unavailable",
    )
    const response = new Promise<string[]>((resolve, reject) => {
      this.reply = { resolve, reject }
    })
    this.proc.stdin.write(`${command}\n`)
    await this.proc.stdin.flush()
    return this.wait(response, deadline)
  }

  async sendLine(text: string, deadline: number): Promise<void> {
    await this.sendBytes(Buffer.from(text), true, deadline)
  }
  async sendBytes(
    bytes: Uint8Array,
    enter: boolean,
    deadline: number,
  ): Promise<void> {
    for (let offset = 0; offset < bytes.length; offset += 256) {
      const keys = [...bytes.subarray(offset, offset + 256)].map((byte) =>
        byte.toString(16).padStart(2, "0"),
      )
      await this.command(
        `send-keys -H -t ${this.binding.paneId} ${keys.join(" ")}`,
        deadline,
      )
    }
    if (enter)
      await this.command(`send-keys -t ${this.binding.paneId} Enter`, deadline)
  }
  check(): void {
    if (this.failure) throw this.failure
  }
  async close(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    try {
      this.proc.stdin.end()
    } catch {
      /* The pipe may already be closed; kill and await the owned client below. */
    }
    if (this.proc.exitCode === null) this.proc.kill("SIGTERM")
    await Promise.allSettled([this.proc.exited, this.reading])
  }

  private async consume(): Promise<void> {
    const stderr = (async () => {
      for await (const _chunk of this.proc.stderr) {
        /* Drain diagnostics without persisting terminal data. */
      }
    })().catch((error: unknown) => this.fail(error))
    try {
      for await (const chunk of this.proc.stdout) {
        this.pending = Buffer.concat([this.pending, chunk])
        let end = this.pending.indexOf(0x0a)
        while (end >= 0) {
          const line = this.pending.subarray(0, end)
          this.pending = this.pending.subarray(end + 1)
          this.line(line)
          end = this.pending.indexOf(0x0a)
        }
        if (this.pending.length > 262144)
          throw new BridgeError(
            "PROTOCOL_ERROR",
            "Control message exceeds its buffer limit",
          )
      }
      await Promise.all([this.proc.exited, stderr])
      this.closed = true
      if (!this.stopping)
        throw new BridgeError(
          "CONNECTION_LOST",
          "Control stream closed before completion",
        )
    } catch (error) {
      this.fail(error)
    }
  }

  private line(raw: Buffer): void {
    requireValue(
      raw.length <= 262144,
      "PROTOCOL_ERROR",
      "Control message exceeds its buffer limit",
    )
    const line = raw.toString("utf8").replace(/\r$/, "")
    if (line.startsWith("%output ")) {
      const separator = line.indexOf(" ", 8)
      const pane = line.slice(8, separator)
      if (pane !== this.binding.paneId) {
        this.onEvent("foreign-pane-output")
        return
      }
      this.onOutput(decodeTmuxBytes(raw.subarray(separator + 1)))
      return
    }
    if (line.startsWith("%begin ")) {
      this.lines = []
      return
    }
    if (line.startsWith("%end ")) {
      if (!this.initial) {
        this.initial = true
        this.readyResolve?.()
        return
      }
      const reply = this.reply
      this.reply = null
      reply?.resolve(this.lines)
      return
    }
    if (line.startsWith("%error ")) {
      const reply = this.reply
      this.reply = null
      reply?.reject(
        new BridgeError("PROTOCOL_ERROR", "tmux rejected a control command"),
      )
      return
    }
    if (line.startsWith("%")) {
      const name = line.slice(1).split(" ")[0] ?? "unknown"
      if (
        [
          "window-add",
          "window-close",
          "pane-mode-changed",
          "session-changed",
          "exit",
          "pause",
          "extended-output",
          "foreign-pane-output",
          "layout-change",
        ].includes(name) &&
        this.armed
      )
        this.onEvent(name)
      if (line === this.binding.paneId) this.lines.push(line)
      return
    }
    if (line) this.lines.push(line)
    if (this.lines.length > 128)
      throw new BridgeError("PROTOCOL_ERROR", "Control reply exceeds its limit")
  }
  private fail(error: unknown): void {
    this.failure =
      error instanceof Error
        ? error
        : new BridgeError("PROTOCOL_ERROR", "Control stream failed")
    this.readyReject?.(this.failure)
    this.reply?.reject(this.failure)
    this.reply = null
  }
  private async wait<T>(promise: Promise<T>, deadline: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new BridgeError(
                  "TIMEOUT",
                  "Control operation exceeded its deadline",
                  7,
                ),
              ),
            Math.max(1, deadline - performance.now()),
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}

export function decodeTmuxBytes(text: Uint8Array): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < text.length; ) {
    if (text[index] === 0x5c) {
      const octal = Buffer.from(text.subarray(index + 1, index + 4)).toString(
        "ascii",
      )
      if (!/^[0-7]{3}$/.test(octal) || Number.parseInt(octal, 8) > 255)
        throw new BridgeError("PROTOCOL_ERROR", "Invalid tmux output escape")
      bytes.push(Number.parseInt(octal, 8))
      index += 4
    } else {
      const byte = text[index]
      if (byte === undefined) break
      bytes.push(byte)
      index++
    }
  }
  return Uint8Array.from(bytes)
}
