import { BridgeError } from "./errors.ts"

export class TerminalRenderer {
  private readonly decoder = new TextDecoder()
  private readonly validator = new TextDecoder("utf-8", { fatal: true })
  private mode: "text" | "escape" | "csi" | "osc" | "osc_escape" = "text"
  private sequence = ""
  private pendingCr = false
  private value = ""
  private bytes = 0
  truncated = false
  encodingLossy = false
  constructor(readonly limit: number) {}

  push(bytes: Uint8Array): void {
    if (!this.encodingLossy) {
      try {
        this.validator.decode(bytes, { stream: true })
      } catch {
        this.encodingLossy = true
      }
    }
    this.consume(this.decoder.decode(bytes, { stream: true }))
  }
  finish(): string {
    if (!this.encodingLossy) {
      try {
        this.validator.decode()
      } catch {
        this.encodingLossy = true
      }
    }
    this.consume(this.decoder.decode())
    if (this.pendingCr) {
      this.append("\\r")
      this.pendingCr = false
    }
    if (this.sequence) this.append(visible(this.sequence))
    this.sequence = ""
    return this.value
  }
  drain(): string {
    const value = this.value
    this.value = ""
    this.bytes = 0
    return value
  }
  private consume(text: string): void {
    for (const char of text) {
      if (this.mode !== "text") {
        this.sequence += char
        if (this.mode === "escape") {
          if (char === "[") this.mode = "csi"
          else if (char === "]") this.mode = "osc"
          else this.flushSequence()
        } else if (this.mode === "csi" && char >= "@" && char <= "~") {
          this.sequence = ""
          this.mode = "text"
        } else if (
          (this.mode === "osc" && char === "\x07") ||
          (this.mode === "osc_escape" && char === "\\")
        ) {
          this.sequence = ""
          this.mode = "text"
        } else if (this.mode === "osc" && char === "\x1b")
          this.mode = "osc_escape"
        else if (this.mode === "osc_escape") this.mode = "osc"
        if (this.sequence.length > 4096) this.flushSequence()
        continue
      }
      if (this.pendingCr) {
        this.append(char === "\n" ? "\n" : "\\r")
        this.pendingCr = false
        if (char === "\n") continue
      }
      if (char === "\r") {
        this.pendingCr = true
        continue
      }
      if (char === "\x1b") {
        this.mode = "escape"
        this.sequence = char
        continue
      }
      this.append(visible(char))
    }
  }
  private flushSequence(): void {
    this.append(visible(this.sequence))
    this.sequence = ""
    this.mode = "text"
  }
  private append(text: string): void {
    const size = Buffer.byteLength(text)
    if (this.bytes + size > this.limit) {
      this.truncated = true
      return
    }
    if (this.truncated) return
    this.value += text
    this.bytes += size
  }
}

function visible(value: string): string {
  let output = ""
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    output +=
      (code < 32 && char !== "\n" && char !== "\t") ||
      (code >= 127 && code <= 159)
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : char
  }
  return output
}

export interface ProbeResult {
  host: string
  user: string
  cwd: string
  bashMajor: number
  bashVersion: string | null
}

