# Compatibility and validation

The project targets local macOS/Linux hosts and a Bash >=3.2 target execution profile with base64/tr. The target shell can be reached through manually authenticated SSH or an interactive bastion; no Bun, Node.js, Python or remote service is required there. These shell requirements apply to the actual selected target, not an unrelated local Bash.

| Surface | Evidence / current status |
|---|---|
| Bun | Supported range and CI baseline are declared in [package.json](../package.json); recorded test environments are listed in [remediation validation](remediation-validation.md) |
| macOS arm64 | Locally exercised with tmux 3.8, system Bash 3.2.57, compiled Bash 4.4.18 and Homebrew Bash 5.3; includes automatic ready, real human PTYs and crash recovery. Current evidence: [remediation validation](remediation-validation.md) |
| tmux minimum 3.2 | Planned compatibility floor; the Ubuntu 22.04 CI job exercises its packaged version. Not claimed as locally run on this Mac |
| Copy-mode screen snapshots | Require tmux's capture-pane -M flag, absent in 3.2a; doctor reports capture_mode_screen and unsupported backends return exit 3 without a buffer fallback |
| Linux | CI is configured for Ubuntu 22.04 with system Bash and a checksum-pinned Bash 4.4.18 build; no successful remote CI run is claimed by this file |
| macOS x64 / Linux arm64 binaries | Build targets exist; release support requires a native runner test for each target |
| Windows | Not supported by this tmux backend |
| WSL2 | Possible only with accessible same-environment Unix resources; not yet validated |
| Default text view | Local PTY and headless terminal-cell tests cover live command display, blocked input, local takeover, input positioning/editing, repeated handoffs, resize and explicit reconnect; native iTerm2 scroll/selection gestures still need operator acceptance |
| Managed pane terminal type | New panes explicitly use screen-256color, including on a previously running private server; local simulated bastion tests cover target selection, one Enter into MFA, and manual code entry. Older panes retain their original TERM. Real bastion re-acceptance remains pending |
| Managed SSH locale | New SSH processes remove LANG, LC_ALL, LC_CTYPE, LC_TERMINAL and LC_TERMINAL_VERSION by default, including on an existing server and explicit reconnect. No new config is required. Local PTY/fake-SSH tests cover this boundary and preserved environment; real Bridge/bastion MFA and recording acceptance remain pending |
| Local sandbox | Filesystem/socket/process diagnostics and denied-vs-disconnected handling are tested; the macOS Codex CLI helper is an optional integration test. This is not a claim of OS-enforced single-session isolation |
| Real direct SSH | Final standalone-binary E2E passed on 2026-10-19 against target Bash 4.4.20, including connection reuse/selection, input rendering/editing, sandbox diagnosis, timeout/unknown and same-name reconnect with read-only old-ID history; see validation record |
| Real organizational bastion | Initial user acceptance found five interaction defects; fixes have local/direct-SSH evidence, while bastion menu/MFA/audit and native UI re-acceptance remain pending |

Automated checks cover strict config/permissions, Unicode and control input, literal tmux input, binding/respawn invalidation, mixed PTY output, output truncation, frame fragmentation, shell state isolation, duplicate request IDs, live interruption, manual takeover and owner death at execution transaction boundaries. Tests never use company credentials or real servers.

Bun bundle and native binary validation must run from a temporary working directory, verify embedded initialization assets, and execute a local initialized shell without relying on the checkout. A compiled binary still depends on tmux, and cross-compilation by itself does not establish libc/CPU/OS compatibility.

For a real bastion acceptance run, the operator must explicitly authorize the specific connection, authenticate manually, select the target, hand over its session_id and use only an approved non-interactive diagnostic command. The hostname is automatically read; an expected-host comparison is optional. Verify return-to-menu, disconnect, MFA, terminal control bytes and audit policies. If Base64 transport or initialization is prohibited, do not enable this execution profile; use a platform-approved execution path.
