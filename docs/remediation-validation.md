# Remediation Implementation and Acceptance Record

> Updated 2026-10-19. See the [remediation plan](remediation-plan.md). The four adjustments in round two have implementation, local regression, and ordinary SSH evidence from the final binary; overall user acceptance is still incomplete. The automation records below do not replace validation with a real bastion, first-time users, or native terminal gestures. Code/test evidence links apply to a source checkout; release packages do not include source or tests.

Skill scope update (2026-10-19): supports only the current CLI `session_id` workflow; legacy compatibility references and fallback guidance were removed. Stop and prompt for a CLI update when a required capability is missing. Skill structure, documentation/examples, and package-content checks passed. The current tarball contains 20 files and one session-workflow reference. This update changed no runtime code and did not rerun the terminal matrix or real SSH. The execution and file-count details below are snapshots from their respective validation runs.

## Follow-up CI timeout fixture correction (2026-10-19)

The [next GitHub CI run](https://github.com/wangyu-geek/agent-terminal-bridge/actions/runs/39227663404/job/117977801974) reported a timeout waiting for the effect file in the new recovery-entrypoint test. Its 100ms execution deadline included local verification, persistence and control-client setup. Receiving `unknown` did not prove that the command had started. A controlled local reproduction delayed the last verification before input by 200ms: the request returned `TIMEOUT/unknown`, and the effect file never appeared.

The recovery test and the executor's equivalent 150ms timeout test now use a bounded shell gate. The target writes a start marker, waits for explicit release, and only then performs its effect. The tests observe the marker and a two-second CLI timeout, verify that the effect has not happened, release the target, then verify its effect and recovery metadata. Duplicate execution of the old request must return the existing unknown record without replay. Production timeout and recovery behavior are unchanged.

The same 200ms delayed-verification experiment with the gate returned `TIMEOUT/unknown`, had no effect before release, and completed the effect after release. An initial local run also hit a shell-preparation timeout; fresh workflow fixtures now wait for a unique prompt emitted by their owned Bash before calling `ready`, satisfying the manual-ready precondition instead of treating registration as shell readiness.

Local verification on macOS arm64, Bun 1.4.2 and tmux 3.8:

- Final source: `bun run check` passed; system-Bash full suite **31 unit + 69 integration passed**; Homebrew-Bash workflow/executor files **25 passed**. No failures or skips in these completed final checks.
- Before adding the prompt-only setup guard, both Bash selections passed the full **100-test** suite, and the two gated timeout cases repeated ten times each with Homebrew Bash passed **20/20**.
- Native Linux, Bash 4.4, build/binary/smoke and real remote checks were not run for this test-only change. The corrected GitHub CI run remains pending.

## CI fixture correction (2026-10-19)

The [first GitHub CI run](https://github.com/wangyu-geek/agent-terminal-bridge/actions/runs/39224977845) passed static checks but failed integration tests. The macOS Homebrew job reported four `ready` assertions receiving exit 6. A controlled local reproduction delayed input projection after a prompt was already visible: `ready` returned `BUSY` / `not_started` while the view held the resource lock. Completing a human-input round trip and waiting for its lock release made the same scenario return exit 0.

The connect and rendering fixtures now use that round trip before handoff, without retrying `ready` or changing the production lock contract. Their fake SSH shells also use the validated `ATB_TEST_BASH` selection instead of always starting `/bin/bash`.

The Linux system-Bash job reported six connect timeouts and dangling child processes. The shared cleanup helper now keeps the PTY open while the CLI exits, then closes it. Graceful shutdown has a three-second limit; exceeding it fails the test and kills only the owned fixture CLI. This addresses the premature-PTY-close path; Linux verification remains pending.

Local evidence on macOS arm64, Bun 1.4.2 and tmux 3.8:

- Frozen dependency installation and `bun run check` passed.
- `ATB_TEST_BASH=/bin/bash bun run test`: **31 unit + 69 integration passed, 0 failed, 0 skipped**.
- The two affected integration files repeated five times with Homebrew Bash: **60 passed, 0 failed**.
- Not run for this test-only change: native Linux, the Bash 4.4 matrix, builds and artifact smoke checks. The corrected GitHub matrix has not been rerun; no real remote session was used.

## Four round-two adjustments: implementation and verification

| Adjustment | Current behavior and evidence |
|---|---|
| Return a connection by SSH entry | [Connections](../src/connections.ts) reuses only a registered connection for the same entry; one is returned directly, multiple require explicit selection, and `--new` creates another. An unrelated old `remote` does not block; explicit names that conflict with another/unknown entry are still rejected. Dots in valid SSH aliases become hyphens in display names; name collisions do not merge entries. [Connection lifecycle tests](../tests/integration/connections.test.ts) cover concurrent real multi-process connections and dotted-name collisions; [CLI tests](../tests/integration/connect.test.ts) cover the actual selection UI. |
| Close the view and reuse a name | Closing the view preserves SSH and its ID. When a connection ends, history is saved under lock before its name is released. Reconnecting reuses the name with a new ID; the old ID allows status/request queries but rejects terminal and recovery writes. [State](../src/state.ts) and lifecycle tests cover duplicate copies after history persistence, the gap before creation, private-directory/symlink checks, and preservation of unknown results. |
| Sandbox permission diagnostics | [doctor](../src/diagnostics.ts) separately checks state reads/basic writes, socket access, and process identity. [Access tests](../tests/integration/diagnostics.test.ts) verify denial and socket-only permission using the real macOS Codex helper. Status remains `unverified/access_denied`; there is no reconnect or record deletion. The [integration document](sandbox-access.md) provides command/resource authorization guidance and a strict session-scoped interface design; the latter is not implemented. |
| Input position after takeover | Normal mode switches no longer send `1049l` to restore an old cursor. Input row and cell-column position are read from local tmux and displayed below the activity transcript, without sending Enter/Ctrl+U remotely. [Screen rendering tests](../tests/integration/terminal-rendering.test.ts) use the development dependency `@xterm/headless` 6.0.0 to verify Chinese prompts, long output, immediate typing, arrows/backspace, and the actual screen after three handoffs. Runtime dependencies remain zero. |

The final source matrix was rerun on 2026-10-19 with macOS arm64, Bun 1.4.2, and tmux 3.8:

- Bash 3.2.57: **98 passed, 0 failed, 0 skipped**.
- Bash 4.4.18: **99 passed, 0 failed, 0 skipped**; the extra case prepares a real PTY with that interpreter.
- Bash 5.3.20: **98 passed, 0 failed, 0 skipped**.
- Logs: `artifacts/validation-final-{3.2,4.4,5.3}.log`. Frozen dependency installation, TypeScript, Biome, docs, and skill YAML/self-contained-reference checks passed. The matrix uses isolated local resources and is separate from the authorized real-SSH check below.
- Parallel regression found that an old connect test waited only for registration and could race the view's initial snapshot lock; 3 of 20 reproductions correctly returned BUSY. The test now completes an explicit human-input round trip before handoff. All 20 parallel reruns passed, along with all 11 connect cases and the Bash 5.3 full regression. The failure was not hidden through automatic retries or by weakening the product lock contract. Logs: `artifacts/validation-connect-ready-{repro,confirmed}.log`, `artifacts/validation-connect-final.log`.
- Bundle, macOS arm64 standalone binary, and actual installed tarball smoke checks passed. Logs: `artifacts/validation-four-fixes-smoke.log`. The package has 21 files, including the new permissions document and complete skill, but no tests or development dependency directory. The first smoke run found that a missing state directory in a new environment was incorrectly reported as a local error; this was fixed, covered by a read-only diagnostics regression, and followed by a rerun of the matrix and final artifact checks.

The final macOS arm64 standalone binary was also validated through a maintainer-authorized ordinary SSH entry: coexistence with unrelated remotes; same ID after closing and reopening the view; `--new` and multiple-candidate selection; immediate typing and readline editing after takeover; local permission denial in a restricted sandbox not misreported as disconnection; same-name/new-ID reconnect via `r` in the same window; old unknown metadata unchanged and read-only; execution after an explicit handoff on the new connection. Actual target Bash: **4.4.20**. Only side-effect-free checks and short sleeps ran; simulated disconnection ended only the local SSH process created for the test. The test connection is closed; no real address, credentials, or terminal content were saved.

The redacted record is `artifacts/validation-four-fixes-real-ssh.json`, with `passed=true`. Final binary SHA-256: `4b0777839c7494fee36b77e1532a53cdef4a9e3f9f4f91a707b445fb1c64b15f`. Screen assertions used a headless terminal grid; **the real iTerm2 UI was not exercised**. These results do not satisfy the external acceptance gates at the end of this document.

## Real-use feedback: not passed

After a real login and handoff to an Agent, the maintainer reported five issues: protocol-transport echo obscured the command text, scrolling was unavailable, there was no in-place takeover path while the Agent held input, text could not be drag-selected/copied, and SSH could not be reconnected in place after disconnection. No real address, authentication content, or terminal transcript was recorded.

Fix direction: default `connect` uses a local text observer while tmux continues to own the original SSH PTY; human input checks control ownership under the resource lock, and Agent mode shows only command text and framed output; native terminal scroll/select/copy remain available. The local Ctrl+] menu is separate from remote input and offers takeover/detach. After confirming the connection ended, the user presses `r` in the original window to create a new connection and authenticate manually, using a new session_id; the old unknown result is neither replayed nor rewritten. The new local PTY interaction and ordinary real-SSH checks passed; actual iTerm2 scrolling/drag-selection and the original bastion workflow still need revalidation.

## Additional remediation for takeover shortcuts

The maintainer reported that Ctrl+] did nothing in the new text view. The old code matched only `0x1d`; an isolated PTY reproduced the gap where CSI u/Kitty/modifyOtherKeys encodings were not recognized. The user's iTerm2 settings were not inspected, so no specific keyboard setting is claimed as the confirmed cause of this report. During the issue, CLI takeover successfully returned control to the precisely identified business session; no remote command or interrupt was sent to it.

