# Roadmap

## Phase 1 (in scope)

- **Use case**: shared thinking canvas - agent writes, user watches and talks back through chat.
- **Direction**: one-way (DSL → tldraw). No round-trip.
- **Elements**: `<doc>`, `<frame>`, `<group>`, `<box>`, `<shape kind="...">`, `<note>`, `<text>`, `<line>`, `<edge>`, `<import>` + `<use>`. Comments compile to stickies.
- **Nesting**: unrestricted - any container holds any element type, any depth.
- **Layout**: per-container `layout=free|row|col|grid|auto`; ELK for `auto`; hard pins via `x y`.
- **Anchors**: 13 fixed anchors per shape; default center; render-side offset for crowding.
- **Edges**: common patterns + attribute-driven styling; head decorators independent per end; routes; waypoints; labels.
- **Imports**: multi-file; subdocs have their own layout scope.
- **Architecture**: persistent DSL files + watcher + browser viewer + `tldsl check` for the PostToolUse hook. No MCP.

## Phase 2

- **Round-trip editing** - parser reads tldraw scene back into DSL; user edits in canvas flow back to source.
- **Interfaces / ports** as typed attachment points (sub-doc composition with named ports + `<wire>`).
- **Sequence, state, ER** layout modes - specialized variants of `layout=auto`, not separate grammars.
- **Mermaid as lossy import source** - `<import name="auth" from="./auth.mmd" mermaid />`. Mermaid as input, tldsl as the rich internal model (not the other way around - tried, rejected).
- **Multi-page** beyond what import gives for free.
- **Drawings / freehand** annotations.
- **Domain bundles** - high-level primitives like `<service>` / `<decision>`. Rejected for v1 to keep the DSL general-purpose; viable v2+ direction.

## Explicitly rejected (and why)

- **MCP integration** - tried first, timed out reliably, killed it. The original failure that motivated this whole project shape.
- **Mermaid as the base syntax** - rendering language, not a semantic DSL. No nesting, no ports, no imports, no anchors, no stickies, no hard pins. Adopting it would drop ~70% of phase 1 features. Grammar is messy (Jison-generated, multiple incompatible diagram types). "AI must learn new syntax" turned out to be a non-issue: a 200-token spec in a fresh session produces correct diagrams in three tries.
- **Free-form arrow attach as default** - kept as escape hatch via free endpoints, but the default is anchor-based for cleaner visuals.
- **CSS-flexbox-style enforced row/col on every container** - real thinking-canvas diagrams aren't all rows or columns. `free` is the default.
- **Polling sidecar for error feedback** - synchronous PostToolUse hook closes the loop in-session; sidecars don't.
- **Padding / background on `<group>`** - the moment groups have visual attrs, the group/frame distinction collapses. Hard rule in the parser.

## Open questions for the next session

1. **tldraw scene-JSON spike** - what is the exact JSON structure for shapes, bindings, and camera? Read tldraw source or generated JSON from a manual session before writing the compiler's emit stage. **Probably the next concrete step.**
2. **Partial render handling on errors** - viewer shows (a) last valid render + red error banner, or (b) blank canvas + error panel? Last-good is friendlier interactively but requires caching the previous valid scene.
3. **Layout report schema for `tldsl check`** - what fields about computed positions? Enough for the agent to reason about spatial relationships *without* a screenshot? (This is the text-equivalent of the mcp-excalidraw screenshot loop.)
4. **`<edges>` block shorthand** - allow Mermaid-style `login -> verify` lines inside an `<edges>` block for diagrams with many arrows? Two parsers, slightly inconsistent style. Worth it?
5. **Watcher + viewer mechanics** - chokidar vs `fs.watch`? websocket vs SSE vs polling? Standalone Node + Vite + tldraw lib? Electron? CLI starts it, or a Claude Code skill spins it up?
6. **Conflict between hard pins and auto-layout** - push, overlap, or error? Current lean: warn + allow overlap.
7. **Naming** - `tldsl` is the working name. Alternatives: `scenefile`, `canvas-dsl`. Decide before any public release.
8. **Grid sub-doc empty-cell layout** - when `<group layout="grid" cols="2">` holds 3 sub-docs, what fills the empty cell? Empty space? Auto-resize? Configurable?
