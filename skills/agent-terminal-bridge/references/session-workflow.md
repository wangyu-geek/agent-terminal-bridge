# session_id Session Workflow

This workflow applies to the current CLI. First check the capabilities and commands required for the requested operation. If a capability is missing, stop and ask the user to update the CLI; do not fall back to another workflow.

## Capabilities and IDs

Start by checking `capabilities --json`:

| Capability | Permitted interface |
|---|---|
| features.connect | The user runs `connect` in a real terminal |
| features.session_id_selection | `list`/`status` return session_id; select a binding with `--session-id` |
| features.ready | Prepare automatically after an explicit handoff |
| features.takeover | Orchestrate human takeover |
| features.resume | Orchestrate recovery after human handling |
| features.terminal_view | Default `connect` command-text view, native terminal scrolling/copying, and local Ctrl+] menu |
| features.local_menu_help | Press `?` in Agent/recovery mode to open the `connect` menu; in human mode `?` is passed through |
| features.local_reconnect | Explicit reconnect in the same window after connection end, with a new ID and reused display name |
| features.command_display | Separate command-display frames from the current helper; do not change execution results |
| features.connection_reuse | Return a live connection by SSH entry/explicit name; use `--new` to create another |
| features.session_history | Read-only status/request queries for old IDs; use `list --history` |
| features.local_access_diagnostics | `doctor` checks directories/socket/process; permission denial is not reported as disconnection |
| features.exec | Execute authorized non-interactive commands |

The tool generates the session_id when `connect` creates a local binding, persists it, and displays it in the local view banner (advanced native attach retains its tmux status bar). It matches the ID returned by `list`/`status`. For a single session, the Agent can read it; the user does not need to copy it. Recreating/rebinding a session creates a new ID. Human handoff does not change the ID, but revokes the previous execution confirmation.

Treat the fields in the table and the options below as subject to the actual CLI. Replace `SESSION_ID` and `EXEC_ID` in examples with the full session ID from the local record and a stable request ID generated for that command.

## First connection

If there is no shared session yet, ask the user to run this in their real terminal:

```bash
remote-terminal connect bastion
```

Replace `bastion` with the user's existing SSH config alias. Running the command again returns its only live connection; the user chooses only when multiple connections exist for that SSH entry. Use `--new` explicitly to create another connection; do not ask the user to rename it. Closing the window only detaches the view; reopening the same name and SSH entry keeps the ID. Never create an invisible login prompt through a tool call without a TTY. Let the user complete authentication, menus, and target selection, then tell the Agent it can take over. A visible session ID does not mean the user is logged in.

## Prepare after explicit handoff

Get the session_id from `list` when there is one session; ask the user to choose when there are multiple candidates. Operate on this full ID; do not ask the user for a hostname:

```bash
remote-terminal status --session-id SESSION_ID --json
remote-terminal ready --session-id SESSION_ID --confirm --json
```

Check the status for a valid binding, exec permission, and unresolved requests. If the session is archived, query requests only for the original ID. If it is unverified/access_denied, run `doctor` and use the host's permission mechanism to authorize the local resources required by this Bridge invocation; do not treat it as a disconnection. If there are existing unknown/preparation-failed requests, follow the human-handling workflow instead of continuing to `ready`. The single `ready` transaction freezes human input, installs a temporary entry point, verifies a fresh handshake, and commits control. The Agent must not split these steps.

Submit work only after `ready` explicitly succeeds with `ready=true` and the current status allows execution. Target details are reported by the shell itself; session_id confirms the shared-session object, not the identity of the remote machine. If the user explicitly requests a host check, add `--expected-host HOSTNAME` to `ready`/`resume`. This option is not required in the normal workflow.

## Execute and query

The following example is appropriate when the user has asked to check disk usage. Choose a command within the user's authorization for other tasks:

```bash
remote-terminal exec --session-id SESSION_ID --request-id EXEC_ID --timeout 30 --json 'df -h'
remote-terminal request --session-id SESSION_ID --request-id EXEC_ID --json
```

Always query a command using its original EXEC_ID. Generate a new ID for a new command; recovery or a network error is not a reason to resubmit an unknown command.

## Hand back to the user and recover

When the user explicitly asks to take over:

```bash
remote-terminal takeover --session-id SESSION_ID --confirm --json
```

In Agent mode, press `?` to open the local menu, then `t` to take over, `q` to detach, or `c` to keep viewing; none require Enter, and `c` does not return input control. Ctrl+] opens the menu in both human and Agent modes and supports extended keyboard encodings. No second terminal is needed. Reopen the view after replacing the executable. If a shortcut fails, the Agent can directly invoke `takeover` for the already selected session. During execution, wait for coordination to finish. If it fails or remains `requested`, tell the user takeover has not completed; do not say they can type yet. After takeover succeeds, the user inspects the original terminal and decides whether to interrupt or handle the current program.

Only after the user confirms the task has been handled, the current target is selected, and the shell is idle:

```bash
remote-terminal resume --session-id SESSION_ID --confirm --json
```

`resume` restores execution eligibility; it does not retry an old command. If the session has expired, preserve the old request record and explain that a new connection is needed. Never resolve the old session_id to a new connection automatically. Stop if lock ownership is unclear, a holder is still active, or state is corrupt; use structured local diagnostics to explain any required human action.

When the connection has ended/the binding is invalid, `takeover` returns `taken_over=false` and `connection_ended=true`; do not tell the user they can type. After the user acknowledges that the old command remains unknown and explicitly confirms recording that fact, `resume` may return `recovery_recorded=true` and `ready=false`; both use exit code 4. The user can press `r` in the original `connect` view to explicitly create a new connection for the same SSH entry and authenticate manually: Bridge reuses the name, preserves the old ID as read-only history, and issues a new session_id. The old request remains unknown; the old ID is not redirected, and the user need not first mark the old unknown as handled. Do not retry recovery or a command just because the CLI returned a nonzero exit code; first explain the structured result.
