# Implementation evidence — 0.1.0

The TypeScript/Bun CLI and the documented Phase 1/2 execution lifecycle are implemented. This record maps the implementation requirements to current files and local verification; it does not turn future release/organizational acceptance gates into claims of completed tests.

| Requirement | Authoritative implementation / verification |
|---|---|
| Agent-neutral, text/JSON CLI; no model or GUI dependency | [src/cli.ts](src/cli.ts), package runtime dependencies are empty; packaged capabilities report requires_multimodal_model=false |
| Bun 1.4.2, strict TS, reproducible development tools | [package.json](package.json), bun.lock, tsconfig.json, biome.json; frozen install and check passed |
| doctor / capabilities / help / version / JSON errors | CLI and packaging smoke checks; actual tmux command flags are detected and optional copy-mode support is reported separately |
| start, explicit SSH alias, idempotent registration | [src/session.ts](src/session.ts), [session tests](tests/integration/session.test.ts); SSH is a local fake executable in the test, not a real connection |
| bind/unbind/list/status; exact identity and ownership | Session/state/tmux/identity modules; real external binding, permissions, stale/respawn and no-external-stop tests |
| attach/handoff and original client roles | [ownership tests](tests/integration/ownership.test.ts) use real local human PTYs; initially read-only clients remain read-only |
| Bounded snapshots, selected grids, literal input | Session tests cover main/alternate/copy grids, backend capability rejection, line limits, UTF-8 and control rejection; raw writers use no-output control clients |
| Human-installed Bash profile and endpoint confirmation | [src/shell.bash](src/shell.bash), shell initialization, real handshake/hostname mismatch and missing-helper tests |
| Non-interactive exec and exact foreground status | [executor tests](tests/integration/executor.test.ts); merged output, exit 7, cwd/env/function isolation, piped scripts and trailing newlines |
| Framing, echo/noise, limits and byte preservation | [protocol tests](tests/unit/protocol.test.ts), real control-mode tests; byte splits, foreign separators, invalid UTF-8, bounded rendering and END after truncation |
| Process-wide exclusion and explicit abandoned-lock recovery | [src/locking.ts](src/locking.ts), real separate-process contention and killed-holder tests; no TTL takeover; symlink/ownerless rejection |
| Durable dispatch and no automatic duplicate submission | Request/active-pointer files, duplicate-effect tests and [recovery fault tests](tests/integration/recovery.test.ts) |
| Crash boundaries | SIGKILL at prepared, dispatched, running, before_commit and committed; only durably committed completion remains confirmed |
| Timeout / interrupt / human takeover / recover | Real tests verify continued work after timeout, blocked new writes, live control requests, preserved unknown history and reinitialization |
| Lost pane / invalid durable state / audit failure | Execution and session tests return unknown or STATE_ERROR, preserve dispatch claims, and prevent new automatic input |
| Private storage and metadata-only audit | [src/security.ts](src/security.ts), state/tasks modules; permission/symlink tests, no command/output persistence tests, bounded audit rotation |
| Runtime instructions, developer guidance, license | README, AGENTS, examples, CONTRIBUTING, SECURITY and MIT LICENSE are present; docs/link/example checks passed |
| Bundle, native executable, installed package | Both builds passed. [scripts/smoke.ts](scripts/smoke.ts) passed for bundle, standalone binary and installed tarball from a path with spaces, with hostile cwd .env/bunfig files |
| CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) is configured for macOS and Ubuntu 22.04 with pinned Bun, real dependencies, checks, tests, builds and smoke verification; YAML parsed successfully |

## Verified local run

Environment: macOS arm64, Bun 1.4.2, tmux 3.8, Homebrew Bash 5.3.

- `bun install --frozen-lockfile --ignore-scripts`: passed without lock changes.
- `bun run check`: TypeScript, read-only Biome and documentation checks passed.
- `bun run test`: **19 unit + 33 integration = 52 passed**, zero failures and no local integration skips.
- `bun run build` and `bun run build:bin`: passed.
- `bun pm pack --ignore-scripts --destination artifacts`: created the 0.1.0 tarball, 14 files, with no source/test/dependency tree required at runtime.
- `bun run smoke --package=artifacts/agent-terminal-bridge-0.1.0.tgz`: passed for all three artifact forms, including real initialized-shell execution and embedded assets.

Generated artifacts are under dist/ and artifacts/ and excluded from Git. No commit, push, registry publish, real SSH login or production server operation was performed.

## External acceptance and release conditions

Linux CI, macOS x64/Linux arm64 native execution, WSL and real bastion acceptance are not claimed as completed locally. Before declaring those environments supported or publishing their binaries, the maintainer must run the configured/native checks and record their results in [compatibility](docs/compatibility.md).

A real organizational bastion run also needs an explicitly authorized destination, manual authentication and confirmation that its audit policy accepts the initialization and encoded transport. Shared PTY output is not remote RPC, host authentication, sandboxing, guaranteed cancellation, or cross-machine exactly-once execution.