Added [keyboard input parsing](../src/terminal-input.ts): supports the Ctrl+] encodings above and byte fragmentation, encoded menu keys, and key-release events. In Agent/recovery mode, plain `?` opens the same menu; in human mode `?` remains ordinary input. No global terminal configuration is modified. Incomplete escape sequences wait for a bounded time; a standalone Escape is passed through after 100 ms under the original ownership context. Fragments cannot cross binding generations or menu stages.

- Full regression with system Bash 3.2.57: **87 passed, 0 failed, 0 skipped**; log `artifacts/validation-keyboard-regression.log`. The new unit/connect subset had **14 passed**, covering fragmented shortcuts, alternate menu access, takeover, and pass-through of human Escape/question-mark input.
- TypeScript/Biome/docs, skill checks, and bundle/standalone-binary/package smoke checks passed.
- With a maintainer-authorized ordinary SSH connection, the final standalone binary verified fragmented CSI u, encoded menu takeover, modifyOtherKeys, `?` takeover, human question-mark/Escape, and SSH preservation after detaching. Target Bash 4.4.20. The redacted result and binary SHA-256 are in `artifacts/validation-keyboard-real-ssh.json`; the test connection is closed.
- Already open views do not hot-reload; open a new view using the updated executable. Ordinary SSH keyboard-encoding tests do not replace UI acceptance of actual iTerm2 key generation/global mappings, nor bastion and first-time-user acceptance.

