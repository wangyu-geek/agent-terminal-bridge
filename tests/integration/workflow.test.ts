import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import { loadConfig } from "../../src/config.ts"
import { BridgeError } from "../../src/errors.ts"
import { Executor } from "../../src/executor.ts"
import type { Binding } from "../../src/models.ts"
import { runProcess } from "../../src/process.ts"
import { writeAtomic } from "../../src/security.ts"
import { Sessions } from "../../src/session.ts"
import { State } from "../../src/state.ts"
import { Tmux } from "../../src/tmux.ts"
import { object, string } from "../../src/validate.ts"
import { Workflow } from "../../src/workflow.ts"
import { Fixture, root } from "../helpers.ts"

const integration = Bun.which("tmux") ? test : test.skip
const fixtures: Fixture[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.cleanup()
})

async function fresh(bash: string) {
  const fixture = await Fixture.create()
  fixtures.push(fixture)
  const prompt = `fixture-shell-${crypto.randomUUID()}>`
  fixture.env.PS1 = `${prompt} `
  const external = await fixture.external([bash, "--noprofile", "--norc"])
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
  // Registration does not prove that Bash has finished starting its input loop.
  await fixture.untilCapture((output) => output.includes(prompt))
  const config = await loadConfig(
    join(fixture.directory, "config/agent-terminal-bridge/config.json"),
  )
  config.stateDir = fixture.statePath
  const sessions = new Sessions(config, new State(config.stateDir))
  return { fixture, sessions, workflow: new Workflow(sessions) }
}

for (const bash of new Set(
  [process.env.ATB_TEST_BASH, "/bin/bash", "/opt/homebrew/bin/bash"].filter(
    (value): value is string => value !== undefined,
  ),
)) {
  const available = await Bun.file(bash).exists()
  ;(available ? integration : test.skip)(
    `ready automatically transfers the helper into a real ${bash} PTY`,
    async () => {
      const { fixture, sessions, workflow } = await fresh(bash)
      const ready = await workflow.ready("remote", 10)
      expect(ready.ready).toBe(true)
      expect(ready.shell.endpoint_label).toBeTruthy()
      const result = await new Executor(sessions).execute(
        "remote",
        "automatic-init",
        "printf '你好'; printf err >&2; exit 7",
        5,
      )
      expect(result.completed).toBe(true)
      expect(result.exit_code).toBe(7)
      expect(result.terminal_output).toBe("你好err")
      const before = await fixture.binding()
      expect((await workflow.ready("remote", 5)).already_ready).toBe(true)
      expect((await fixture.binding()).shell.nonce).toBe(before.shell.nonce)
    },
    20000,
  )
}

integration(
  "a preparation mismatch requires explicit takeover and resume",
  async () => {
    const { fixture, sessions, workflow } = await fresh("/bin/bash")
    await expect(
      workflow.ready("remote", 10, "definitely-not-this-host"),
    ).rejects.toThrow("does not match")
    expect((await fixture.binding()).control).toBe("recovery_required")
    expect((await fixture.binding()).preparation?.phase).toBe("failed")
    await expect(workflow.ready("remote", 5)).rejects.toThrow("resume")
    expect((await workflow.takeover("remote", 5)).taken_over).toBe(true)
    expect((await workflow.resume("remote", 10)).ready).toBe(true)
    expect(
      (
        await new Executor(sessions).execute(
          "remote",
          "after-recovery",
          "printf recovered",
          5,
        )
      ).terminal_output,
    ).toBe("recovered")
  },
  30000,
)

