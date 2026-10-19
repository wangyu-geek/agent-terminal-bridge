// Only local controls are decoded. Human-owned input otherwise remains byte
// exact so SSH/readline retain their own keyboard protocol handling.
export class TerminalInput {
  private pending = Buffer.alloc(0)
  private scope = ""
  revision = 0

  get waiting(): boolean {
    return this.pending.length > 0
  }

  feed(bytes: Uint8Array, scope: string, localKeys: boolean): Buffer {
    this.revision++
    if (scope !== this.scope) this.pending = Buffer.alloc(0)
    this.scope = scope
    let input = Buffer.concat([this.pending, bytes])
    this.pending = Buffer.alloc(0)
    const output: Buffer[] = []
    while (input.length) {
      const start = input.indexOf(0x1b)
      if (start < 0) {
        output.push(input)
        break
      }
      if (start > 0) {
        output.push(input.subarray(0, start))
        input = input.subarray(start)
      }
      if (input.length === 1) {
        this.pending = input
        break
      }
      if (input[1] !== 0x5b) {
        output.push(input.subarray(0, 1))
        input = input.subarray(1)
        continue
      }
      let end = 2
      while (
        end < input.length &&
        (input[end] ?? 0) >= 0x20 &&
        (input[end] ?? 0) <= 0x3f
      )
        end++
      if (end === input.length && end < 64) {
        this.pending = input
        break
      }
      if (end >= 64 || (input[end] ?? 0) < 0x40 || (input[end] ?? 0) > 0x7e) {
        output.push(input.subarray(0, 1))
        input = input.subarray(1)
        continue
      }
      const sequence = input.subarray(0, end + 1)
      output.push(decodeLocalKey(sequence, localKeys))
      input = input.subarray(end + 1)
    }
    return Buffer.concat(output)
  }

  flush(): Buffer {
    this.revision++
    const bytes = this.pending
    this.pending = Buffer.alloc(0)
    return bytes
  }
}

function decodeLocalKey(sequence: Buffer, localKeys: boolean): Buffer {
  const text = sequence.subarray(2).toString("ascii")
  const csi =
    /^(\d+)(?::(\d*)(?::\d*)?)?(?:;(\d+)(?::([123]))?)?(?:;[\d:]+)?u$/.exec(
      text,
    )
  const other = /^27;(\d+);(\d+)~$/.exec(text)
  if (!csi && !other) return sequence
  const code = Number(csi ? csi[1] : other?.[2])
  const modifier = Number(csi ? (csi[3] ?? 1) : other?.[1]) - 1
  const event = Number(csi?.[4] ?? 1)
  if (modifier < 0 || modifier > 255 || !Number.isSafeInteger(code))
    return sequence
  const control = (modifier & 4) !== 0
  const supported = (modifier & ~(1 | 4 | 64 | 128)) === 0
  if (code === 93 && control && supported)
    return event === 3 ? Buffer.alloc(0) : Buffer.from([0x1d])
  if (!localKeys || control || !supported || code > 127) return sequence
  // Kitty may report the unshifted '/' key plus Shift, or an explicit shifted
  // codepoint, whereas CSI u/modifyOtherKeys commonly report '?' directly.
  const printable =
    modifier & 1 ? (csi?.[2] ? Number(csi[2]) : code === 47 ? 63 : code) : code
  if (printable > 127 || !Number.isInteger(printable)) return sequence
  return event === 3 ? Buffer.alloc(0) : Buffer.from([printable])
}