## Verification of this round's fixes

- Default `connect` now uses a local control-mode text view showing the command text, live results, and shell exit report. Transport/probe echo is hidden. Display frames use the separate `ATBV1` prefix and do not change `ATB1` execution results or compatibility with old parsers; command bodies are not persisted.
- PTY integration tests cover blocking input during Agent execution, the local Ctrl+] menu, human input after coordinated takeover, window resizing, `r` reconnect after the SSH process exits, and reopening an invalid binding into the local recovery menu. Reconnect uses a new ID; old unknown results are preserved and are not automatically prepared or replayed.
- Agent output does not enable the alternate screen, mouse capture, or clipboard modification; native terminal scrolling/selection/copying remain available. Tests verify control sequences and continuous output, but **do not replace real iTerm2 gesture acceptance**. The old advanced native attach behavior remains; use `connect` by default.
- Full local matrix for this round: Bash 3.2.57 **81 passed**, Bash 4.4.18 **82 passed**, Bash 5.3 **81 passed**; all with 0 failures and 0 skips. Logs: `artifacts/validation-terminal-view-bash-{3.2,4.4,5.3}.log`. First-use testing waits for the test shell's own prompt, so the local “please finish login” banner is not mistaken for a prepared remote shell. Nested PTY CRCRLF is matched as a displayed line.
- After the full matrix, input-queue protection was added during takeover waits: discard decisions use ownership/generation and local menu stage at receive time, preventing stale input from being delivered after takeover. All connect/display targeted checks passed (**13 passed**), log `artifacts/validation-terminal-view-input-queue.log`. A final recovery-prompt/display-semantics subset had **19 passed**, log `artifacts/validation-terminal-view-final-targeted.log`.
- TypeScript, Biome, docs/link checks, and skill validation passed. Bundle, macOS arm64 standalone binary, and installed tarball smoke checks passed.

