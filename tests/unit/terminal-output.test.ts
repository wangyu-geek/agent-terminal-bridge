import { expect, test } from "bun:test"
import { FrameParser } from "../../src/protocol.ts"
import {
  HumanTerminalOutput,
  TerminalOutput,
} from "../../src/terminal-output.ts"

const nonce = "a".repeat(32)
const request = "b".repeat(32)
const frame = (body: string) =>
  Buffer.from(`\x1eATB1|${nonce}|${request}|${body}\x1f`)
const displayFrame = (body: string) =>
  Buffer.from(`\x1eATBV1|${nonce}|${request}|COMMAND|${body}\x1f`)

test("manual output preserves login bytes and split Unicode, hiding a late END after takeover", () => {
  const parts: Buffer[] = []
  const view = new HumanTerminalOutput((bytes) =>
    parts.push(Buffer.from(bytes)),
  )
  const login = Buffer.from("\x1b[2K密码:你好\r\n")
  for (const byte of Buffer.concat([
    login,
    frame("END|0"),
    Buffer.from("prompt "),
  ]))
    view.feed(Uint8Array.of(byte))
  expect(Buffer.concat(parts)).toEqual(
    Buffer.concat([login, Buffer.from("prompt ")]),
  )
})

test("human presentation shows the actual command and streaming output, without transport echo or screen capture", () => {
  let text = ""
  const view = new TerminalOutput(nonce, (value) => {
    text += value
  })
  const command = "df -h; printf '你好\\n'"
  const traffic = Buffer.concat([
    Buffer.from(`__atb_load_${nonce} append invisible-base64\r\n`),
    frame("ACK"),
    Buffer.from(`__atb_${nonce} run ${request} encoded\r\n`),
    displayFrame(Buffer.from(command).toString("base64")),
    frame("BEGIN"),
    Buffer.from("你好\x1b[?1049h\x1b[?1000h\x1b]52;c;clipboard\x07\r\n"),
  ])
  for (const byte of traffic) view.feed(Uint8Array.of(byte))
  expect(text).toContain(`$ ${command}`)
  expect(text).toContain("你好\n")
  expect(text).not.toContain("__atb")
  expect(text).not.toContain("ATB1")
  expect(text).not.toContain("clipboard")
  expect(text).not.toContain("\x1b")
  expect(text).not.toContain("reported exit")
  for (const byte of frame("END|7")) view.feed(Uint8Array.of(byte))
  view.feed(Buffer.from("prompt-after-command"))
  expect(text).toContain("exit 7")
  expect(text).not.toContain("prompt-after-command")
})

test("COMMAND is optional presentation metadata, never command output or completion", () => {
  const parser = new FrameParser(nonce, request, "run", 1024)
  parser.feed(displayFrame(Buffer.from("df -h").toString("base64")))
  expect(parser.running).toBe(false)
  expect(parser.completed).toBe(false)
  parser.feed(frame("BEGIN"))
  parser.feed(Buffer.from("result"))
  parser.feed(frame("END|0"))
  expect(parser.finish()).toBe("result")
  const malformed = new FrameParser(nonce, request, "run", 1024)
  malformed.feed(displayFrame("not-base64"))
  expect(malformed.completed).toBe(false)
})

test("presentation keeps streaming after large output and drops no later completion", () => {
  let size = 0
  let tail = ""
  const view = new TerminalOutput(nonce, (value) => {
    size += value.length
    tail = value
  })
  view.feed(frame("BEGIN"))
  for (let n = 0; n < 10; n++) view.feed(Buffer.alloc(262144, 65))
  view.feed(frame("END|0"))
  expect(size).toBeGreaterThan(2621440)
  expect(tail).toContain("exit 0")
})
