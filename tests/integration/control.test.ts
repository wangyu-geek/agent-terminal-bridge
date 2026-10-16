import { expect, test } from "bun:test"
import { hostname } from "node:os"
import { ControlClient } from "../../src/control.ts"
import { FrameParser } from "../../src/protocol.ts"
import { shellInitialization } from "../../src/shell.ts"
import { randomNonce } from "../../src/tmux.ts"
import { compatibleBash, Fixture } from "../helpers.ts"

const bash = await compatibleBash()
const integration = Bun.which("tmux") && bash ? test : test.skip
integration(
  "real control-mode stream probes and executes a non-exported Bash entrypoint",
  async () => {
    const f = await Fixture.create()
    try {
      const external = await f.external([
        bash ?? "/bin/bash",
        "--noprofile",
        "--norc",
      ])
      expect(
        (
          await f.cli([
            "bind",
            "--socket",
            external.socket,
            "--pane",
            external.pane,
            "--permissions",
            "read,exec",
            "--confirm",
            "--json",
          ])
        ).code,
      ).toBe(0)
      const binding = await f.binding()
      const nonce = randomNonce()
      await f.installFixtureCode(binding, shellInitialization(nonce))
      const probeRequest = randomNonce()
      const probe = new FrameParser(nonce, probeRequest, "probe", 1024)
      let event = ""
      const control = await ControlClient.open(
        binding,
        (bytes) => probe.feed(bytes),
        (name) => {
          event = name
        },
        performance.now() + 5000,
      )
      try {
        await control.sendLine(
          `__atb_${nonce} probe ${probeRequest}`,
          performance.now() + 5000,
        )
        await until(() => probe.completed, control)
        expect(probe.probe?.host).toBe(hostname())
        expect(event).toBe("")
      } finally {
        await control.close()
      }
      const request = randomNonce()
      const result = new FrameParser(nonce, request, "run", 1024)
      const run = await ControlClient.open(
        binding,
        (bytes) => result.feed(bytes),
        () => {},
        performance.now() + 5000,
      )
      try {
        const command = "printf '你好-no-newline'; printf 'err' >&2; exit 7\n\n"
        await run.sendLine(
          `__atb_${nonce} run ${request} ${Buffer.from(command).toString("base64")}`,
          performance.now() + 5000,
        )
        await until(() => result.completed, run)
        expect(result.exitCode).toBe(7)
        expect(result.finish()).toBe("你好-no-newlineerr")
      } finally {
        await run.close()
      }
    } finally {
      await f.cleanup()
    }
  },
)

async function until(condition: () => boolean, control: ControlClient) {
  const deadline = performance.now() + 5000
  while (!condition()) {
    control.check()
    if (performance.now() > deadline) throw new Error("Frame did not arrive")
    await Bun.sleep(10)
  }
}