### Maintainer-authorized real SSH E2E

Started a real connection from the **standalone binary** using the maintainer-provided SSH config entry and isolated local state; authenticated with an existing key. Target Bash **4.4.20**. The remote side ran only side-effect-free checks such as `printf` and `df`, plus short sleeps. Simulated disconnection ended only the local SSH process created for this test. No real address, login content, command output, or credentials were recorded; the test connection is closed.

Passed flow: human input → ready → command text/live output/exit status → input blocking and resize during execution → local-menu takeover and human input → resume with the same ID → timeout/unknown → explicit `r` after SSH ends → new connection/new ID in the same window → manual input → explicit handoff and execution on the new connection. The old unknown result was neither changed nor replayed, and the new connection was not prepared automatically.

The redacted result is `artifacts/validation-real-ssh.json` and includes the standalone binary SHA-256. This was **ordinary SSH**; it does not replace tests of bastion menus, MFA, audit policy, or two first-time users. UI automation did not validate the feel of actual iTerm2 scrolling or drag selection.

## Requirements and evidence

| Requirement | Implementation and automated verification | Status |
|---|---|---|
| One command enters a human terminal; no configuration | [CLI](../src/cli.ts), [session manager](../src/session.ts), [connect tests](../tests/integration/connect.test.ts): real PTY, no config file, local fake SSH, reuse of the original SSH argument array | Passed locally |
| Generate, display, and select session_id exactly | Reuse binding's random ID; local banner/native attach status bar agrees with list/status; [state](../src/state.ts) prevents same-name rebinding after ID resolution; tests cover explicit multi-session selection and conflicts | Passed locally |
| No residual connection when there is no TTY | `connect` rejects before creating a connection; tests confirm no SSH argument file or registered session | Passed locally |
| No hostname, code pasting, or second terminal required | [workflow](../src/workflow.ts) freezes, auto-transfers, handshakes, and commits while holding the resource lock; [workflow tests](../tests/integration/workflow.test.ts) operate on a real shell without sourcing a local helper | Passed locally |
| Automatic transfer does not flood the PTY or infer completion from echo | [bootstrap](../src/bootstrap.bash) receives ordered chunks of at most 384 characters; each chunk has a fresh nonce ACK; real Bash 3.2/4/5 PTY cases | Passed locally |
| Protocol control bytes filtered | [dual-PTY filter fixture](../tests/fixtures/filtered-shell.ts) removes actual RS/US output while preserving visible ACK text; [E2E case](../tests/integration/protocol-filter.test.ts) verifies timeout, no false `ready`, rejection of later commands, and a takeover next step. Only removal counts are recorded; no terminal content is saved | Passed as separate runs on all three Bash versions |
| Concurrency, freeze failure, and new human clients | Two CLIs contend for `ready`; injected failure after freeze restores prior permissions; a new native writable client during preparation stops transfer | Passed locally |
| Preparation interruption and crash | Real child processes receive SIGKILL while freezing, transferring, after the first received chunk, handshaking, and before final commit; subsequent state requires human takeover/recovery | Passed locally |
| Takeover, recovery, and timeout | New `takeover` waits for actual coordination; a coordination timeout does not claim success; `resume` preserves the old unknown and does not resend; original window regains input without reconnecting. When connection is invalid, `taken_over/ready=false`; default connect's `r` explicitly creates a new connection/ID in the same window and preserves the old unknown | Local PTY and ordinary real SSH passed; original-bastion recheck remains |
| Locate stale local locks | `takeover`/`resume` locate execution/metadata/audit/registration locks and recover only confirmed-dead owners; `connect` confirms dead local startup locks centrally; live/unknown owners are rejected | Passed locally |
| Status, next step, and local/target diagnostics | `status` is read-only; it displays state, preparation stage, locks, and bounded history; `doctor` returns `local_environment` and `target_environment` separately and does not probe an unconfirmed target | Passed locally |
| Lost automatic request_id response | Bounded recent index locates completed requests; after losing a response, only metadata is queried and the effect occurs once | Passed locally |
| Legacy CLI/JSON and execution protocol | Legacy interfaces retained, `schema_version=1`, one JSON object, old major-only Bash >=4 handshake remains compatible; existing error/deduplication/lock/unknown-result cases | Passed locally |
| Bash >=3.2 without requiring an upgrade to 4 | Helper/bootstrap checks the complete version; `ATB_TEST_BASH` explicitly selects the full interpreter; actual runs recorded below for Bash 3.2.57, 4.4.18, and 5.3 | All three full matrices passed |
| Skill, package self-containment, and installation instructions | [SKILL.md](../skills/agent-terminal-bridge/SKILL.md), current session-workflow reference, optional UI metadata; current CLI only, stops/prompts for update when required capability is missing, distributed in package files | Current skill structure, references, and package-content checks passed; historical tarball file counts remain snapshots |
| Source, bundle, standalone binary, and tarball | [smoke](../scripts/smoke.ts) uses automatic `ready`; isolated cwd with spaces and `.env`/bunfig pollution cases; recheck of artifacts after final boundary fixes | Build plus bundle/binary/package smoke checks passed |

