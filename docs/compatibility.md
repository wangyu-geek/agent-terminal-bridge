# Compatibility and validation

The project targets local macOS/Linux hosts and a Bash >=4 target execution profile. The target shell can be reached through manually authenticated SSH or an interactive bastion; no Bun, Node.js, Python or remote service is required there.

| Surface | Evidence / current status |
|---|---|
| Bun | Development and local checks use 1.4.2, as pinned in packageManager |
| macOS arm64 | Locally exercised with tmux 3.8 and Homebrew Bash 5.3; includes real panes, control mode, human PTYs and crash recovery |
| tmux minimum 3.2 | Planned compatibility floor; the Ubuntu 22.04 CI job exercises its packaged version. Not claimed as locally run on this Mac |
| Copy-mode screen snapshots | Require tmux's capture-pane -M flag, absent in 3.2a; doctor reports capture_mode_screen and unsupported backends return exit 3 without a buffer fallback |
| Linux | CI is configured for Ubuntu 22.04; no successful remote CI run is claimed by this file |
| macOS x64 / Linux arm64 binaries | Build targets exist; release support requires a native runner test for each target |
| Windows | Not supported by this tmux backend |
| WSL2 | Possible only with accessible same-environment Unix resources; not yet validated |
| Real organizational bastion | Manual acceptance is still required for authentication, menu behavior, audit compatibility and control-byte preservation |

Automated checks cover strict config/permissions, Unicode and control input, literal tmux input, binding/respawn invalidation, mixed PTY output, output truncation, frame fragmentation, shell state isolation, duplicate request IDs, live interruption, manual takeover and owner death at execution transaction boundaries. Tests never use company credentials or real servers.

Bun bundle and native binary validation must run from a temporary working directory, verify embedded initialization assets, and execute a local initialized shell without relying on the checkout. A compiled binary still depends on tmux, and cross-compilation by itself does not establish libc/CPU/OS compatibility.

For a real bastion acceptance run, the operator must explicitly authorize the specific connection, authenticate manually, select the target, confirm its hostname, and use only an approved non-interactive diagnostic command. Verify return-to-menu, disconnect, MFA, terminal control bytes and audit policies. If Base64 transport or initialization is prohibited, do not enable this execution profile; use a platform-approved execution path.
