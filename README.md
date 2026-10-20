# Agent Terminal Bridge

[English](README.md) | [中文](README.zh.md)

A local CLI that lets an Agent work in a terminal session you’ve already logged into. Text/JSON only: no screenshots, multimodal model, Agent SDK, remote daemon or remote Bun installation.

**Normal flow: one connection command → manual login → one handoff message.** A shared session has a `session_id`; each command has a separate `request_id`. You do not need to provide a hostname.

## Install

Use the standalone executable for your verified platform. It includes Bun; **local tmux >=3.2 and OpenSSH** are still required. The target shell needs **Bash >=3.2, base64 and tr**. These are target requirements, not a request to upgrade your local Bash.

This checkout does not claim a published binary release. A locally built macOS arm64 executable is produced at `dist/remote-terminal`; see [build instructions](CONTRIBUTING.md) and [validation status](docs/compatibility.md). To install an already built executable:

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 dist/remote-terminal "$HOME/.local/bin/remote-terminal"
```

Add `~/.local/bin` to your PATH using your shell's usual configuration. A package installation instead uses `dist/cli.js` and requires Bun.

No Bridge config file is required for the default single-session flow.

### Install the Agent skill

```bash
npx skills add wangyu-geek/agent-terminal-bridge --skill agent-terminal-bridge
```

## Connect, log in and hand over

Bridge uses your local OpenSSH configuration in `~/.ssh/config`. Reuse an existing host alias, or create the file if needed:

```bash
mkdir -p "$HOME/.ssh"
touch "$HOME/.ssh/config"
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/config"
```

Add an entry to `~/.ssh/config`, replacing the example values with your connection details:

```sshconfig
Host bastion
    HostName bastion.example.com
    User your-user
    Port 22
    # Optional for key authentication:
    # IdentityFile ~/.ssh/id_ed25519
