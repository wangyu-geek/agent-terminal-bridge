# Agent Terminal Bridge

An agent-neutral CLI for sharing a terminal you have logged into with an Agent. Text/JSON only: no screenshots, multimodal model, Agent SDK, remote daemon or remote Bun installation.

**Normal flow: one connection command → manual login → one handoff message.** A shared session has a `session_id`; each command has a separate `request_id`. You do not need to provide a hostname.

## Install

Use the standalone executable for your verified platform. It includes Bun; **local tmux >=3.2 and OpenSSH** are still required. The target shell needs **Bash >=3.2, base64 and tr**. These are target requirements, not a request to upgrade your local Bash.

This checkout does not claim a published binary release. A locally built macOS arm64 executable is produced at `dist/remote-terminal`; see [build instructions](CONTRIBUTING.md) and [validation status](docs/compatibility.md). To install an already built executable:

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 dist/remote-terminal "$HOME/.local/bin/remote-terminal"
```

Add `~/.local/bin` to your PATH using your shell's usual configuration. A package installation instead uses `dist/cli.js` and requires Bun >=1.4.2.

Copy the entire [skill directory](skills/agent-terminal-bridge/SKILL.md), including its references, into the skills directory configured by your Agent host, then enable/reload it and verify it is listed. CLI installation alone does not register the skill. Hosts without skills can use [the AGENTS.md routing example](examples/AGENTS.md). [Integration details](docs/agent-integration.md).

No Bridge config file is required for the default single-session flow.

## Connect, log in and hand over

In your real local terminal, replace `bastion` with an existing SSH configuration alias:

```bash
remote-terminal connect bastion
```

Complete passwords, MFA and server selection yourself. The local Bridge status bar shows the full session_id throughout login; it does not identify or authenticate the remote machine.

When the selected server's shell is idle and ready, tell your Agent:

> 登录好了，可以接管，用共享终端帮我检查磁盘。

The skill reads the single authorized session, calls ready, and executes the requested task. You do not copy initialization code, open a second terminal or type a hostname. With several sessions, provide the session_id from the status bar or choose from the Agent's list.

Watch Agent output in the same terminal. Agent ownership makes your previously writable client read-only.

To return to an existing session later:

```bash
remote-terminal connect
```

Multiple sessions produce a selection prompt. A new connection with an occupied name asks whether to reuse that exact session or choose a new name. Closing an observing client does not close SSH. An existing Agent-controlled session opens read-only.

The SSH connection must originate in the Bridge/tmux pane. An SSH process already running in an ordinary terminal cannot be adopted. tmux preserves the local terminal, not a remote connection across network failure.

## Take back control and continue

Tell your Agent “把这个会话交回我”. The takeover coordinator waits for actual ownership transfer; it does not automatically interrupt a running remote program.

Inspect and handle the terminal yourself. Then say:

> 已处理完，登录和目标选择都已完成，现在可以继续。

The Agent uses resume to record recovery and prepare the shell again. The same session_id remains valid while that binding exists. Recreating or rebinding a session produces a new ID.

After timeout, disconnection or uncertain initialization, a remote task may still run. Inspect it before resuming. Unknown commands are never automatically retried, reconnected or sent Ctrl+C. Old unknown results remain unknown after recovery.

If the connection itself is gone, takeover reports connection_ended with taken_over=false. After you acknowledge the old unknown outcome, resume records recovery but returns ready=false (exit 4). Explicitly create a new connection with a new name; the old session_id never redirects to it.

Without an Agent, use `takeover` and `resume` in a real terminal or with an explicitly reviewed `--confirm`. The no-second-terminal workflow is designed for a human paired with a local-CLI-capable Agent.

## Agent interface

The skill checks actual capabilities before using the new flow. For direct integration, replace SESSION_ID with the full ID from list/status and EXEC_ID with a unique ID generated and retained **before submitting that command**:

```bash
remote-terminal capabilities --json
remote-terminal list --json
remote-terminal status --session-id SESSION_ID --json
remote-terminal ready --session-id SESSION_ID --confirm --json
remote-terminal exec --session-id SESSION_ID --request-id EXEC_ID --timeout 30 --json 'df -h'
remote-terminal request --session-id SESSION_ID --request-id EXEC_ID --json
```

ready requires the user's current handoff, including completed login/target selection and an idle shell. It freezes human clients, transfers an internal helper in acknowledged chunks and commits a verified handshake and Agent control in one resource-lock transaction. Hostname/user/cwd are automatically read and marked as shell-reported; optional `--expected-host` adds an explicit hostname comparison.

session_id is not an authorization token. The host Agent remains responsible for authorization of the actual task. `--confirm` acknowledges a management action.

Each command runs in an isolated non-interactive Bash, with stdin `/dev/null`. Directory and exported environment are inherited; cd/export do not persist across requests. Use `cd /path && command` inside one request. Editors, password prompts, pagers, /dev/tty input and background/detached jobs are outside the reliable execution profile.

`terminal_output` is merged shared PTY output, not isolated stdout/stderr. Output may be truncated while completion is still detected. Limits are 2048 UTF-8 bytes per script, 4096 per input line and 1 MiB output by default. Later queries retain metadata, not old output. Reusing an ID never resubmits the command; a different command with that ID is rejected.

## Status, diagnostics and advanced operations

```bash
remote-terminal status
remote-terminal doctor
remote-terminal doctor --session-id SESSION_ID --json
remote-terminal --help --advanced
```

Human output gives the state and a next step. JSON includes versioned fields, local lock/preparation state and bounded recent request metadata. doctor separates local runtime dependencies from the target's **last confirmed** shell information and never probes a login prompt.

Use [configuration](examples/config.json) only to change defaults or permissions; the private config file must have mode 0600. Defaults live under the standard XDG config/state locations. State and audit do not store command bodies, terminal output or credentials.

Existing start/bind/attach/shell-init/confirm-shell/handoff/recover/recover-lock interfaces remain available for advanced integrations. [Protocol](docs/execution-protocol.md), [troubleshooting](docs/troubleshooting.md), [security boundaries](SECURITY.md), [development](CONTRIBUTING.md), [remediation evidence](docs/remediation-validation.md).

Non-interactive `--json` stdout contains one JSON object. Exit codes: 0 success; 1 confirmed remote nonzero; 2 invalid input/config; 3 missing dependency/capability; 4 missing/changed binding; 5 permission/confirmation/selection; 6 busy; 7 deadline; 8 local I/O/protocol/state; 9 unknown outcome/recovery required.

Implemented in TypeScript + Bun 1.4.2. MIT licensed.
