# Troubleshooting

Start with `capabilities --json`, `doctor --json`, then `status --session NAME --json`. Inspect reported evidence rather than assuming a pane means a connected server.

| Symptom | Next action |
|---|---|
| DEPENDENCY_MISSING | Install local Bun/tmux at the supported versions; Bash/base64 checks occur in the target shell |
| INVALID_BINDING | Explicitly start a session or bind the exact socket and pane with the user's intended permissions |
| BINDING_CHANGED / exited pane | Stop automatic writes. In current connect, explicitly press r to create a new connection/ID; preserve old unknown requests and inspect their outcomes before repeating any work |
| SHELL_CONFIRMATION_REQUIRED | After current explicit handoff to an idle compatible Bash, use ready; after inspection/recovery use resume. Legacy installs retain their manual initialization flow |
| ENDPOINT_MISMATCH | Recheck the selected server; initialize again only after the human verifies the destination |
| PERMISSION_DENIED | Check both effective permissions and human/Agent control. Raw input additionally needs the global switch |
| BUSY | Another local writer or a directory lock exists. Do not delete it or resend the command |
| TIMEOUT / CONNECTION_LOST | Query the request. The remote command may continue; take over manually and inspect it |
| Unsupported multi-pane execution | Use a dedicated single-pane session. Do not read other panes as a workaround |
| OUTPUT_LIMIT from capture | Ask for fewer snapshot lines; the local read limit prevents unbounded allocation |
| Invalid configuration/state | Fix private file permissions or inspect a damaged record while all writers are stopped. Do not discard unresolved claims |

## Local access and names

connect SSH_ALIAS returns to a unique live connection for that SSH entry. --new opens another with an automatic name. A legacy remote record with no saved SSH entry is not a candidate. Closing a window preserves SSH; opening the same entry/name returns without a collision prompt. A genuinely ended connection is retired to read-only history before its name is reused. status/request accept historical IDs, while terminal mutations reject ARCHIVED_SESSION. list --history includes these records.

LOCAL_ACCESS_DENIED (exit 5) with binding unverified means local access is blocked. Run doctor for the exact ID and review state read/write, socket and process checks. Never reconnect or delete a binding solely on this error. [Sandbox access](sandbox-access.md) explains command-level authorization and the limits of the shared socket.

## Terminal interaction

Use the default connect view for readable command text, streaming output and terminal-native scroll/drag-select/copy. While the Agent controls input, ? opens a local menu (local_menu_help capability); Ctrl+] also opens it in human mode; t requests takeover, c continues viewing, q detaches. Typing is blocked while the Agent controls the remote shell, but local controls remain available. An SSH process that exited produces a Connection ended menu: r explicitly creates a new connection in the same window, with manual authentication and a new session_id. Old unknown results remain unchanged.

An old native tmux attach window uses tmux's original read-only/full-screen behavior. Ctrl+b, release, d detaches it (without stopping SSH). Then run the current executable's `connect` and choose the session to use the new view. Check terminal_view and local_reconnect capabilities first. A healthy existing connection can be reused; an ended connection offers r. Reopening a view does not replay historical command output.

If Ctrl+] appears unresponsive, current views recognize its raw control byte and CSI u/Kitty/modifyOtherKeys encodings, including split sequences. [iTerm2 documents different Control-key encoding in CSI u mode](https://iterm2.com/documentation-csiu.html). Use ? while Agent input is blocked; this does not require terminal-setting changes. Upgrading an executable does not update an already running view. If that view has no usable menu, ask the Agent to call takeover for the exact session; no second SSH login is needed. Do not guess among multiple sessions.

A handoff projects the current terminal input row below the transcript locally. It does not send a remote newline. Ordinary view/menu changes do not restore a saved cursor. If input overlaps earlier records, verify that the newly opened view uses the current binary; an already running view does not hot-update. Long output and editing are covered by a terminal-renderer regression test.

## Unknown execution

If an owner is still alive, use explicit `interrupt --request-id ID --confirm` or `handoff --to human --takeover --request-id ID --confirm`. Interruption is only a request and may not produce a completion frame. Human takeover preserves uncertainty and enables writable attach only after coordination.

After the coordinator exits, interruption requests cannot be delivered through that owner. Use takeover (or the current local Ctrl+] menu), inspect and handle the foreground yourself, then confirm resume to the Agent when the shell is idle. resume preserves old unknown history. Legacy recover/manual initialization remain advanced alternatives; neither is an automatic detector that the process stopped.

## Abandoned locks

A killed owner leaves its lock directory deliberately. `recover-lock --scope execution --confirm` can clear a verifiably dead holder on the same boot. Scope `registry` is useful when creation died before registering an alias; `metadata` and `audit` address those specific locks.

A missing owner record, symlink, reused/live PID, another boot, or an abandoned maintenance lock is not automatically reclaimable. Stop **all Bridge writers using that state directory**, preserve the request/binding files and review the exact lock owner. Only an operator who has established quiescence may quarantine that specific stale lock directory. Do not run broad deletion commands against the state root, use age/mtime as proof, or delete active request records to unlock execution.

Clearing a lock never establishes a remote exit status. Existing prepared/sent/running claims still require explicit human recovery.

## Local terminal details

Bun 1.4.2 on macOS cannot directly canonicalize a Unix socket with its fs realpath implementation; Bridge validates the socket and canonicalizes its parent instead. Managed sockets use a short private `/tmp` path to fit the platform's Unix-socket limit.

An external pane still carrying an old Bridge marker is not automatically reassigned. Inspect the old binding and unresolved records before explicitly removing an obsolete marker in tmux. Recreating or respawning a pane invalidates prior process identity even if its `%N` ID remains the same.

Current ready uses acknowledged bounded transfer chunks after explicit handoff. Legacy shell-init remains manual; use normal bracketed paste there. Rapid unbracketed multiline input can overrun a PTY. Automatic preparation tests use real transfer; legacy test fixtures may source a private local helper file.
