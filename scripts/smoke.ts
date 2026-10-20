import assert from "node:assert/strict"
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { paneTarget, Tmux } from "../src/tmux.ts"
import { compatibleBash, Fixture, root } from "../tests/helpers.ts"

const bash = await compatibleBash()
assert(
  bash && Bun.which("tmux"),
  "Packaging smoke checks require tmux and Bash >=3.2",
)
const packageArgument = process.argv
  .find((value) => value.startsWith("--package="))
  ?.slice(10)
const packagePath = packageArgument ? resolve(packageArgument) : null
for (const artifact of [
  "cli.js",
  "remote-terminal",
  ...(packagePath ? ["installed-package"] : []),
]) {
  const f = await Fixture.create()
  try {
    const directory = join(f.directory, "artifact with spaces")
    await mkdir(directory, { mode: 0o700 })
    const binary = await prepareArtifact(artifact, directory, f, packagePath)
    const poison = join(directory, "unwanted-preload")
    await writeFile(
      join(directory, "bunfig.toml"),
      'preload = ["./unwanted.ts"]\n',
    )
    await writeFile(
      join(directory, "unwanted.ts"),
      `await Bun.write(${JSON.stringify(poison)}, "bad")`,
    )
    await writeFile(
      join(directory, ".env"),
      `XDG_STATE_HOME=${directory}/wrong-state\nATB_SMOKE_POISON=unexpected\n`,
    )
    const bin = join(f.directory, "fake-bin")
    await mkdir(bin, { mode: 0o700 })
    await writeFile(
      join(bin, "ssh"),
      `#!/bin/sh\numask 077\nprintf '%s%s%s%s%s' "\${LANG+x}" "\${LC_ALL+x}" "\${LC_CTYPE+x}" "\${LC_TERMINAL+x}" "\${LC_TERMINAL_VERSION+x}" > "$ATB_SMOKE_LOCALE_REPORT"\nexec /bin/sh\n`,
      { mode: 0o700 },
    )
    const localeReport = join(f.directory, "ssh-locale-report")
    Object.assign(f.env, {
      PATH: `${bin}:${f.env.PATH ?? ""}`,
      ATB_SMOKE_LOCALE_REPORT: localeReport,
      LANG: "C",
      LC_ALL: "C",
      LC_CTYPE: "C",
      LC_TERMINAL: "fixture-terminal",
      LC_TERMINAL_VERSION: "1.2",
    })
    const call = async (args: string[], doctor = false) => {
      const child = Bun.spawn([binary, ...args, "--json"], {
        cwd: directory,
        env: doctor ? { ...f.env, XDG_STATE_HOME: undefined } : f.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const [code, text, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      assert.equal(code, 0, `${artifact}: ${error || text}`)
      const value: Record<string, unknown> = JSON.parse(text)
      assert.equal(value.schema_version, 1)
      return value
    }
    assert.equal(
      (await call(["capabilities"])).requires_multimodal_model,
      false,
    )
    const doctor = await call(["doctor"], true)
    assert.equal(
      doctor.state_directory,
      join(f.directory, ".local/state/agent-terminal-bridge"),
    )
    assert.equal(await Bun.file(poison).exists(), false)
    await call(["start"])
    const binding = await f.binding()
    f.sockets.add(binding.socketPath)
    await new Tmux(binding.socketPath).sendBytes(
      paneTarget(binding),
      Buffer.from(`exec '${bash}' --noprofile --norc`),
      true,
    )
    const ready = await call([
      "ready",
      "--session-id",
      binding.id,
      "--confirm",
      "--timeout",
      "5",
    ])
    assert.equal(ready.ready, true)
    const result = await call([
      "exec",
      "--session-id",
      binding.id,
      "--request-id",
      "package-smoke",
      "--timeout",
      "3",
      `printf '%s|%s|%s' "\${ATB_SMOKE_POISON:-clean}" "$TERM" "$LANG"`,
    ])
    assert.equal(result.completed, true)
    assert.equal(result.terminal_output, "clean|screen-256color|C")
    await call(["takeover", "--session-id", binding.id, "--confirm"])
    await call(["start", "--ssh", "bastion-smoke", "--session", "ssh-smoke"])
    const ssh = await f.binding("ssh-smoke")
    f.sockets.add(ssh.socketPath)
    const deadline = performance.now() + 3000
    while (!(await Bun.file(localeReport).exists())) {
      assert(performance.now() < deadline, "Fake SSH did not write its report")
      await Bun.sleep(10)
    }
    assert.equal(await Bun.file(localeReport).text(), "")
    await call(["stop", "--session-id", ssh.id, "--confirm"])
    await call(["stop", "--confirm"])
    console.log(
      `${artifact}: isolated startup, embedded helper, execution and default SSH locale cleanup passed`,
    )
  } finally {
    await f.cleanup()
  }
}

async function prepareArtifact(
  artifact: string,
  directory: string,
  fixture: Fixture,
  tarball: string | null,
): Promise<string> {
  if (artifact !== "installed-package") {
    const path = join(directory, artifact)
    await copyFile(join(root, "dist", artifact), path)
    await chmod(path, 0o755)
    return path
  }
  assert(tarball)
  const install = join(fixture.directory, "isolated install")
  await mkdir(install, { mode: 0o700 })
  await writeFile(
    join(install, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "agent-terminal-bridge": `file:${tarball}` },
    }),
  )
  const child = Bun.spawn(
    [process.execPath, "install", "--production", "--ignore-scripts"],
    { cwd: install, env: fixture.env, stdout: "pipe", stderr: "pipe" },
  )
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  assert.equal(code, 0, error || output)
  // Do not chmod this path: installation must establish its own executable bin.
  return join(install, "node_modules/.bin/remote-terminal")
}
