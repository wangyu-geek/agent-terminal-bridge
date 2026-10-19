import { sanitizeText } from "./output.ts"
import { TerminalRenderer } from "./protocol.ts"

// A presentation-only consumer. It cannot complete tasks or authorize input.
// Outside BEGIN/END, readline echoes and helper transfer traffic stay hidden.
export class TerminalOutput {
  private pending = Buffer.alloc(0)
  private request: string | null = null
  private renderer = new TerminalRenderer(262144)
  constructor(
    readonly nonce: string,
    readonly write: (text: string) => void,
  ) {}

  feed(chunk: Uint8Array): void {
    this.pending = Buffer.concat([this.pending, chunk])
    const prefixes = [
      Buffer.from(`\x1eATB1|${this.nonce}|`),
      Buffer.from(`\x1eATBV1|${this.nonce}|`),
    ]
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
      if (
        !prefixes.some((prefix) => {
          const compared = Math.min(prefix.length, this.pending.length)
          return this.pending
            .subarray(0, compared)
            .equals(prefix.subarray(0, compared))
        })
      ) {
        this.body(this.pending.subarray(0, 1))
        this.pending = this.pending.subarray(1)
        continue
      }
      const end = this.pending.indexOf(0x1f)
      if (end < 0 && this.pending.length <= 8192) return
      if (end < 0 || end > 8192) {
        this.body(this.pending.subarray(0, 1))
        this.pending = this.pending.subarray(1)
        continue
      }
      const raw = this.pending.subarray(0, end + 1)
      this.pending = this.pending.subarray(end + 1)
      const frame = raw.subarray(1, -1).toString("ascii").split("|")
      const id = frame[2] ?? ""
      if (!/^[a-f0-9]{32}$/.test(id)) continue
      if (
        frame[0] === "ATBV1" &&
        frame[3] === "COMMAND" &&
        frame.length === 5 &&
        !this.request
      ) {
        const encoded = frame[4] ?? ""
        const command = Buffer.from(encoded, "base64")
        if (command.length <= 2048 && command.toString("base64") === encoded)
          this.write(
            `\n[Agent command]\n$ ${sanitizeText(command.toString("utf8"))}\n`,
          )
      } else if (
        frame[0] === "ATB1" &&
        frame[3] === "BEGIN" &&
        frame.length === 4 &&
        !this.request
      ) {
        this.request = id
        this.renderer = new TerminalRenderer(262144)
      } else if (
        frame[0] === "ATB1" &&
        frame[3] === "END" &&
        frame.length === 5 &&
        id === this.request &&
        /^\d{1,3}$/.test(frame[4] ?? "") &&
        Number(frame[4]) <= 255
      ) {
        this.write(this.renderer.finish())
        this.write(`\n[Shell reported exit ${frame[4]}]\n`)
        this.request = null
      } else if (this.request) this.body(raw)
    }
  }

  private body(bytes: Uint8Array): void {
    if (!this.request) return
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      this.renderer.push(bytes.subarray(offset, offset + 4096))
      this.write(this.renderer.drain())
    }
  }
}

// Preserve login/TUI bytes, but hide late protocol completions after takeover.
export class HumanTerminalOutput {
  private pending = Buffer.alloc(0)
  constructor(readonly write: (bytes: Uint8Array) => void) {}
  feed(chunk: Uint8Array): void {
    this.pending = Buffer.concat([this.pending, chunk])
    const prefixes = [Buffer.from("\x1eATB1|"), Buffer.from("\x1eATBV1|")]
    while (this.pending.length) {
      const start = this.pending.indexOf(0x1e)
      if (start < 0) {
        this.write(this.pending)
        this.pending = Buffer.alloc(0)
        return
      }
      if (start > 0) {
        this.write(this.pending.subarray(0, start))
        this.pending = this.pending.subarray(start)
      }
      const matches = prefixes.some((prefix) => {
        const compared = Math.min(prefix.length, this.pending.length)
        return this.pending
          .subarray(0, compared)
          .equals(prefix.subarray(0, compared))
      })
      const end = this.pending.indexOf(0x1f)
      if (matches && end < 0 && this.pending.length <= 8192) return
      if (
        end >= 0 &&
        end <= 8192 &&
        /^(?:ATB1|ATBV1)\|[a-f0-9]{32}\|[a-f0-9]{32}\|(?:ACK|PROBE\|[ -~]*|COMMAND\|[ -~]*|BEGIN|END\|\d{1,3}|REJECT\|[A-Z_]+)$/.test(
          this.pending.subarray(1, end).toString("ascii"),
        )
      ) {
        this.pending = this.pending.subarray(end + 1)
      } else {
        this.write(this.pending.subarray(0, 1))
        this.pending = this.pending.subarray(1)
      }
    }
  }
}