## Earlier run records (see above for this round)

Local host: macOS arm64, Bun 1.4.2, tmux 3.8. All connection tests use temporary sockets and local fake SSH; they do not access real accounts or servers.

- System Bash 3.2.57: previous full regression **20 unit + 53 integration = 73 passed, 0 failed, 0 skipped**.
- Bash 4.4.18: previous full regression **20 unit + 54 integration = 74 passed, 0 failed, 0 skipped**; the extra case prepares a real PTY with this additional interpreter. `bash-4.4.18.tar.gz` was built in a temporary directory from the [GNU release directory](https://ftp.gnu.org/gnu/bash/); system Bash was neither installed nor replaced. Archive SHA-256: `604d9eec5e4ed5fd2180ee44dd756ddca92e0b6aa4217bbab2b6227380317f23`.
- Homebrew Bash 5.3: previous full regression **20 unit + 53 integration = 73 passed, 0 failed, 0 skipped**.
- The protocol-byte filtering case added this round was run separately on all three Bash versions (**1 passed, 0 failed** each); this is not represented as a rerun of the full suite. Runtime code did not change. Full regression logs: `artifacts/validation-bash-{3.2,4.4,5.3}.log`; filter logs: `artifacts/validation-filter-bash-{3.2,4.4,5.3}.log`.
- Frozen dependency installation, TypeScript/Biome/docs checks, and skill validation passed.
- `bun run build`, `bun run build:bin`, actual tarball installation, and `ATB_TEST_BASH=/bin/bash bun run smoke --package=artifacts/agent-terminal-bridge-0.1.0.tgz` passed. The tarball had 20 files, including the complete skill and references, but no source, tests, dependency directory, or private state. All CI shell steps also passed Bash syntax checks.
- CI is configured for macOS system Bash/Homebrew Bash, Ubuntu system Bash, and a checksum-verified fixed Bash 4.4.18 build. There is no successful remote CI result recorded for this run.

## External acceptance still required

The evidence below cannot be replaced by automated tests or compilation. Keep the plan's original gates; do not mark them as passed or waive them.

1. **Two users not involved in development:** In an environment with dependencies installed and the skill available, complete connection, manual login, and first authorized execution using only a one-screen instruction. Record the operator, whether extra guidance was needed, actual operation time excluding authentication/menu time, whether they had to copy a helper/open another terminal/provide a hostname, and any issues.
2. **A real bastion:** The maintainer explicitly authorizes a specific SSH entry and diagnostic task; a human completes password/MFA/menu steps. Verify normal handoff, command output and exit status, human takeover/recovery, menu return, disconnection, control bytes, and organizational audit policy. Record a redacted conclusion; do not save authentication material or real terminal transcripts.

The optional P2 `sh-v1` is not required for this remediation; the plan requires confirming actual target-environment needs first, so `bash-v1` semantics remain. Release support for other platforms must also follow the separate evidence requirements in `compatibility.md`.
