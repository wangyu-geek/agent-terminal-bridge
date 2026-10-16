import { afterEach, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { compatibleBash, Fixture, root } from "../helpers.ts"

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
function exec(id: string, command: string, timeout = "5") {
  return ["exec", "--request-id", id, "--timeout", timeout, "--json", command]
}

for (const phase of [
  "prepared",
  "dispatched",
  "running",
  "before_commit",
  "committed",
]) {
  integration(
    `SIGKILL at ${phase} preserves the dispatch/completion boundary`,
    async () => {
      const f = await fixture()
      await f.bashSession()
      const id = `fault-${phase}`
      const command = `sleep 0.3; printf x >> '${f.directory}/effect'`
      const owner = Bun.spawn(
        [
          process.execPath,
          join(root, "tests/fixtures/execution-worker.ts"),
          phase,
          id,
          command,
        ],
        { env: f.env, stdout: "pipe", stderr: "pipe" },
      )
      const reader = owner.stdout.getReader()
      try {
        const observed = await reader.read()
        expect(new TextDecoder().decode(observed.value)).toContain(
          `phase:${phase}`,
        )
        owner.kill("SIGKILL")
        await owner.exited
        const query = await f.cli(["request", "--request-id", id, "--json"])
        expect(query.result.execution_state).toBe(
          phase === "committed" ? "completed" : "unknown",
        )
        expect(query.result.output_available).toBe(false)
        expect(
          (await f.cli(["recover-lock", "--confirm", "--json"])).code,
        ).toBe(0)
        if (phase === "prepared") {
          expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(false)
          expect((await f.cli(exec("new", "printf not-sent"))).code).toBe(9)
        } else {
          await waitFor(
            async () => await Bun.file(`${f.directory}/effect`).exists(),
          )
          expect(await readFile(`${f.directory}/effect`, "utf8")).toBe("x")
        }
        const duplicate = await f.cli(exec(id, command))
        expect(duplicate.result.execution_state).toBe(
          phase === "committed" ? "completed" : "unknown",
        )
        if (phase !== "prepared")
          expect(await readFile(`${f.directory}/effect`, "utf8")).toBe("x")
      } finally {
        if (owner.exitCode === null) owner.kill("SIGKILL")
        await owner.exited
        reader.releaseLock()
      }
    },
  )
}

integration(
  "a separate CLI can request an interrupt without stealing the execution lock",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const owner = f.spawnCli(exec("interrupt-me", "sleep 10", "1.5"))
    const output = new Response(owner.stdout).text()
    const error = new Response(owner.stderr).text()
    try {
      await waitFor(async () =>
        (await f.cli(["status", "--json"])).stdout.includes(
          '"state":"running"',
        ),
      )
      expect((await f.cli(exec("parallel", "printf forbidden"))).code).toBe(6)
      const requested = await f.cli([
        "interrupt",
        "--request-id",
        "interrupt-me",
        "--confirm",
        "--json",
      ])
      expect(requested.result).toMatchObject({
        requested: true,
        sent: false,
        remote_processes_stopped: null,
      })
      await owner.exited
      expect(await error).toBe("")
      const result = JSON.parse(await output)
      expect(result.interrupt_sent).toBe(true)
      if (result.completed) expect(result.exit_code).toBe(130)
      else expect(result.exit_code).toBeNull()
    } finally {
      if (owner.exitCode === null) owner.kill("SIGKILL")
      await owner.exited
    }
  },
)

integration(
  "active manual takeover stops automatic input and preserves uncertainty",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const owner = f.spawnCli(exec("take-me", "sleep 1", "5"))
    const output = new Response(owner.stdout).text()
    const error = new Response(owner.stderr).text()
    try {
      await waitFor(async () =>
        (await f.cli(["status", "--json"])).stdout.includes(
          '"state":"running"',
        ),
      )
      expect(
        (
          await f.cli([
            "handoff",
            "--to",
            "human",
            "--takeover",
            "--request-id",
            "take-me",
            "--confirm",
            "--json",
          ])
        ).code,
      ).toBe(0)
      await owner.exited
      const result = JSON.parse(await output)
      expect(result).toMatchObject({
        execution_state: "unknown",
        completed: false,
        recovery_required: true,
      })
      expect(await error).toBe("")
      expect((await f.cli(["status", "--json"])).result.control).toBe("human")
    } finally {
      if (owner.exitCode === null) owner.kill("SIGKILL")
      await owner.exited
    }
  },
)

async function waitFor(condition: () => Promise<boolean>) {
  const deadline = performance.now() + 5000
  while (!(await condition())) {
    if (performance.now() > deadline)
      throw new Error("Expected fixture state did not arrive")
    await Bun.sleep(20)
  }
}
