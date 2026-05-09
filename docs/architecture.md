# Architecture

## Components

```
.tldsl files  →  watcher + compiler  →  tldraw scene JSON  →  browser viewer
                       ↑
                  tldsl check  (one-shot, hook-friendly)
```

- **DSL files** - plain text on disk. A root file may `<import>` sub-doc files. The agent edits these with normal Edit / Write.
- **Compiler** - parses `.tldsl`, runs layout (ELK), emits tldraw scene JSON. Same pipeline serves both CLI modes.
- **Watcher (serve mode)** - watches root + imports, recompiles on save, hot-reloads the viewer.
- **Browser viewer** - tldraw running in a local dev server. Receives scene updates over websocket / SSE (transport choice open).
- **Check mode** - one-shot validator: parses, runs layout, prints plain-text diagnostics to stdout, exits non-zero on error. Wired into a Claude Code `PostToolUse` hook so errors land back in the agent's context inline with the failing edit.

## Two CLI modes

- `tldsl serve <file>` - file watcher + browser viewer. For human use.
- `tldsl check <file>` - one-shot validation. For the PostToolUse hook and CI.

Both share the parser + layout + emit pipeline. `serve` adds a watcher and dev server on top.

## Error feedback loop

The agent gets fast, in-session feedback via the `PostToolUse` hook:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "tldsl check \"$CLAUDE_FILE_PATH\" 2>&1 || true"
          }
        ]
      }
    ]
  }
}
```

The `|| true` keeps a hook failure from aborting the session. Output is plain text (not structured JSON) so the model reads it directly.

This was a deliberate design choice over a polling sidecar - sidecar errors arrive a turn late at best and never arrive in-session for the last edit. Synchronous hooks close the loop.

## Phase split

- **Phase 1**: agent writes only. User watches. No round-trip.
- **Phase 2**: parser reads tldraw scene back into DSL form. Open questions: stable IDs across round-trips, free-form drag reconciliation, full re-emit vs surgical patch.

Phase 1 was scoped to drop ~60% of complexity (parser + diff + reconciliation) and ship a useful tool fast. Round-trip is on the roadmap, not abandoned.

## Why no MCP

The original exploration was tldraw's MCP integration. It timed out reliably and felt like the wrong abstraction - too heavy, too brittle for the use case. Pivoted to a local middle layer that maps cleanly onto how the agent already works. See `roadmap.md` "Explicitly rejected".
