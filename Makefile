# Shortcuts for local development. package.json scripts stay the source of truth;
# CONTRIBUTING.md documents the equivalent Bun commands and verification order.
.DEFAULT_GOAL := help
.PHONY: help deps dev check test test-unit test-integration build build-bin smoke

BUN ?= bun
ARGS ?=

help:
	@echo "make deps              bun install --frozen-lockfile   install exact development dependencies"
	@echo "make dev               bun run dev                     run the CLI from source"
	@echo "make check             bun run check                   type, format and documentation checks"
	@echo "make test              bun run test                    run unit and integration tests"
	@echo "make test-unit         bun run test:unit               run unit tests"
	@echo "make test-integration  bun run test:integration        run isolated tmux integration tests"
	@echo "make build             bun run build                   build dist/cli.js (requires Bun)"
	@echo "make build-bin         bun run build:bin               build a standalone executable"
	@echo "make smoke             bun run smoke                   verify existing build artifacts"
	@echo "BUN=/path/to/bun selects the runtime; ARGS forwards options to dev, build-bin and smoke."

deps:
	$(BUN) install --frozen-lockfile

dev:
	$(BUN) run dev $(ARGS)

check:
	$(BUN) run check

test:
	$(BUN) run test

test-unit:
	$(BUN) run test:unit

test-integration:
	$(BUN) run test:integration

build:
	$(BUN) run build

build-bin:
	$(BUN) run build:bin $(ARGS)

smoke:
	$(BUN) run smoke $(ARGS)
