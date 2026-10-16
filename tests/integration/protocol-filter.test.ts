import { expect, test } from "bun:test"
import { join } from "node:path"
import { compatibleBash, Fixture, root } from "../helpers.ts"

const bash = await compatibleBash()
const integration = Bun.which("tmux") && bash ? test : test.skip

integration(
  "a target stripping frame delimiters cannot turn visible ACK text into readiness",
  async () => {
    const fixture = await Fixture.create()
    try {
      const report = join(fixture.directory, "filtered-delimiter-count")
      const external = await fixture.external([
        process.execPath,
        "--no-env-file",
        "--config=/dev/null",
        join(root, "tests/fixtures/filtered-shell.ts"),
        bash ?? "/bin/bash",
        report,
      ])
      expect(
        (
          await fixture.cli([
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
      const binding = await fixture.binding()
      const prepared = await fixture.cli([
        "ready",
        "--session-id",
        binding.id,
        "--confirm",
        "--timeout",
        "1",
        "--json",
      ])
      // The inner Bash actually emitted delimiters; the fixture removed them.
      expect(Number(await Bun.file(report).text())).toBeGreaterThanOrEqual(2)
      expect(prepared.code).toBe(7)
      expect(prepared.result).toMatchObject({
        ok: false,
        completed: false,
        execution_state: "unknown",
        recovery_required: true,
      })
      expect((await fixture.binding()).preparation).toMatchObject({
        phase: "failed",
        reason: "TIMEOUT",
        inputStarted: true,
      })
      const status = await fixture.cli([
        "status",
        "--session-id",
        binding.id,
        "--json",
      ])
      expect(status.result).toMatchObject({
        display_state: "needs_human",
        next_action: { action: "takeover" },
      })
      const forbidden = await fixture.cli([
        "exec",
        "--session-id",
        binding.id,
        "--request-id",
        "must-not-run",
        "--json",
        `printf forbidden > '${fixture.directory}/effect'`,
      ])
      expect(forbidden.result.execution_state).toBe("not_started")
      expect(await Bun.file(join(fixture.directory, "effect")).exists()).toBe(
        false,
      )
    } finally {
      await fixture.cleanup()
    }
  },
  15000,
)
