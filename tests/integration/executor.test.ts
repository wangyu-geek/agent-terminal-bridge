import { afterEach, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { paneTarget, Tmux } from "../../src/tmux.ts"
import { compatibleBash, Fixture } from "../helpers.ts"

const integration =
  Bun.which("tmux") && (await compatibleBash()) ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})
async function fixture(raw = false) {
  const f = await Fixture.create(raw)
  fixtures.push(f)
  return f
}
function execute(id: string, command: string, timeout = "5") {
  return ["exec", "--request-id", id, "--timeout", timeout, "--json", command]
}

integration(
  "CLI handshake, exact exit status and command state isolation",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    const first = await f.cli(
      execute("nonzero", "printf '你好'; printf 'err' >&2; exit 7\n\n"),
    )
    expect(first.code).toBe(1)
    expect(first.result).toMatchObject({
      completed: true,
      exit_code: 7,
      terminal_output: "你好err",
      recovery_required: false,
    })
    const cwd = await f.cli(
      execute("change", "cd /; export ATB_CHILD_ONLY=yes; printf done"),
    )
    expect(cwd.code).toBe(0)
    const next = await f.cli(
      execute(
        "unchanged",
        `pwd; printf '%s' "\${ATB_CHILD_ONLY:-absent}"; declare -F __atb_${binding.shell.nonce} >/dev/null && printf leaked || printf isolated`,
      ),
    )
    expect(next.result.terminal_output).toBe(
      `${binding.shell.cwd}\nabsentisolated`,
    )
  },
)

integration(
  "request IDs prevent duplicate effects and history does not store commands/output",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const command = `printf x >> '${f.directory}/counter'; printf sensitive-test-output`
    expect((await f.cli(execute("once", command))).code).toBe(0)
    const repeated = await f.cli(execute("once", command))
    expect(repeated.result).toMatchObject({
      completed: true,
      output_available: false,
    })
    expect(await readFile(`${f.directory}/counter`, "utf8")).toBe("x")
    expect((await f.cli(execute("once", "echo different"))).code).toBe(2)
    const files = await Array.fromAsync(
      new Bun.Glob("*.json").scan(`${f.statePath}/requests`),
    )
    for (const file of files) {
      const body = await readFile(`${f.statePath}/requests/${file}`, "utf8")
      expect(body).not.toContain("sensitive-test-output")
      expect(body).not.toContain("printf x")
    }
    const query = await f.cli(["request", "--request-id", "once", "--json"])
    expect(query.result).toMatchObject({
      completed: true,
      exit_code: 0,
      output_available: false,
    })
  },
)

integration(
  "truncated output still drains END and binary bytes report encoding loss",
  async () => {
    const f = await fixture()
    await f.configure({
      schema_version: 1,
      defaults: { max_output_bytes: 128 },
    })
    await f.bashSession()
    const large = await f.cli(
      execute("large", "for ((i=0;i<10000;i++)); do printf abcdefghij; done"),
    )
    expect(large.code).toBe(0)
    expect(large.result).toMatchObject({
      completed: true,
      truncated: true,
      exit_code: 0,
    })
    expect(
      Buffer.byteLength(String(large.result.terminal_output)),
    ).toBeLessThanOrEqual(128)
    const bytes = await f.cli(execute("bytes", "printf '\\377'"))
    expect(bytes.result).toMatchObject({
      completed: true,
      encoding_lossy: true,
    })
  },
)

integration(
  "piped commands preserve trailing newlines and reject NUL before dispatch",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const piped = await f.cli(
      ["exec", "--command-stdin", "--request-id", "stdin", "--json"],
      "cat <<'END'\nlast line\nEND\n\n",
    )
    expect(piped.result.terminal_output).toBe("last line\n")
    const invalid = await f.cli(
      ["exec", "--command-stdin", "--request-id", "nul", "--json"],
      "printf unsafe\0",
    )
    expect(invalid.code).toBe(2)
    expect(
      (await f.cli(["request", "--request-id", "nul", "--json"])).code,
    ).toBe(4)
  },
)

integration(
  "timeout does not interrupt the shell and recovery preserves an unknown result",
  async () => {
    const f = await fixture(true)
    await f.bashSession()
    const gate = f.commandGate(`printf survived > '${f.directory}/finished'`)
    try {
      const [timed] = await Promise.all([
        f.cli(execute("timeout", gate.command, "2")),
        waitFor(gate.started),
      ])
      expect(timed.code).toBe(7)
      expect(timed.result).toMatchObject({
        execution_state: "unknown",
        completed: false,
        exit_code: null,
        recovery_required: true,
        error: { code: "TIMEOUT" },
      })
      expect(await Bun.file(`${f.directory}/finished`).exists()).toBe(false)
      expect((await f.cli(execute("blocked", "printf forbidden"))).code).toBe(9)
      await gate.release()
      await waitFor(
        async () => await Bun.file(`${f.directory}/finished`).exists(),
      )
      expect(await readFile(`${f.directory}/finished`, "utf8")).toBe("survived")
      expect(
        (
          await f.cli([
            "handoff",
            "--to",
            "human",
            "--takeover",
            "--request-id",
            "timeout",
            "--confirm",
            "--json",
          ])
        ).code,
      ).toBe(0)
      expect(
        (await f.cli(["send", "--raw", "--text", "pwd", "--enter", "--json"]))
          .code,
      ).toBe(9)
      expect(
        (
          await f.cli([
            "recover",
            "--request-id",
            "timeout",
            "--confirm",
            "--json",
          ])
        ).result,
      ).toMatchObject({ execution_state: "unknown", recovery_recorded: true })
      await f.reinitialize()
      expect(
        (await f.cli(execute("resumed", "printf resumed"))).result
          .terminal_output,
      ).toBe("resumed")
      const old = await f.cli(["request", "--request-id", "timeout", "--json"])
      expect(old.result).toMatchObject({
        execution_state: "unknown",
        completed: false,
        recovered: true,
      })
    } finally {
      await gate.release()
    }
  },
)