integration(
  "CLI lifecycle uses session_id without requiring a hostname",
  async () => {
    const { fixture } = await fresh("/bin/bash")
    const actualVersion = /version (\d+\.\d+\.\d+)/.exec(
      (await runProcess(["/bin/bash", "--version"])).stdout,
    )?.[1]
    expect(actualVersion).toBeTruthy()
    const id = (await fixture.binding()).id
    const before = await fixture.cli(["doctor", "--session-id", id, "--json"])
    expect(before.result.target_environment).toMatchObject({
      state: "not_checked",
    })
    const ready = await fixture.cli([
      "ready",
      "--session-id",
      id,
      "--confirm",
      "--json",
    ])
    expect(ready.code).toBe(0)
    expect(ready.result).toMatchObject({
      session_id: id,
      ready: true,
      shell: { bash_version: actualVersion },
    })
    const execution = await fixture.cli([
      "exec",
      "--session-id",
      id,
      "--request-id",
      "session-id-command",
      "--json",
      "printf one",
    ])
    expect(execution.result).toMatchObject({
      session_id: id,
      completed: true,
      terminal_output: "one",
    })
    const status = await fixture.cli(["status", "--session-id", id, "--json"])
    expect(status.result).toMatchObject({
      display_state: "ready",
      recent_requests: [
        { request_id: "session-id-command", execution_state: "completed" },
      ],
    })
    const doctor = await fixture.cli(["doctor", "--session-id", id, "--json"])
    expect(doctor.result.target_environment).toMatchObject({
      state: "last_confirmed",
      bash_version: actualVersion,
    })
    expect(
      (
        await fixture.cli([
          "takeover",
          "--session-id",
          id,
          "--confirm",
          "--json",
        ])
      ).result.taken_over,
    ).toBe(true)
    expect(
      (await fixture.cli(["resume", "--session-id", id, "--confirm", "--json"]))
        .result.ready,
    ).toBe(true)
    expect((await fixture.binding()).id).toBe(id)
    expect(
      (await fixture.cli(["status", "--session-id", "f".repeat(32), "--json"]))
        .code,
    ).toBe(4)
    expect(
      (
        await fixture.cli([
          "status",
          "--session-id",
          id,
          "--session",
          "remote",
          "--json",
        ])
      ).code,
    ).toBe(2)
  },
  30000,
)

integration(
  "multiple sessions require selection and a replaced session_id is never followed",
  async () => {
    const { fixture } = await fresh("/bin/bash")
    const original = await fixture.binding()
    const defaultScope = new State(fixture.statePath)
    expect(await defaultScope.select()).toBe("remote")
    const second = await fixture.external([
      "/bin/bash",
      "--noprofile",
      "--norc",
    ])
    expect(
      (
        await fixture.cli([
          "bind",
          "--session",
          "second",
          "--socket",
          second.socket,
          "--pane",
          second.pane,
          "--permissions",
          "read,exec",
          "--confirm",
          "--json",
        ])
      ).code,
    ).toBe(0)
    expect((await fixture.cli(["ready", "--confirm", "--json"])).code).toBe(5)
    expect(
      (
        await fixture.cli([
          "ready",
          "--session-id",
          original.id,
          "--confirm",
          "--json",
        ])
      ).result.ready,
    ).toBe(true)
    expect((await fixture.binding("second")).shell.state).toBe("uninitialized")
    const scoped = new State(fixture.statePath)
    expect(await scoped.select(original.id)).toBe("remote")
    const replacement = { ...(await fixture.binding()), id: "e".repeat(32) }
    await writeAtomic(scoped.bindingPath("remote"), replacement)
    await expect(scoped.load("remote")).rejects.toThrow("replaced")
    await expect(defaultScope.load("remote")).rejects.toThrow("replaced")
    expect(
      (
        await fixture.cli([
          "ready",
          "--session-id",
          original.id,
          "--confirm",
          "--json",
        ])
      ).code,
    ).toBe(4)
  },
  20000,
)

integration(
  "new recovery entrypoints keep the old command unknown without replay",
  async () => {
    const { fixture } = await fresh("/bin/bash")
    const id = (await fixture.binding()).id
    const ready = await fixture.cli([
      "ready",
      "--session-id",
      id,
      "--confirm",
      "--json",
    ])
    expect(ready.result).toMatchObject({ ok: true, ready: true })
    const gate = fixture.commandGate(
      `printf x >> '${fixture.directory}/effect'`,
    )
    try {
      const [result] = await Promise.all([
        fixture.cli([
          "exec",
          "--session-id",
          id,
          "--request-id",
          "slow-effect",
          "--timeout",
          "2",
          "--json",
          gate.command,
        ]),
        until(gate.started),
      ])
      expect(result.code).toBe(7)
      expect(result.result).toMatchObject({
        execution_state: "unknown",
        completed: false,
        exit_code: null,
        recovery_required: true,
        error: { code: "TIMEOUT" },
      })
      expect(await Bun.file(`${fixture.directory}/effect`).exists()).toBe(false)
      expect(
        (
          await fixture.cli([
            "takeover",
            "--session-id",
            id,
            "--confirm",
            "--json",
          ])
        ).result.taken_over,
      ).toBe(true)
      await gate.release()
      await until(
        async () => await Bun.file(`${fixture.directory}/effect`).exists(),
      )
      expect(
        (
          await fixture.cli([
            "resume",
            "--session-id",
            id,
            "--confirm",
            "--json",
          ])
        ).result.ready,
      ).toBe(true)
      expect(
        (
          await fixture.cli([
            "request",
            "--session-id",
            id,
            "--request-id",
            "slow-effect",
            "--json",
          ])
        ).result,
      ).toMatchObject({ execution_state: "unknown", recovered: true })
      const duplicate = await fixture.cli([
        "exec",
        "--session-id",
        id,
        "--request-id",
        "slow-effect",
        "--json",
        gate.command,
      ])
      expect(duplicate.result).toMatchObject({
        execution_state: "unknown",
        recovered: true,
        output_available: false,
      })
      expect(await Bun.file(`${fixture.directory}/effect`).text()).toBe("x")
    } finally {
      await gate.release()
    }
  },
  30000,
)

