# tldsl

A minimalist text DSL for authoring [tldraw](https://tldraw.dev) scenes, designed so AI agents (Claude Code et al.) can drive a live canvas by editing plain files.

The agent edits a `.tldsl` file with normal `Edit` / `Write` tools. A local watcher transpiles the file to tldraw scene JSON and pushes it to a browser viewer. No MCP, no special API - just files, a watcher, and a CLI.

## Status

**Pre-implementation.** Design is settled (see `docs/`). Next step is the tldraw scene-JSON spike (see `docs/open-questions.md`).

## Phase 1 in one paragraph

Write-only. Agent edits the DSL, user watches the canvas. Two CLI modes: `tldsl serve <file>` runs the watcher + viewer for interactive use; `tldsl check <file>` is the one-shot validator wired into a Claude Code `PostToolUse` hook so syntax / layout errors land back in the agent's context inline with the failing edit. No round-trip from canvas back to DSL in phase 1.

## Why this shape

- Maps to how Claude Code already operates - the agent edits files, something else watches them. No new tool surface.
- The DSL is a real artifact: git-commit, diff, copy across sessions, paste into chat.
- The renderer is decoupled - restartable, replaceable, openable in any tab.
- Avoids the failure mode that killed the earlier tldraw MCP attempt (timeouts, brittle).

Sits in the "AI tools should be plug-and-play, not frameworks to learn" lane.

## Documents

- [`docs/architecture.md`](docs/architecture.md) - components and data flow
- [`docs/dsl.md`](docs/dsl.md) - syntax, elements, full example
- [`docs/layout-and-edges.md`](docs/layout-and-edges.md) - group/frame split, layout modes, 13 anchors, edge styling
- [`docs/roadmap.md`](docs/roadmap.md) - phase 1 scope, phase 2, rejected, open questions
- [`docs/decisions.md`](docs/decisions.md) - key design decisions and rationale (ADR-ish)

## Naming

`tldsl` is the working name and the CLI binary. Folder named to match. The project name is not finalised - alternatives considered: `scenefile`, `canvas-dsl`. Revisit before any public release.
