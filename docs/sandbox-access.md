# Local Permission Integration and Session-Scoped Interface Design

Bridge's CLI/JSON interface is Agent-neutral. The host command sandbox still determines which files the CLI can read, which state it can write, which Unix sockets it can access, and which process checks it can perform. A session_id is a selector; a skill or AGENTS.md does not grant operating-system permissions.

## Available diagnostics

```bash
remote-terminal doctor --session-id SESSION_ID --json
```

`doctor` sends no input to the remote side. `local_access` reports the checks below and their `required_access`. A write probe uses only a private temporary file created, synced, and removed by the tool itself; it does not modify bindings, tasks, or locks.

| Check | Purpose |
|---|---|
| state_read | Read current bindings and task records |
| state_write | Create, write, and sync a temporary probe under the state root to check basic write access |
| tmux_socket | Read the identity of the selected local pane without shell probing |
| process_identity | Verify the saved creation identity of the local tmux process |
| ready_for_session | The local checks above passed; this does not mean the remote side is logged in or handed off |

State defaults to `XDG_STATE_HOME/agent-terminal-bridge`, or `~/.local/state/agent-terminal-bridge` when unset. Managed sockets are under `/tmp/agent-terminal-bridge-UID`; use the actual path from `doctor` rather than guessing a fixed filename. macOS also requires `/bin/ps` and `/usr/sbin/sysctl`; Linux uses process creation identity information from `/proc`. tmux owns the existing SSH connection; observing or executing does not require the Agent to authenticate again.

Before the first connection, when no state directory exists yet, regular `doctor` reports `missing` and does not create the directory or treat it as a local I/O failure. Specifying a session_id that has not been registered returns `INVALID_BINDING` (exit code 4).

`LOCAL_ACCESS_DENIED` returns exit code 5. `status` returns `binding=unverified`, `display_state=access_denied`, and the `inspect_local_access` action; if a local check cannot complete, it may return `inspection_failed`. Only an object that is genuinely missing or exited enters the connection-ended flow. Permission errors must not cause state deletion, unbinding, task replay, or a new SSH connection.

## Per-command authorization integration

1. Keep the host's existing sandbox and run `doctor` first for the already selected session_id.
2. Ask the host to authorize the state directory, specific socket, and process checks required by this Bridge invocation. The actual command must remain within the task authorized by the user. Hosts that support per-command approval can approve this invocation without switching the entire Agent session to global Full Access.
3. Run `doctor` and read-only `status` again; confirm the failed checks are resolved before calling `ready`/`exec`. If required access is unavailable, stop and preserve the binding and request history.

Host versions, administrative policies, and execution interfaces may limit authorization granularity. Do not promise that every sandbox can grant these capabilities through the same configuration, and Bridge does not automatically change host settings. OpenAI's [permissions and approvals guide](https://learn.chatgpt.com/docs/agent-approvals-security) distinguishes command sandbox, network, and approval boundaries; the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) describes file and Unix socket permission options.

The helper in Codex CLI 0.152.1 on this machine supports the following **diagnostic example**. It grants access only to the specified socket; state writes and `/bin/ps` may still be denied, so do not treat this as a complete authorization configuration:

```bash
codex sandbox -c 'sandbox_mode="workspace-write"' --allow-unix-socket /ABSOLUTE/BRIDGE.sock -- /ABSOLUTE/remote-terminal doctor --session-id SESSION_ID --json
```

Local integration tests use temporary sessions to verify that regular calls work; in a restricted sandbox, records are readable while writes/socket/process checks are denied separately; permitting only the socket restores only that check, and other denials are still reported accurately. CI platforms without the Codex helper explicitly skip this special test; it is not reported as passing. The helper does not represent the actual policy of every desktop session. Production integration must follow diagnostics from the specific host in use.

## Controlled session-scoped interface: design delivered, not implemented

Multiple managed sessions currently share one tmux socket. Granting direct access to that socket can expose other objects on the same server, and CLI session_id checks do not provide operating-system-level isolation for one session. Therefore, current capabilities claim only resource/command-level integration; a strict single-session proxy has not been implemented.

If the product requires this boundary, a future controlled adapter should follow this contract:

- The user explicitly authorizes one complete session_id on a trusted local side. The adapter stores a separate, revocable capability record bound to the ID, resource identity, authorized operations, and current handoff generation. The public session_id is not an authorization secret.
- The Agent calls structured `status`/`exec`/`request`/`takeover`/`resume` through host-controlled tools. A stdio/MCP adapter may be provided, while the core protocol stays generic; do not add a default HTTP listener or remote service.
- The adapter runs in a process with the required local permissions. The Agent command sandbox does not receive direct access to the tmux socket or to a directory where it could modify authorization records. If the host also allows direct socket access, do not claim the adapter provides an exclusive boundary.
- Recheck capability, binding, and actual permissions for every operation. Reject other IDs, global tmux management, arbitrary raw input, or implicit registration. Commands remain subject to host authorization for the specific task; terminal text cannot expand the scope.
- Recreating a binding or reusing a name does not redirect an old capability. Human takeover revokes execution eligibility; a new handoff explicitly verifies the new generation. Historical authorization permits only request metadata queries for the original ID.
- Test rejection of cross-ID requests, capability revocation, generation changes, competing requests, no replay after unknown failures, and the Agent's inability to bypass the adapter from the command sandbox to access the socket. This still does not protect against other malicious processes running as the same OS user or against root.

This design requires an independent implementation and host validation. This release does not claim the proxy is available based on documentation or a capability flag.
