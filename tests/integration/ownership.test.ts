import { afterEach, expect, test } from "bun:test"
import { hostname } from "node:os"
import type { Binding } from "../../src/models.ts"
import { paneTarget, Tmux } from "../../src/tmux.ts"
import { compatibleBash, Fixture } from "../helpers.ts"

const integration =
  Bun.which("tmux") && (await compatibleBash()) ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup()
})
async function fixture() {
  const f = await Fixture.create()
  fixtures.push(f)
  return f
}

integration(
  "handoff restores only clients made writable by the Bridge's prior ownership",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    expect(
      (await f.cli(["handoff", "--to", "human", "--confirm", "--json"])).code,
    ).toBe(0)
    const writable = client(f, binding, false)
    const readonly = client(f, binding, true)
    try {
      const tmux = new Tmux(binding.socketPath)
      await waitFor(
        async () =>
          (await tmux.clients(binding.sessionId)).filter(
            (item) => !item.control,
          ).length === 2,
      )
      await f.reinitialize()
      const agentClients = (await tmux.clients(binding.sessionId)).filter(
        (item) => !item.control,
      )
      expect(agentClients.map((item) => item.readonly)).toEqual([true, true])
      expect(
        (await f.cli(["handoff", "--to", "human", "--confirm", "--json"])).code,
      ).toBe(0)
      const restored = (await tmux.clients(binding.sessionId)).filter(
        (item) => !item.control,
      )
      expect(restored.filter((item) => item.readonly).length).toBe(1)
      expect(restored.filter((item) => !item.readonly).length).toBe(1)
    } finally {
      for (const proc of [writable, readonly]) {
        if (proc.exitCode === null) proc.kill("SIGTERM")
        proc.terminal?.close()
        await proc.exited
      }
    }
  },
)

integration("a new writable client prevents automatic execution", async () => {
  const f = await fixture()
  const binding = await f.bashSession()
  const writable = client(f, binding, false)
  try {
    await waitFor(async () =>
      (await new Tmux(binding.socketPath).clients(binding.sessionId)).some(
        (item) => !item.control && !item.readonly,
      ),
    )
    const result = await f.cli([
      "exec",
      "--request-id",
      "human-conflict",
      "--json",
      "printf forbidden",
    ])
    expect(result.code).toBe(9)
    expect(result.result.execution_state).toBe("not_started")
  } finally {
    if (writable.exitCode === null) writable.kill("SIGTERM")
    writable.terminal?.close()
    await writable.exited
  }
})

integration(
  "multi-pane sessions are rejected before a payload is dispatched",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    await f.tmux(binding.socketPath, [
      "split-window",
      "-d",
      "-t",
      paneTarget(binding),
      "/bin/sh",
    ])
    const result = await f.cli([
      "exec",
      "--request-id",
      "two-panes",
      "--json",
      `printf forbidden > '${f.directory}/effect'`,
    ])
    expect(result.code).toBe(3)
    expect(result.result.execution_state).toBe("not_started")
    expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(false)
  },
)

integration(
  "hostname mismatch withdraws confirmation without sending the user command",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    await f.cli(["handoff", "--to", "human", "--confirm", "--json"])
    const initialized = await f.cli(["shell-init", "--json"])
    await f.installFixtureCode(binding, String(initialized.result.code))
    const result = await f.cli([
      "confirm-shell",
      "--expected-host",
      `${hostname()}-not-the-host`,
      "--confirm",
      "--json",
    ])
    expect(result.code).toBe(5)
    expect((await f.cli(["status", "--json"])).result.shell).toMatchObject({
      state: "unknown",
      endpoint_label: null,
    })
    expect(
      (await f.cli(["handoff", "--to", "agent", "--confirm", "--json"])).code,
    ).toBe(5)
  },
)

function client(fixture: Fixture, binding: Binding, readonly: boolean) {
  return Bun.spawn(
    [
      "tmux",
      "-S",
      binding.socketPath,
      "attach-session",
      ...(readonly ? ["-r"] : []),
      "-t",
      binding.sessionId,
    ],
    {
      env: { ...fixture.env, TERM: "xterm-256color" },
      terminal: { cols: 100, rows: 30, data() {} },
    },
  )
}
async function waitFor(condition: () => Promise<boolean>) {
  const deadline = performance.now() + 5000
  while (!(await condition())) {
    if (performance.now() > deadline)
      throw new Error("Expected fixture client state did not arrive")
    await Bun.sleep(20)
  }
}

integration(
  "a control connection rechecks the protected binding marker before input",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    await expect(
      new Tmux(binding.socketPath).sendBytes(
        paneTarget(binding),
        Buffer.from(`printf forbidden > '${f.directory}/effect'`),
        true,
        { ...binding, marker: "f".repeat(32) },
      ),
    ).rejects.toThrow("unexpected pane")
    expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(false)
  },
)