for (const phase of [
  "freezing",
  "transferring",
  "chunk",
  "handshaking",
  "completed",
]) {
  integration(
    `a preparation coordinator killed at ${phase} requires explicit recovery`,
    async () => {
      const { fixture } = await fresh("/bin/bash")
      const id = (await fixture.binding()).id
      const owner = Bun.spawn(
        [
          process.execPath,
          join(root, "tests/fixtures/preparation-worker.ts"),
          phase,
        ],
        { env: fixture.env, stdout: "pipe", stderr: "pipe" },
      )
      const reader = owner.stdout.getReader()
      try {
        const observed = await reader.read()
        expect(new TextDecoder().decode(observed.value)).toContain(
          `phase:${phase}`,
        )
        if (phase === "transferring") {
          expect(
            (
              await fixture.cli([
                "ready",
                "--session-id",
                id,
                "--confirm",
                "--json",
              ])
            ).code,
          ).toBe(6)
          expect(
            (await fixture.cli(["status", "--session-id", id, "--json"])).result
              .display_state,
          ).toBe("preparing")
        }
        if (phase === "handshaking") {
          const takeover = await fixture.cli([
            "takeover",
            "--session-id",
            id,
            "--confirm",
            "--timeout",
            "0.05",
            "--json",
          ])
          expect(takeover.code).toBe(7)
          expect(takeover.result.taken_over).not.toBe(true)
          expect((await fixture.binding()).control).not.toBe("human")
        }
        owner.kill("SIGKILL")
        await owner.exited
        const status = await fixture.cli([
          "status",
          "--session-id",
          id,
          "--json",
        ])
        expect(status.result.display_state).toBe("needs_human")
        expect(
          (
            await fixture.cli([
              "exec",
              "--session-id",
              id,
              "--request-id",
              "forbidden",
              "--json",
              "printf forbidden",
            ])
          ).code,
        ).not.toBe(0)
        expect(
          (
            await fixture.cli([
              "takeover",
              "--session-id",
              id,
              "--confirm",
              "--json",
            ])
          ).result.taken_over,
        ).toBe(true)
        expect(
          (
            await fixture.cli([
              "resume",
              "--session-id",
              id,
              "--confirm",
              "--json",
            ])
          ).result.ready,
        ).toBe(true)
      } finally {
        if (owner.exitCode === null) owner.kill("SIGKILL")
        await owner.exited
        reader.releaseLock()
      }
    },
    30000,
  )
}

integration(
  "a lost automatically numbered response is located through bounded metadata",
  async () => {
    const { fixture } = await fresh("/bin/bash")
    const id = (await fixture.binding()).id
    await fixture.cli(["ready", "--session-id", id, "--confirm", "--json"])
    const owner = fixture.spawnCli([
      "exec",
      "--session-id",
      id,
      "--json",
      `printf x >> '${fixture.directory}/effect'`,
    ])
    // The caller deliberately discards the complete response, including its ID.
    await Promise.all([
      owner.exited,
      new Response(owner.stdout).arrayBuffer(),
      new Response(owner.stderr).arrayBuffer(),
    ])
    const status = (await fixture.cli(["status", "--session-id", id, "--json"]))
      .result
    const recent = status.recent_requests
    if (!Array.isArray(recent) || recent.length !== 1)
      throw new Error("The single lost request was not uniquely indexed")
    const request = object(recent[0], "recent request")
    const result = await fixture.cli([
      "request",
      "--session-id",
      id,
      "--request-id",
      string(request.request_id, "request ID", 128),
      "--json",
    ])
    expect(result.result).toMatchObject({
      completed: true,
      output_available: false,
      execution_state: "completed",
    })
    expect(await Bun.file(`${fixture.directory}/effect`).text()).toBe("x")
  },
  20000,
)

