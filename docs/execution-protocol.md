# Execution protocol

`capture` reads a rendered tmux text buffer. `exec` instead attaches a short-lived control-mode client to a dedicated, explicitly bound single-pane session and subscribes before sending any input. Raw `send` uses a separate control client with output subscriptions disabled; this also avoids inheriting an observer's read-only command context.

## Shell binding

After the human completes login/target selection and explicitly hands over an idle Bash >=3.2 shell, `ready` prepares it in one resource-lock transaction. session_id selects an exact Bridge binding, not a hostname or tmux ID. Saved client flags and a durable preparation record precede freezing human clients. A short embedded bootstrap installs a non-exported staging function, receives Base64 helper chunks of at most 384 characters, and acknowledges each ordered chunk with a fresh nonce. The decoded embedded helper is evaluated only inside that staging function, then the staging function/variables are removed. No remote files or startup scripts are written.

The bootstrap line and all chunk lines respect max_input_line_bytes. Every line waits for a remote ACK; tmux acceptance or a fixed sleep is not readiness. The coordinator rechecks binding/client ownership through transfer, probes the installed helper, then atomically commits shell confirmation and Agent control. Bootstrap/chunk/probe/commit failures retain a preparation phase and require inspection if input may have been sent. Transfer is not automatically repeated after unknown results. Source, bundle and native builds embed both bootstrap and helper assets.

Legacy `shell-init` still generates a human-installable helper, and `confirm-shell` still requires an expected hostname. New `ready`/`resume` automatically read hostname/user/cwd and full Bash version; `--expected-host` is optional when the user explicitly wants that extra comparison.

The hostname, user and cwd are reported by the shell, not authenticated independently. Losing the function causes an unknown/rejected outcome; the payload is never decoded or executed by a generic local fallback. There is no prompt-regex detector.

## Requests and frames

A run call contains only the bound function name, fixed verb, random request nonce and Base64 payload. Scripts are UTF-8, NUL-free, at most 2048 bytes, with an encoded line at most 4096 bytes. Trailing newlines are preserved. The helper executes a non-interactive Bash child with stdin `/dev/null` and removes implicit startup-script variables. It does not provide a security sandbox or stop detached descendants.

Frames are raw bytes, not visible text searched in a pane snapshot:

```text
RS ATB1|binding_nonce|request_nonce|BEGIN US
shared PTY bytes
RS ATB1|binding_nonce|request_nonce|END|exit_code US
```

RS is 0x1e and US is 0x1f. Installation uses `ATB1|binding_nonce|request_nonce|ACK`. A PROBE frame carries Base64 hostname/user/cwd, Bash major version, and a numeric major.minor.patch version. Old major-only probes remain compatible for Bash >=4; Bash 3 requires a verified minor >=2. ACK is accepted only by an installation parser, never as execution completion. REJECT is valid only before BEGIN and means the user command was not started. Wrong ordering, duplicate completion, oversized frames and invalid fields cannot establish completion. Frame buffers are limited to 8192 bytes.

Before BEGIN, current helpers emit an optional presentation frame:

```text
RS ATBV1|binding_nonce|request_nonce|COMMAND|base64_script US
```

The separate ATBV1 prefix keeps existing ATB1 execution parsers compatible: before BEGIN they ignore it. It cannot establish execution or completion and does not enter terminal_output. The local connect view decodes the bounded command for display, shows only framed command output while the Agent owns input, and hides helper/echo traffic. Commands/output are not added to state or audit files. A newly opened view does not replay past results.

The default connect view keeps terminal-native scrollback/selection, filters Agent ANSI/OSC output, and owns a separate control client. Human key batches require the resource lock and current human ownership; blocked input is discarded. Ctrl+] local controls remain available with legacy and CSI u/Kitty/modifyOtherKeys encoding; ? opens the same menu only while remote input is blocked. Unknown human key sequences remain byte exact. The parser bounds unfinished sequences and flushes standalone Escape after 100 ms, under the original ownership context; pending fragments cannot cross a control/generation/menu change. Geometry-only changes to the same sole pane are allowed; split/replacement/topology changes still invalidate execution. Native attach clients keep their original read-only mechanism.

Control-mode `%end` acknowledges a tmux command, not the remote command. `%output` octal decoding preserves raw bytes, including invalid UTF-8. Framing runs before display decoding; UTF-8 is decoded incrementally, known ANSI/OSC sequences are removed, other controls are shown as escapes. The retained output is bounded and truncation never stops draining the stream or parsing END.

Output is `shared_pty_between_frames`, not isolated stdout/stderr. Background/system output can be interleaved. A valid END proves the wrapper observed a foreground exit status; it does not prove business success or the end of every descendant. A malicious shell can forge this protocol, which is outside the trust model.

Default view state changes reset mouse/style modes without restoring a saved terminal cursor. When human input resumes, a resource-locked local snapshot of the pane's cursor row/column is projected below the transcript using terminal cell coordinates. No remote Enter or input-clearing keys are sent. Renderer tests check actual cell contents after Unicode prompts, long output, editing and repeated handoffs.

Display names point to current bindings; retired bindings are stored by immutable ID before a name can be reused. Historical status/request read original task metadata; terminal mutations reject ARCHIVED_SESSION. Saved unknown results are neither acknowledged nor replayed by connection replacement. Local socket/process permission failures report LOCAL_ACCESS_DENIED/unverified and do not establish endpoint loss.

## Durable coordination

The execution lock is a local atomic-directory lock with owner/boot/process identity. It does not expire by age. A separate short metadata lock serializes interrupt/takeover requests; the executing process retains exclusive input ownership while consuming them.

Before any terminal bytes are sent, the owner durably writes a prepared request and an active pointer. It records dispatch, optionally BEGIN, then commits a confirmed result before clearing the active pointer and replying. Crash tests pause and kill the owner at prepared, dispatched, running, before-commit and committed boundaries.

Request IDs map to a fixed command fingerprint. Repeats return metadata; they do not resend or recover discarded output. An owner lost before completion produces an unknown observation and blocks new writes. Once completion is durably committed, a later query may still prove completion despite loss of the CLI response.

Timeout, collection failure, topology changes and uncoordinated writable clients cannot be silently retried. Human recovery acknowledges unresolved history, revokes shell confirmation and clears the active claim; it never changes that historical outcome into success. Reinitialization and a new request ID are required for new work.
