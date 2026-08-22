# tldsl

A JSX authoring surface for [tldraw](https://tldraw.dev) scenes, designed so AI agents (Claude Code et al.) can drive a live canvas by editing plain files.

The agent edits a `.tldsl.jsx` file with normal `Edit` / `Write` tools, importing `Doc`, `Frame`, `Box`, `Text`, `Edge`, and `flow` from the `"tldsl"` module. The CLI executes the file in a Node worker, lowers the resulting AST through layout, and pushes tldraw scene JSON to a browser viewer. No MCP, no special API - just files, a watcher, and a CLI.

**Accepted cost**: unlike a plain-text DSL, a `.tldsl.jsx` file needs the CLI to run - it isn't self-contained portable text. See `docs/jsx-pivot.md` for the trade-off this bought (JSX composition, props, `.map()`) and the full reasoning.

## Status

`tldsl check <file>` and `tldsl serve <file>` both work end to end: execute → lower → layout → emit → scene JSON, pushed live to the viewer over SSE. Design for the remaining phase-1/phase-2 surface is settled (see `docs/`); this is not a finished product - see `docs/roadmap.md` for what's still ahead.

## Phase 1 in one paragraph

Write-only. Agent edits the DSL, user watches the canvas. Two CLI modes: `tldsl serve <file>` runs the watcher + viewer for interactive use; `tldsl check <file>` is the one-shot validator wired into a Claude Code `PostToolUse` hook so syntax / layout errors land back in the agent's context inline with the failing edit. No round-trip from canvas back to DSL in phase 1.

## Why this shape

- Maps to how Claude Code already operates - the agent edits files, something else watches them. No new tool surface.
- The DSL is a real artifact: git-commit, diff, copy across sessions, paste into chat.
- The renderer is decoupled - restartable, replaceable, openable in any tab.
- Avoids the failure mode that killed the earlier tldraw MCP attempt (timeouts, brittle).

Sits in the "AI tools should be plug-and-play, not frameworks to learn" lane.

## Run it

```bash
npm install
npm run build                                          # dist/cli/ + dist/viewer/
node dist/cli/main.js serve tests/e2e/fixtures/auth.tldsl.jsx
# or, after `npm link`:
tldsl serve tests/e2e/fixtures/auth.tldsl.jsx
```

For an inner dev loop without rebuilding:

```bash
npm run dev:cli -- serve tests/e2e/fixtures/auth.tldsl.jsx
```

`tldsl check <file>` is the one-shot validator (exit 0 = clean, 1 = compile errors); `tldsl serve <file>` watches the file (and every file it imports), recompiles on save, and pushes scene JSON to the bundled viewer over SSE.

## What a diagram looks like

```jsx
import { Doc, Frame, Box, Edge, Text } from "tldsl";

export default function Diagram() {
  return (
    <Doc>
      <Frame id="auth-flow" name="Auth flow">
        <Box id="user" label="User" />
        <Box id="login" label="Login form" />
        <Box id="auth" label="Auth service" />

        <Edge id="e-user-login" from="user" to="login" />
        <Edge id="e-login-auth" from="login" to="auth" />

        <Text id="n-design">Token store is the only writer of session tokens.</Text>
      </Frame>
    </Doc>
  );
}
```

Based on `tests/e2e/fixtures/auth.tldsl.jsx`. Edges reference other elements by `id`; `<Doc>` is always the root.

## Documents

- [`docs/architecture.md`](docs/architecture.md) - components and data flow
- [`docs/dsl.md`](docs/dsl.md) - syntax, elements, full example
- [`docs/jsx-pivot.md`](docs/jsx-pivot.md) - the JSX pivot: why the text DSL was replaced with JSX, decision-by-decision
- [`docs/roadmap.md`](docs/roadmap.md) - what shipped, what's in flight, what was rejected and why
- [`docs/decisions.md`](docs/decisions.md) - key design decisions and rationale (ADR-ish)

## Naming

`tldsl` is the working name and the CLI binary. Folder named to match. The project name is not finalised - alternatives considered: `scenefile`, `canvas-dsl`. Revisit before any public release.