integration(
  "losing the initialized function never falls back to executing the encoded payload",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    await new Tmux(binding.socketPath).sendBytes(
      paneTarget(binding),
      Buffer.from(`unset -f __atb_${binding.shell.nonce}`),
      true,
    )
    const result = await f.cli(
      execute(
        "missing-helper",
        `printf unsafe > '${f.directory}/must-not-exist'`,
        "0.2",
      ),
    )
    expect(result.code).toBe(7)
    expect(await Bun.file(`${f.directory}/must-not-exist`).exists()).toBe(false)
  },
)

integration(
  "killed CLI retains its lock and dispatch claim; duplicate requests are never resent",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const owner = f.spawnCli(
      execute(
        "crashed",
        `sleep 0.5; printf once >> '${f.directory}/effect'`,
        "5",
      ),
    )
    try {
      await waitFor(async () =>
        (await f.cli(["status", "--json"])).stdout.includes(
          '"state":"running"',
        ),
      )
      owner.kill("SIGKILL")
      await owner.exited
      const query = await f.cli([
        "request",
        "--request-id",
        "crashed",
        "--json",
      ])
      expect(query.result).toMatchObject({
        execution_state: "unknown",
        completed: false,
      })
      expect((await f.cli(execute("other", "printf blocked"))).code).toBe(6)
      expect((await f.cli(["recover-lock", "--confirm", "--json"])).code).toBe(
        0,
      )
      expect((await f.cli(execute("other", "printf blocked"))).code).toBe(9)
      await waitFor(
        async () => await Bun.file(`${f.directory}/effect`).exists(),
      )
      const repeated = await f.cli(
        execute("crashed", `sleep 0.5; printf once >> '${f.directory}/effect'`),
      )
      expect(repeated.result.execution_state).toBe("unknown")
      expect(await readFile(`${f.directory}/effect`, "utf8")).toBe("once")
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

integration(
  "unsupported shell settings reject before BEGIN and withdraw readiness",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    await new Tmux(binding.socketPath).sendBytes(
      paneTarget(binding),
      Buffer.from("set -e"),
      true,
    )
    const result = await f.cli(
      execute("unsupported-env", `printf forbidden > '${f.directory}/effect'`),
    )
    expect(result.result).toMatchObject({
      execution_state: "not_started",
      completed: false,
      recovery_required: false,
    })
    expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(false)
    expect((await f.cli(["status", "--json"])).result.shell).toMatchObject({
      state: "unknown",
    })
  },
)

integration(
  "losing a pane during execution yields an unknown JSON result",
  async () => {
    const f = await fixture()
    const binding = await f.bashSession()
    const owner = f.spawnCli(execute("disconnected", "sleep 5", "3"))
    const output = new Response(owner.stdout).text()
    const error = new Response(owner.stderr).text()
    try {
      await waitFor(async () =>
        (await f.cli(["status", "--json"])).stdout.includes(
          '"state":"running"',
        ),
      )
      await f.tmux(binding.socketPath, ["kill-pane", "-t", binding.paneId])
      await owner.exited
      expect(await error).toBe("")
      expect(JSON.parse(await output)).toMatchObject({
        execution_state: "unknown",
        completed: false,
        exit_code: null,
        recovery_required: true,
      })
      expect(
        (
          await f.cli([
            "recover",
            "--request-id",
            "disconnected",
            "--confirm",
            "--json",
          ])
        ).code,
      ).toBe(0)
    } finally {
      if (owner.exitCode === null) owner.kill("SIGKILL")
      await owner.exited
    }
  },
)

integration(
  "a malformed active pointer is a state error and cannot admit execution",
  async () => {
    const f = await fixture()
    await f.bashSession()
    const files = await Array.fromAsync(
      new Bun.Glob("active-*.json").scan(`${f.statePath}/requests`),
    )
    const path = `${f.statePath}/requests/${files[0]}`
    const active = JSON.parse(await Bun.file(path).text())
    active.requestId = 123
    await Bun.write(path, JSON.stringify(active))
    const result = await f.cli(
      execute("invalid-active", `printf forbidden > '${f.directory}/effect'`),
    )
    expect(result.code).toBe(8)
    expect(result.result.error).toMatchObject({ code: "STATE_ERROR" })
    expect(await Bun.file(`${f.directory}/effect`).exists()).toBe(false)
  },
)
