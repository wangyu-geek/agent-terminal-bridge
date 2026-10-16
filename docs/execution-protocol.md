# Execution protocol

`capture` reads a rendered tmux text buffer. `exec` instead attaches a short-lived control-mode client to a dedicated, explicitly bound single-pane session and subscribes before sending any input. Raw `send` uses a separate control client with output subscriptions disabled; this also avoids inheriting an observer's read-only command context.

## Shell binding

`shell-init` generates the statically embedded `src/shell.bash` template with a random 128-bit identifier. A human reviews and runs it in the selected Bash >=4. It defines `__atb_<nonce>` without exporting it, writing startup files or installing a remote program. `confirm-shell` sends a fresh probe to that function and checks the user-specified hostname against its response.

The hostname, user and cwd are reported by the shell, not authenticated independently. Losing the function causes an unknown/rejected outcome; the payload is never decoded or executed by a generic local fallback. There is no prompt-regex detector.

## Requests and frames

A run call contains only the bound function name, fixed verb, random request nonce and Base64 payload. Scripts are UTF-8, NUL-free, at most 2048 bytes, with an encoded line at most 4096 bytes. Trailing newlines are preserved. The helper executes a non-interactive Bash child with stdin `/dev/null` and removes implicit startup-script variables. It does not provide a security sandbox or stop detached descendants.

Frames are raw bytes, not visible text searched in a pane snapshot:

```text
RS ATB1|binding_nonce|request_nonce|BEGIN US
shared PTY bytes
RS ATB1|binding_nonce|request_nonce|END|exit_code US
```

RS is 0x1e and US is 0x1f. A PROBE frame carries Base64 hostname/user/cwd and the Bash major version. REJECT is valid only before BEGIN and means the user command was not started. Wrong ordering, duplicate completion, oversized frames and invalid fields cannot establish completion. Frame buffers are limited to 8192 bytes.

Control-mode `%end` acknowledges a tmux command, not the remote command. `%output` octal decoding preserves raw bytes, including invalid UTF-8. Framing runs before display decoding; UTF-8 is decoded incrementally, known ANSI/OSC sequences are removed, other controls are shown as escapes. The retained output is bounded and truncation never stops draining the stream or parsing END.

Output is `shared_pty_between_frames`, not isolated stdout/stderr. Background/system output can be interleaved. A valid END proves the wrapper observed a foreground exit status; it does not prove business success or the end of every descendant. A malicious shell can forge this protocol, which is outside the trust model.

## Durable coordination

The execution lock is a local atomic-directory lock with owner/boot/process identity. It does not expire by age. A separate short metadata lock serializes interrupt/takeover requests; the executing process retains exclusive input ownership while consuming them.

Before any terminal bytes are sent, the owner durably writes a prepared request and an active pointer. It records dispatch, optionally BEGIN, then commits a confirmed result before clearing the active pointer and replying. Crash tests pause and kill the owner at prepared, dispatched, running, before-commit and committed boundaries.

Request IDs map to a fixed command fingerprint. Repeats return metadata; they do not resend or recover discarded output. An owner lost before completion produces an unknown observation and blocks new writes. Once completion is durably committed, a later query may still prove completion despite loss of the CLI response.

Timeout, collection failure, topology changes and uncoordinated writable clients cannot be silently retried. Human recovery acknowledges unresolved history, revokes shell confirmation and clears the active claim; it never changes that historical outcome into success. Reinitialization and a new request ID are required for new work.
