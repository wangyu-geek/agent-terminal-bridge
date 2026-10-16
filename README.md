# Agent Terminal Bridge

An agent-neutral CLI for sharing an explicitly authorized tmux terminal with a human. It returns text or versioned JSON and requires no screen capture, multimodal model, Agent SDK, HTTP service, or remote daemon.

Implemented in TypeScript with Bun 1.4.2. The current implementation includes managed/external pane binding, bounded snapshots, explicit raw input, Bash command execution, durable request records, interruption, human handoff, and recovery. [Solution.md](Solution.md) describes the contracts; [compatibility](docs/compatibility.md) records what has actually been tested.

## Install and build

Development requires Bun 1.4.2 and tmux >=3.2. The execution profile requires Bash >=4 and `base64` on the **target shell**. On macOS the system Bash is too old for this profile; a separately installed compatible Bash can be used for local testing. Ordinary SSH access and interactive bastion authentication remain manual.

```bash
bun install --frozen-lockfile
bun run check
bun run test
bun run build
bun run build:bin
```

- `dist/cli.js` is a Bun bundle. Run it with `bun --no-env-file --config=/dev/null dist/cli.js ...`; a package installation exposes `remote-terminal` and still requires Bun.
- `dist/remote-terminal` is a standalone executable containing its Bun runtime. It still needs local tmux and, when connecting over SSH, OpenSSH.
- Cross-compilation: `bun run build:bin --target=bun-linux-x64`. Other planned targets are `bun-linux-arm64`, `bun-darwin-arm64`, and `bun-darwin-x64`; a successful cross-build is not a target-platform test.

The commands below use `remote-terminal` for an installed package or a standalone executable placed on PATH. From a checkout, substitute `bun run dev --`.

## Share a shell

Create a dedicated local session, then attach in a real terminal:

```bash
remote-terminal start --session remote
remote-terminal attach --session remote --writable
```

A new session is under human control. Complete SSH authentication, MFA and the bastion menu yourself. When appropriate, run `exec ssh -tt bastion` in the pane, replacing `bastion` with your SSH configuration alias. Using `exec` avoids leaving the original local shell behind when SSH exits. `start --ssh bastion` is also available when explicitly requested.

An SSH connection must already be inside tmux or be established there. This tool cannot adopt a running SSH process from an ordinary terminal tab. tmux preserves the local terminal, not the remote connection across network failure.

Inspect the shared pane from another terminal or an Agent:

```bash
remote-terminal status --session remote --json
remote-terminal capture --session remote --lines 200 --json
```

A snapshot is terminal text, not a structured command result. A live pane alone never proves a remote connection or hostname.

Snapshots default to the main screen; `--screen alternate` selects an active alternate screen. `--screen mode` selects a tmux copy-mode screen only when the backend provides `capture-pane -M`; `doctor` reports this optional capability (tmux 3.2 lacks it). Unsupported selection returns exit 3 instead of reading a different buffer.

## Enable non-interactive execution

1. In the target pane, reach an empty prompt in Bash >=4.
2. From another local terminal, generate initialization code:

   ```bash
   remote-terminal shell-init --session remote
   ```

3. Review and paste that generated code into the **chosen target shell**. Use the terminal's normal bracketed-paste support. Initialization defines a temporary, non-exported function in that shell; the CLI does not send it automatically or install remote files.
4. Confirm the target's actual reported hostname, then hand over control:

   ```bash
   # Replace web-01 with the hostname you verified in the selected shell.
   remote-terminal confirm-shell --session remote --expected-host web-01 --confirm --json
   remote-terminal handoff --session remote --to agent --confirm --json
   remote-terminal exec --session remote --request-id inspect-disk-001 --timeout 30 --json 'df -h'
   ```

Existing human clients become read-only while the Agent owns execution. `attach` is read-only by default. The host Agent remains responsible for user authorization of the actual command; `--confirm` acknowledges a management action and is not an authentication token.

Commands run in a separate non-interactive Bash with stdin connected to `/dev/null`. They inherit the current directory and exported environment, but `cd` and `export` do not persist into the interactive shell. Use `cd /path && command` within a request. Editors, pagers, password prompts, `/dev/tty` input, background jobs and detached processes are outside the reliable execution profile.

The result reports `terminal_output`, which combines the shared PTY streams and may include asynchronous noise. It does not claim isolated stdout/stderr. Output can be truncated while completion and the exit code are still detected. The default output limit is 1 MiB; scripts are limited to 2048 UTF-8 bytes and encoded input lines to 4096 bytes.

