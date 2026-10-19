import { expect, test } from "bun:test"
import { TerminalInput } from "../../src/terminal-input.ts"

test("Ctrl+] supports legacy, CSI u, Kitty and modifyOtherKeys across every byte boundary", () => {
  for (const input of [
    "\x1d",
    "\x1b[93;5u",
    "\x1b[93;5:1u",
    "\x1b[93:125:93;5u",
    "\x1b[27;5;93~",
    "\x1b[93;69u",
  ]) {
    for (let offset = 0; offset <= input.length; offset++) {
      const parser = new TerminalInput()
      const result = Buffer.concat([
        parser.feed(Buffer.from(input.slice(0, offset)), "same", false),
        parser.feed(Buffer.from(input.slice(offset)), "same", false),
      ])
      expect(result).toEqual(Buffer.from([0x1d]))
    }
  }
})

test("local menu choices and help decode extended keys only while input is blocked/local", () => {
  for (const [sequence, expected] of [
    ["\x1b[116u", "t"],
    ["\x1b[116;1u", "t"],
    ["\x1b[27;1;99~", "c"],
    ["\x1b[63;2u", "?"],
    ["\x1b[47;2u", "?"],
    ["\x1b[47:63;2u", "?"],
  ]) {
    if (!sequence || !expected) throw new Error("Missing fixture")
    expect(
      new TerminalInput().feed(Buffer.from(sequence), "same", true).toString(),
    ).toBe(expected)
    expect(
      new TerminalInput().feed(Buffer.from(sequence), "same", false).toString(),
    ).toBe(sequence)
  }
  expect(
    new TerminalInput().feed(Buffer.from("\x1b[93;5:3u"), "same", true).length,
  ).toBe(0)
  expect(
    new TerminalInput().feed(Buffer.from("\x1b[116;1:3u"), "same", true).length,
  ).toBe(0)
  expect(
    new TerminalInput()
      .feed(Buffer.from("\x1b[93;13u"), "same", true)
      .toString(),
  ).toBe("\x1b[93;13u")
})

test("human bytes survive unknown sequences, split Unicode, standalone Escape and bounded malformed input", () => {
  const bytes = Buffer.from("密码?\x1b[A\x1bOP\x1b[27;3;93~\x1b[1;5C\x1b")
  const parser = new TerminalInput()
  const output: Buffer[] = []
  for (const byte of bytes)
    output.push(parser.feed(Buffer.from([byte]), "same", false))
  output.push(parser.flush())
  expect(Buffer.concat(output)).toEqual(bytes)
  const huge = Buffer.from(`\x1b[${"3".repeat(1000)}`)
  expect(new TerminalInput().feed(huge, "same", true)).toEqual(huge)
})

test("a pending sequence cannot cross an ownership or local-menu phase change", () => {
  const parser = new TerminalInput()
  expect(parser.feed(Buffer.from("\x1b[93;"), "agent", true).length).toBe(0)
  expect(parser.feed(Buffer.from("5u"), "human", false).toString()).toBe("5u")
})
