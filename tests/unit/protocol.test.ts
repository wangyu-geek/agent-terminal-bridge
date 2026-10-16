import { expect, test } from "bun:test"
import { decodeTmuxBytes } from "../../src/control.ts"
import { FrameParser, TerminalRenderer } from "../../src/protocol.ts"
import { shellInitialization } from "../../src/shell.ts"

const binding = "a".repeat(32)
const request = "b".repeat(32)
function frame(type: string) {
  return Buffer.from(`\x1eATB1|${binding}|${request}|${type}\x1f`)
}

test("execution frames survive every byte split and echoed command text is ignored", () => {
  const data = Buffer.concat([
    Buffer.from(`__atb_${binding} run ${request} YWJj\r\n`),
    frame("BEGIN"),
    Buffer.from("你好\x1b[31mred\x1b[0m\r\n"),
    frame("END|7"),
    Buffer.from("prompt"),
  ])
  const parser = new FrameParser(binding, request, "run", 1024)
  for (const byte of data) parser.feed(Uint8Array.of(byte))
  expect(parser.completed).toBe(true)
  expect(parser.exitCode).toBe(7)
  expect(parser.finish()).toBe("你好red\n")
})

test("output limits keep parsing completion and report invalid UTF-8", () => {
  const parser = new FrameParser(binding, request, "run", 6)
  parser.feed(frame("BEGIN"))
  parser.feed(Uint8Array.from([0xff, ...Buffer.from("你好more")]))
  parser.feed(frame("END|0"))
  expect(parser.completed).toBe(true)
  expect(Buffer.byteLength(parser.finish())).toBeLessThanOrEqual(6)
  expect(parser.output.truncated).toBe(true)
  expect(parser.output.encodingLossy).toBe(true)
})

test("malformed, duplicate, oversized and out-of-order frames do not complete", () => {
  const parser = new FrameParser(binding, request, "run", 100)
  expect(() => parser.feed(frame("END|0"))).toThrow("out-of-order")
  const duplicate = new FrameParser(binding, request, "run", 100)
  duplicate.feed(frame("BEGIN"))
  expect(() => duplicate.feed(frame("BEGIN"))).toThrow()
  const huge = new FrameParser(binding, request, "run", 100)
  expect(() =>
    huge.feed(
      Buffer.concat([
        Buffer.from(`\x1eATB1|${binding}|${request}|`),
        Buffer.alloc(9000, 65),
      ]),
    ),
  ).toThrow("limit")
})

test("probe and rejection frames have distinct semantics", () => {
  const parser = new FrameParser(binding, request, "probe", 100)
  parser.feed(
    frame(
      `PROBE|${Buffer.from("host").toString("base64")}|${Buffer.from("user").toString("base64")}|${Buffer.from("/tmp").toString("base64")}|5`,
    ),
  )
  expect(parser.probe).toEqual({
    host: "host",
    user: "user",
    cwd: "/tmp",
    bashMajor: 5,
    bashVersion: null,
  })
  const rejected = new FrameParser(binding, request, "run", 100)
  rejected.feed(frame("REJECT|BAD_PAYLOAD"))
  expect(rejected.completed).toBe(false)
  expect(rejected.rejected).toBe("BAD_PAYLOAD")
})

test("versioned probes accept Bash 3.2 and reject inconsistent or older reports", () => {
  const metadata = ["host", "user", "/tmp"]
    .map((value) => Buffer.from(value).toString("base64"))
    .join("|")
  const compatible = new FrameParser(binding, request, "probe", 100)
  compatible.feed(frame(`PROBE|${metadata}|3|3.2.57`))
  expect(compatible.probe?.bashVersion).toBe("3.2.57")
  for (const report of ["3|3.1.0", "3", "4|3.2.57", "3|not-a-version"]) {
    const parser = new FrameParser(binding, request, "probe", 100)
    expect(() => parser.feed(frame(`PROBE|${metadata}|${report}`))).toThrow()
  }
  const install = new FrameParser(binding, request, "install", 64)
  install.feed(frame("ACK"))
  expect(install.completed).toBe(true)
  expect(() => install.feed(frame("ACK"))).toThrow()
})

test("tmux octal decoding preserves arbitrary raw bytes without UTF-8 conversion", () => {
  expect([...decodeTmuxBytes(Buffer.from("a\\015\\012\\134"))]).toEqual([
    97, 13, 10, 92,
  ])
  expect([...decodeTmuxBytes(Uint8Array.from([255, 254]))]).toEqual([255, 254])
  expect(() => decodeTmuxBytes(Buffer.from("\\bad"))).toThrow()
  expect(() => decodeTmuxBytes(Buffer.from("\\777"))).toThrow()
})

test("stream renderer bounds split OSC and escapes bare controls", () => {
  const renderer = new TerminalRenderer(1024)
  for (const part of ["abc\r", "\n\x1b]0;", "title\x1b", "\\ok\x08\x1b["])
    renderer.push(Buffer.from(part))
  expect(renderer.finish()).toBe("abc\nok\\x08\\x1b[")
})

test("shell template binds one non-exported entrypoint and never includes a real frame", () => {
  const code = shellInitialization(binding)
  expect(code).toContain(`__atb_${binding}()`)
  expect(code).toContain(`export -n -f __atb_${binding}`)
  expect(code).not.toContain("\x1e")
  expect(() => shellInitialization(";malformed")).toThrow()
})

test("unrelated record separators and foreign frames do not swallow a valid END", () => {
  const parser = new FrameParser(binding, request, "run", 1024)
  const body = Buffer.from(
    "binary\x1enot-a-frame\x1eATB1|foreign|request|END|0\x1fbody",
  )
  parser.feed(Buffer.concat([frame("BEGIN"), body, frame("END|0")]))
  expect(parser.completed).toBe(true)
  expect(parser.finish()).toContain("not-a-frame")
  expect(parser.exitCode).toBe(0)
})