For a short script without local shell expansion:

```bash
printf '%s\n' 'pwd' 'df -h' | remote-terminal exec --command-stdin --request-id inspect-002 --json
remote-terminal request --request-id inspect-002 --json
```

A repeated request ID never sends the command again. A different command with the same ID is rejected. Only metadata is durable: later queries can confirm completion without recovering the old terminal output.

## Handoff, interrupt and recover

When idle, explicitly return control to a human:

```bash
remote-terminal handoff --to human --confirm --json
remote-terminal attach --writable
```

This invalidates shell confirmation; initialize and confirm again before another Agent handoff.

While an execution coordinator is alive, a separate CLI may request an interrupt:

```bash
remote-terminal interrupt --request-id inspect-disk-001 --confirm --json
```

`requested` is not proof that an interrupt was delivered or that remote processes stopped. A valid completion frame can establish the foreground exit status; otherwise the result remains unknown. Timeout does **not** send Ctrl+C, cancel remote work, retry the request, reconnect, or reauthenticate.

After timeout or another unknown outcome:

```bash
remote-terminal request --request-id inspect-disk-001 --json
remote-terminal handoff --to human --takeover --request-id inspect-disk-001 --confirm --json
remote-terminal attach --writable
```

Inspect and resolve the foreground program yourself. Only after doing so, record recovery:

```bash
remote-terminal recover --request-id inspect-disk-001 --confirm --json
```

Recovery leaves the old result unknown, clears the active dispatch claim, and requires new shell initialization/confirmation. It never reruns the old command. If the connection or pane identity changed, acknowledge the unknown request, unbind the stale binding and explicitly create/bind a new pane.

If a CLI was killed, its directory lock deliberately remains:

```bash
remote-terminal recover-lock --scope execution --confirm --json
```

This only recovers a verifiably dead local holder; it does not recover the remote command. `registry`, `metadata`, and `audit` scopes cover the other local locks. Unknown ownership, PID reuse, another boot or an incomplete owner record requires controlled manual maintenance with all Bridge writers stopped. See [troubleshooting](docs/troubleshooting.md).

## Bind an existing pane and raw input

```bash
remote-terminal bind --session existing --socket /path/to/tmux.sock --pane '%3' --permissions read,exec --confirm --json
```

Only the registered pane is accessible. Linked panes, changed process identities and synchronized input are rejected. `exec` requires a dedicated single-pane session so a control client cannot subscribe to another pane's output. External panes can be unbound but cannot be stopped by Bridge.

Raw input is a separate low-level operation, disabled by default. To enable it, configure `security.allow_raw_send=true`, grant `raw_send` in the session policy and binding, and keep human control:

```bash
remote-terminal send --raw --text 'pwd'
remote-terminal send --raw --text 'pwd' --enter
```

Text alone does not press Enter. Control characters and embedded newlines are rejected. A successful send only means tmux accepted input; it is not an execution result. Raw input revokes shell confirmation, and partial/failed input requires inspection and explicit human handoff.

## Configuration and machine interface

Copy [examples/config.json](examples/config.json) to `$XDG_CONFIG_HOME/agent-terminal-bridge/config.json` or `~/.config/agent-terminal-bridge/config.json`, with mode `0600`. Private state defaults to `$XDG_STATE_HOME/agent-terminal-bridge` or `~/.local/state/agent-terminal-bridge`; use a local filesystem. `--config` chooses an explicit configuration file. Files are standard JSON with checked types, ranges and unknown keys.

Non-interactive `--json` commands print exactly one JSON object on stdout. Diagnostics use stderr. All results include `schema_version: 1` and `ok`; failed exec results distinguish confirmed nonzero completion from an unknown exit code (`null`).

| Exit | Meaning |
|---|---|
| 0 | Successful operation / confirmed remote exit 0 |
| 1 | Confirmed nonzero remote exit |
| 2 | Arguments, configuration or input error |
| 3 | Missing dependency / unsupported capability |
| 4 | Missing or changed binding/request |
| 5 | Permission, confirmation or control ownership required |
| 6 | Resource busy |
| 7 | Deadline exceeded |
| 8 | Local I/O, protocol or state error |
| 9 | Unknown outcome / recovery required |

`--timeout` applies to `exec` and `confirm-shell`; ordinary local tmux queries have bounded internal deadlines. An unknown result must never be automatically retried.

See [Agent integration](docs/agent-integration.md), [execution protocol](docs/execution-protocol.md), [SECURITY.md](SECURITY.md), and [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