integration(
  "a disconnected session records acknowledgement without claiming takeover or reconnecting",
  async () => {
    const { fixture } = await fresh("/bin/bash")
    const binding = await fixture.binding()
    await fixture.cli([
      "ready",
      "--session-id",
      binding.id,
      "--confirm",
      "--json",
    ])
    const outcome = await fixture.cli([
      "exec",
      "--session-id",
      binding.id,
      "--request-id",
      "disconnected",
      "--timeout",
      "0.1",
      "--json",
      "sleep 5",
    ])
    expect(outcome.result.execution_state).toBe("unknown")
    await fixture.tmux(binding.socketPath, [
      "kill-session",
      "-t",
      binding.sessionId,
    ])
    const takeover = await fixture.cli([
      "takeover",
      "--session-id",
      binding.id,
      "--confirm",
      "--json",
    ])
    expect(takeover.code).toBe(4)
    expect(takeover.result).toMatchObject({
      taken_over: false,
      connection_ended: true,
      recovery_required: true,
    })
    const resume = await fixture.cli([
      "resume",
      "--session-id",
      binding.id,
      "--confirm",
      "--json",
    ])
    expect(resume.code).toBe(4)
    expect(resume.result).toMatchObject({
      ready: false,
      connection_ended: true,
      recovery_recorded: true,
    })
    const old = await fixture.cli([
      "request",
      "--session-id",
      binding.id,
      "--request-id",
      "disconnected",
      "--json",
    ])
    expect(old.result).toMatchObject({
      execution_state: "unknown",
      recovered: true,
      completed: false,
    })
    expect(
      (
        await fixture.cli([
          "ready",
          "--session-id",
          binding.id,
          "--confirm",
          "--json",
        ])
      ).code,
    ).toBe(4)
  },
  20000,
)

function observer(fixture: Fixture, binding: Binding, readonly: boolean) {
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
async function closeObserver(child: ReturnType<typeof observer>) {
  if (child.exitCode === null) child.kill("SIGTERM")
  child.terminal?.close()
  await child.exited
}

integration(
  "freeze failure before transmission restores only the previously writable client",
  async () => {
    const { fixture, sessions } = await fresh("/bin/bash")
    const binding = await fixture.binding()
    const writer = observer(fixture, binding, false)
    const reader = observer(fixture, binding, true)
    const tmux = new Tmux(binding.socketPath)
    try {
      await until(
        async () =>
          (await tmux.clients(binding.sessionId)).filter(
            (item) => !item.control,
          ).length === 2,
      )
      class FailingFreeze extends Sessions {
        override async freezeClients(current: Binding) {
          await super.freezeClients(current)
          throw new BridgeError("LOCAL_IO_ERROR", "Injected freeze failure")
        }
      }
      const failing = new Workflow(
        new FailingFreeze(sessions.config, sessions.state),
      )
      await expect(failing.ready("remote", 5)).rejects.toThrow(
        "Injected freeze failure",
      )
      expect((await fixture.binding()).preparation).toMatchObject({
        phase: "failed",
        inputStarted: false,
      })
      expect((await sessions.status("remote")).display_state).toBe(
        "awaiting_human",
      )
      expect(
        (await tmux.clients(binding.sessionId))
          .filter((item) => !item.control)
          .map((item) => item.readonly)
          .sort(),
      ).toEqual([false, true])
      expect((await new Workflow(sessions).ready("remote", 10)).ready).toBe(
        true,
      )
      expect(
        (await new Workflow(sessions).takeover("remote", 5)).taken_over,
      ).toBe(true)
      expect(
        (await tmux.clients(binding.sessionId))
          .filter((item) => !item.control)
          .map((item) => item.readonly)
          .sort(),
      ).toEqual([false, true])
    } finally {
      await closeObserver(writer)
      await closeObserver(reader)
    }
  },
  30000,
)

integration(
  "a new native writable client during preparation stops the transfer",
  async () => {
    const { fixture, sessions } = await fresh("/bin/bash")
    const binding = await fixture.binding()
    const tmux = new Tmux(binding.socketPath)
    let writer: ReturnType<typeof observer> | undefined
    const workflow = new Workflow(sessions, {
      at: async (phase) => {
        if (phase !== "transferring") return
        writer = observer(fixture, binding, false)
        await until(async () =>
          (await tmux.clients(binding.sessionId)).some(
            (item) => !item.control && !item.readonly,
          ),
        )
      },
    })
    try {
      await expect(workflow.ready("remote", 5)).rejects.toThrow(
        /writable human client|Preparation stopped/,
      )
      expect((await fixture.binding()).preparation).toMatchObject({
        phase: "failed",
        inputStarted: true,
      })
      expect((await fixture.binding()).shell.state).toBe("unknown")
    } finally {
      if (writer) await closeObserver(writer)
    }
  },
  20000,
)

async function until(condition: () => Promise<boolean>) {
  const deadline = performance.now() + 5000
  while (!(await condition())) {
    if (performance.now() > deadline)
      throw new Error("Expected fixture state did not arrive")
    await Bun.sleep(10)
  }
}
