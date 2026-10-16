# Contributing

Read [AGENTS.md](AGENTS.md) and the relevant sections of [Solution.md](Solution.md). This is a single-package TypeScript/Bun CLI; code must stay independent of specific Agents and terminal emulators.

Use Bun 1.4.2 and install the exact development dependencies with `bun install --frozen-lockfile`. The runtime itself has no third-party package dependencies. Local integration tests require tmux and target Bash >=3.2. Set ATB_TEST_BASH to a specific Bash executable to run the full suite with that interpreter; an invalid override fails instead of silently selecting another Bash.

```bash
bun run check
bun run test:unit
bun run test:integration
bun run build
bun run build:bin
bun run smoke
```

`check` runs read-only Biome checks, TypeScript validation and documentation/link/example syntax checks. `bun run format` explicitly applies formatting changes. TypeScript execution/building is not a substitute for checking types.

Run changed test files during iteration. Test actual behavior and durable/terminal boundaries, using isolated local resources. Do not connect to company hosts, real accounts or production bastions during automated tests. Tests may skip unavailable integration dependencies locally; CI requires them and must not treat skips as platform validation.

Preserve existing work. Do not stage unrelated files, erase untracked content or rewrite history. Commit and push only when requested, with a concise conventional title such as `fix(protocol): retain split UTF-8 bytes`.

Changes to CLI fields, exit codes, shell semantics or recovery states need corresponding contract tests and documentation. Never remove a guard or silently resend an uncertain request to make a test pass. Packaging changes must be exercised outside the source directory against both the bundle and standalone executable.
