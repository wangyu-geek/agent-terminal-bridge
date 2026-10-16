// biome-ignore lint/suspicious/noControlCharactersInRegex: OSC terminal sequences are deliberately removed from untrusted output.
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: CSI starts with the ESC control byte.
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: Remaining controls must be rendered visibly, never emitted to the terminal.
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g

export function sanitizeText(text: string): string {
  return text
    .replace(OSC, "")
    .replace(CSI, "")
    .replace(/\r\n/g, "\n")
    .replace(
      CONTROLS,
      (character) =>
        `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )
}

export function truncateUtf8(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false }
  const bytes = Buffer.from(text)
  let end = maxBytes
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true }
}
