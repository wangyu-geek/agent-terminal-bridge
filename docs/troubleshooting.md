# Troubleshooting

Start with `capabilities --json`, `doctor --json`, then `status --session NAME --json`. Inspect reported evidence rather than assuming a pane means a connected server.

| Symptom | Next action |
|---|---|
| DEPENDENCY_MISSING | Install local Bun/tmux at the supported versions; Bash/base64 checks occur in the target shell |
| INVALID_BINDING | Explicitly start a session or bind the exact socket and pane with the user's intended permissions |
| BINDING_CHANGED / exited pane | Stop automatic writes. Acknowledge any unknown request, unbind the stale object and explicitly create/bind a new one |
| SHELL_CONFIRMATION_REQUIRED | Reach a compatible empty Bash prompt, generate/review initialization, install it manually, then confirm hostname and hand off |
| ENDPOINT_MISMATCH | Recheck the selected server; initialize again only after the human verifies the destination |
| PERMISSION_DENIED | Check both effective permissions and human/Agent control. Raw input additionally needs the global switch |
| BUSY | Another local writer or a directory lock exists. Do not delete it or resend the command |
| TIMEOUT / CONNECTION_LOST | Query the request. The remote command may continue; take over manually and inspect it |
| Unsupported multi-pane execution | Use a dedicated single-pane session. Do not read other panes as a workaround |
| OUTPUT_LIMIT from capture | Ask for fewer snapshot lines; the local read limit prevents unbounded allocation |
| Invalid configuration/state | Fix private file permissions or inspect a damaged record while all writers are stopped. Do not discard unresolved claims |

## Unknown execution

If an owner is still alive, use explicit `interrupt --request-id ID --confirm` or `handoff --to human --takeover --request-id ID --confirm`. Interruption is only a request and may not produce a completion frame. Human takeover preserves uncertainty and enables writable attach only after coordination.

After the coordinator exits, interruption requests cannot be delivered through that owner. Use explicit manual takeover, inspect the foreground in a writable attach, and handle it yourself. Then `recover --request-id ID --confirm`, initialize the chosen shell again, verify its hostname and hand off anew. `recover` is a human acknowledgment, not an automatic detector that the process stopped.

## Abandoned locks

A killed owner leaves its lock directory deliberately. `recover-lock --scope execution --confirm` can clear a verifiably dead holder on the same boot. Scope `registry` is useful when creation died before registering an alias; `metadata` and `audit` address those specific locks.

A missing owner record, symlink, reused/live PID, another boot, or an abandoned maintenance lock is not automatically reclaimable. Stop **all Bridge writers using that state directory**, preserve the request/binding files and review the exact lock owner. Only an operator who has established quiescence may quarantine that specific stale lock directory. Do not run broad deletion commands against the state root, use age/mtime as proof, or delete active request records to unlock execution.

Clearing a lock never establishes a remote exit status. Existing prepared/sent/running claims still require explicit human recovery.

## Local terminal details

Bun 1.4.2 on macOS cannot directly canonicalize a Unix socket with its fs realpath implementation; Bridge validates the socket and canonicalizes its parent instead. Managed sockets use a short private `/tmp` path to fit the platform's Unix-socket limit.

An external pane still carrying an old Bridge marker is not automatically reassigned. Inspect the old binding and unresolved records before explicitly removing an obsolete marker in tmux. Recreating or respawning a pane invalidates prior process identity even if its `%N` ID remains the same.

Use normal bracketed paste for human shell initialization. Rapidly injecting a multi-line definition as raw unbracketed keystrokes can overrun a PTY; the product does not perform such automatic initialization. The test fixture sources the exact generated code from a private local fixture file instead.