```

`Host` defines the local alias passed to Bridge. `HostName` is the SSH entry's hostname or IP address; `User` is your login account and `Port` is its SSH port. For key authentication, uncomment `IdentityFile` and use your private key's path. For an interactive bastion, configure the bastion entry here and select the final server after login; for direct SSH, configure the target server itself.

Optionally inspect the resolved settings without opening an SSH connection:

```bash
ssh -G bastion
```

Then, in your real local terminal, connect using the `Host` alias:

```bash
remote-terminal connect bastion
```

Complete passwords, MFA and server selection yourself. The local Bridge banner shows the full session_id before login; list/status return the same ID. It does not identify or authenticate the remote machine.

Bridge automatically removes `LANG`, `LC_ALL`, `LC_CTYPE`, `LC_TERMINAL` and `LC_TERMINAL_VERSION` when starting managed SSH, so inherited local terminal/locale values do not override the server's default environment. No Bridge configuration is needed. Other environment variables and explicit OpenSSH settings remain in effect. This also applies to `start --ssh` and reconnects created by the updated executable; existing connections keep their original environment. Use `remote-terminal connect bastion --new` to apply it to a fresh login. [Locale troubleshooting](docs/troubleshooting.md#ssh-locale-inheritance).

New managed panes use `TERM=screen-256color` for compatibility with older SSH hosts. Bridge does not install remote terminfo or change global tmux configuration; the host must recognize this terminal type. After updating from a version that showed `tmux-256color: unknown terminal type`, leave the old view and run the updated executable with `connect bastion --new`, then authenticate manually. Existing connections keep their original terminal type. [Terminal compatibility troubleshooting](docs/troubleshooting.md#terminal-interaction).

When the selected server's shell is idle and ready, tell your Agent:

> I'm logged in. You can take over and check disk usage in the shared terminal.

The skill reads the single authorized session, calls ready, and executes the requested task. You do not copy initialization code, open a second terminal or type a hostname. With several sessions, provide the session_id from the banner or choose from the Agent's list.

Watch the actual command text, streaming results and exit status in the same terminal. Scroll with your terminal, drag to select and copy normally. Agent ownership blocks typing to the remote shell; local viewing and controls remain available. The default view uses the terminal's scrollback, not a tmux alternate screen. Initialization and probe traffic stay hidden; output outside command frames is not an execution log.

To return to an existing session later:

```bash
remote-terminal connect
```

`connect SSH_ALIAS` returns to its unique live connection automatically. Several live connections for the same SSH entry produce a selection prompt. Different SSH entries get separate default names; an unrelated legacy `remote` record does not conflict. To open an additional connection, use `remote-terminal connect bastion --new`; the local name is chosen automatically. An explicit `--session NAME` returns to that name only when its recorded SSH entry matches. Closing an observing client does not close SSH. An existing Agent-controlled session opens with remote typing blocked; the local menu is available.

The SSH connection must originate in the Bridge/tmux pane. An SSH process already running in an ordinary terminal cannot be adopted. tmux preserves the local terminal, not a remote connection across network failure.

## Take back control and continue

While the Agent controls input, press **?**, then **t** (no Enter required) to take over in the same window. **Ctrl+]** also opens the local menu in either ownership mode. You can also tell your Agent “Give this session back to me.” The coordinator waits for actual ownership transfer; it does not automatically interrupt a running remote program. **? → q** (Agent mode) or **Ctrl+] → q** detaches the view and leaves SSH running; **c** continues viewing.

The ? shortcut is available in newly opened views from this version; replacing the executable does not update an already running view. In human mode ? remains normal remote input. If a shortcut fails, ask the Agent to return the selected session through CLI takeover.

After takeover, the view appends a fresh local projection of the current terminal input row below the Agent transcript. It sends no newline to the remote program. You can type and edit immediately without moving the input down manually.

Inspect and handle the terminal yourself. Then say:

> I've finished handling it. The login and target selection are complete; you can continue now.

The Agent uses resume to record recovery and prepare the shell again. The same session_id remains valid while that binding exists. Recreating or rebinding a session produces a new ID.

After timeout, disconnection or uncertain initialization, a remote task may still run. Inspect it before resuming. Unknown commands are never automatically retried, reconnected or sent Ctrl+C. Old unknown results remain unknown after recovery.

If the SSH process exits, the local view displays **Connection ended** and offers **r** to reconnect in the same window, or **q** to exit. Pressing r explicitly creates a connection to the same SSH entry with a new session_id, reusing its display name after preserving the old ID in read-only history. Complete passwords/MFA/target selection yourself, then hand over the new session. The old ID and unknown requests remain unchanged; no old command is replayed. An SSH process that is still alive but unresponsive is not declared disconnected: use Ctrl+] to detach/take over and inspect it.

The CLI takeover/resume interfaces still return connection_ended with taken_over/ready=false (exit 4) for the old connection. resume can acknowledge old unknown history but cannot revive that connection.

Without an Agent, use `takeover` and `resume` in a real terminal or with an explicitly reviewed `--confirm`. The local menu also provides takeover without a second terminal. The advanced native tmux attach command retains its original full-screen/read-only behavior; use connect for the normal view.

## Agent interface

The skill supports the current CLI's session_id workflow and checks actual capabilities before acting. Missing required capabilities prompt a CLI update. For direct integration, replace SESSION_ID with the full ID from list/status and EXEC_ID with a unique ID generated and retained **before submitting that command**:

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

Ended connections release their display names when reopened. Old session IDs remain available through `status --session-id OLD_ID`, `request --session-id OLD_ID --request-id EXEC_ID`, and `list --history --json`; they cannot operate a new terminal. Unknown results stay unknown.

Local sandbox access is diagnosed separately: `doctor --session-id SESSION_ID --json` reports state read/write, Unix socket and process inspection checks. `LOCAL_ACCESS_DENIED` / binding `unverified` means the local process lacks access; it does not establish a disconnection. Ask the Agent host to authorize the reported Bridge invocation/resources. [Sandbox access and scoped interface design](docs/sandbox-access.md). The current shared tmux socket is not an OS boundary between session IDs.

Existing start/bind/attach/shell-init/confirm-shell/handoff/recover/recover-lock interfaces remain available for advanced integrations. [Protocol](docs/execution-protocol.md), [troubleshooting](docs/troubleshooting.md), [security boundaries](SECURITY.md), [development](CONTRIBUTING.md), [remediation evidence](docs/remediation-validation.md).

Non-interactive `--json` stdout contains one JSON object. Exit codes: 0 success; 1 confirmed remote nonzero; 2 invalid input/config; 3 missing dependency/capability; 4 missing/changed binding; 5 permission/confirmation/selection; 6 busy; 7 deadline; 8 local I/O/protocol/state; 9 unknown outcome/recovery required.

For source development, run `make` for shortcuts such as `make deps`, `make check`, `make test`, `make build` and `make build-bin`. [Development commands and argument forwarding](CONTRIBUTING.md).

Built with TypeScript and Bun. [MIT licensed](LICENSE).