export class FrameParser {
  private readonly prefix: Buffer
  private pending = Buffer.alloc(0)
  private began = false
  private ended = false
  exitCode: number | null = null
  completedAt: number | null = null
  rejected: string | null = null
  probe: ProbeResult | null = null
  readonly output: TerminalRenderer
  constructor(
    readonly bindingNonce: string,
    readonly requestNonce: string,
    readonly kind: "run" | "probe" | "install",
    maxOutput: number,
  ) {
    this.output = new TerminalRenderer(maxOutput)
    this.prefix = Buffer.from(`\x1eATB1|${bindingNonce}|${requestNonce}|`)
  }
  get running(): boolean {
    return this.began
  }
  get completed(): boolean {
    return this.ended
  }
  feed(chunk: Uint8Array): void {
    this.pending = Buffer.concat([this.pending, chunk])
    while (this.pending.length) {
      const start = this.pending.indexOf(0x1e)
      if (start < 0) {
        this.body(this.pending)
        this.pending = Buffer.alloc(0)
        return
      }
      if (start > 0) {
        this.body(this.pending.subarray(0, start))
        this.pending = this.pending.subarray(start)
      }
      const prefix = this.prefix
      const compared = Math.min(prefix.length, this.pending.length)
      if (
        !this.pending.subarray(0, compared).equals(prefix.subarray(0, compared))
      ) {
        this.body(this.pending.subarray(0, 1))
        this.pending = this.pending.subarray(1)
        continue
      }
      if (this.pending.length < prefix.length) return
      const end = this.pending.indexOf(0x1f, 1)
      if (end < 0) {
        if (this.pending.length > 8192)
          throw new BridgeError(
            "PROTOCOL_ERROR",
            "Execution frame exceeds its limit",
          )
        return
      }
      if (end > 8192)
        throw new BridgeError(
          "PROTOCOL_ERROR",
          "Execution frame exceeds its limit",
        )
      const raw = this.pending.subarray(0, end + 1)
      this.pending = this.pending.subarray(end + 1)
      const frame = raw.subarray(1, -1).toString("latin1").split("|")
      if (
        frame[0] !== "ATB1" ||
        frame[1] !== this.bindingNonce ||
        frame[2] !== this.requestNonce
      ) {
        this.body(raw)
        continue
      }
      if (this.ended || this.rejected)
        throw new BridgeError(
          "PROTOCOL_ERROR",
          "Duplicate execution completion frame",
        )
      const type = frame[3]
      if (this.kind === "install" && type === "ACK" && frame.length === 4) {
        this.ended = true
        this.completedAt = performance.now()
        this.exitCode = 0
        continue
      }
      if (
        type === "REJECT" &&
        !this.began &&
        frame.length === 5 &&
        /^[A-Z_]{1,64}$/.test(frame[4] ?? "")
      ) {
        this.rejected = frame[4] ?? "REJECTED"
        continue
      }
      if (
        this.kind === "probe" &&
        type === "PROBE" &&
        [8, 9].includes(frame.length)
      ) {
        const major = Number(frame[7])
        if (!Number.isInteger(major) || major < 3)
          throw new BridgeError(
            "PROTOCOL_ERROR",
            "Unsupported shell profile response",
          )
        const version = frame[8] ?? null
        if (version !== null) {
          const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
          if (
            !parts ||
            Number(parts[1]) !== major ||
            (major === 3 && Number(parts[2]) < 2)
          )
            throw new BridgeError(
              "PROTOCOL_ERROR",
              "Unsupported or inconsistent Bash version",
            )
        } else if (major === 3)
          throw new BridgeError(
            "PROTOCOL_ERROR",
            "Bash 3 requires a verified minor version",
          )
        this.probe = {
          host: decodeField(frame[4] ?? "", 255),
          user: decodeField(frame[5] ?? "", 128),
          cwd: decodeField(frame[6] ?? "", 4096),
          bashMajor: major,
          bashVersion: version,
        }
        this.ended = true
        this.completedAt = performance.now()
        this.exitCode = 0
        continue
      }
      if (
        this.kind === "run" &&
        type === "BEGIN" &&
        frame.length === 4 &&
        !this.began
      ) {
        this.began = true
        continue
      }
      if (
        this.kind === "run" &&
        type === "END" &&
        frame.length === 5 &&
        this.began &&
        /^\d{1,3}$/.test(frame[4] ?? "")
      ) {
        const code = Number(frame[4])
        if (code <= 255) {
          this.ended = true
          this.completedAt = performance.now()
          this.exitCode = code
          continue
        }
      }
      throw new BridgeError(
        "PROTOCOL_ERROR",
        "Malformed or out-of-order execution frame",
      )
    }
  }
  finish(): string {
    if (this.pending.length) this.body(this.pending)
    this.pending = Buffer.alloc(0)
    return this.output.finish()
  }
  private body(bytes: Uint8Array): void {
    if (this.began && !this.ended) this.output.push(bytes)
  }
}

function decodeField(value: string, limit: number): string {
  const bytes = Buffer.from(value, "base64")
  if (!value || bytes.length > limit || bytes.toString("base64") !== value)
    throw new BridgeError("PROTOCOL_ERROR", "Invalid encoded shell metadata")
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new BridgeError("PROTOCOL_ERROR", "Shell metadata is not UTF-8")
  }
}
