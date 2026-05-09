# Decisions

ADR-ish log of the key design calls made during the 2026-05-03 brainstorm. Each entry: decision, why, and what was rejected.

---

## 1. File-based DSL with watcher, not MCP

**Decision**: agent edits a plain text DSL file with normal Edit/Write; a local process watches and renders. No MCP, no special API.

**Why**: maps to how Claude Code already operates (edit a file, something else watches). The DSL is a real artifact (git, diff, paste). The renderer is decoupled and replaceable.

**Rejected**: tldraw MCP integration - timed out reliably, brittle, wrong abstraction for the use case.

---

## 2. XML/JSX-flavored syntax, not Markdown

**Decision**: XML-style tags with attributes.

**Why**: structural clarity for unrestricted nesting. LLMs are heavily trained on this style. Markdown couldn't express deep nesting cleanly.

**Trade-off**: verbose for edge-heavy diagrams. Mitigated (maybe) by an `<edges>` block in phase 2.

---

## 3. Mermaid is not the base

**Decision**: tldsl is its own language. Mermaid survives only as a lossy phase-2 import source.

**Why**: Mermaid is a rendering language, not a semantic DSL. No nesting, no ports, no imports, no anchors, no stickies, no hard pins. Adopting Mermaid syntax would drop ~70% of phase 1 features. Grammar is Jison-generated and messy. "AI familiarity" is a non-issue - a 200-token spec gets correct diagrams in three tries.

**Direction**: Mermaid → tldsl (input), not tldsl → Mermaid (output).

---

## 4. `<group>` and `<frame>` are separate primitives

**Decision**: `<group>` is invisible layout; `<frame>` is visual (border, title). Both carry layout attrs; only `<frame>` carries visual attrs.

**Why**: tldraw's frame chrome pollutes diagrams when you only wanted alignment. Without the split, the agent uses `<frame>` for everything and diagrams become visually noisy.

**Hard rule**: parser must reject visual attrs (`pad`, `bg`, `border`) on `<group>`. Otherwise the distinction collapses.

---

## 5. ELK over Dagre for auto-layout

**Decision**: ELK as the auto-layout engine.

**Why**: per-region direction, native port model (matches the 13-anchor scheme), nested layout for group/frame hierarchies, WASM build runs in Node and browser.

**Trade-off**: heavier, less ergonomic API than Dagre. Acceptable.

---

## 6. 13 fixed anchors + free endpoints as escape hatch

**Decision**: 13 named anchors per shape; default attach is center; free endpoints (`x:100,y:200` or `x:50%,y:0`) available when needed.

**Why**: tldraw's free-form attach as default produces messy diagrams. Fixed anchors give clean visuals and tractable routing.

**Crowding**: multiple edges on one anchor get visually offset by the renderer; they stay semantically on the same anchor. No re-anchoring.

---

## 7. Phase 1 is write-only

**Decision**: agent edits DSL → tldraw renders. No round-trip.

**Why**: round-trip is ~60% of total complexity (parser tldraw → DSL, diff, reconciliation, stable IDs, free-form drag handling). Cutting it ships a useful tool fast. Round-trip is on the roadmap, not abandoned.

---

## 8. PostToolUse hook for error feedback, not a sidecar

**Decision**: Claude Code's `PostToolUse` hook calls `tldsl check` after every Write/Edit. Plain-text diagnostics inject into agent context inline.

**Why**: hooks are synchronous - errors land in-session. A polling sidecar is always a turn behind, and the last edit of a session never gets feedback.

**Hook config**: in `.claude/settings.json` with `matcher: "Write|Edit"` and `command: "tldsl check ... 2>&1 || true"`. The `|| true` keeps a hook failure from aborting the session.

---

## 9. Two CLI modes from one pipeline

**Decision**: `tldsl serve <file>` (watcher + viewer, human use) and `tldsl check <file>` (one-shot validator, hook + CI).

**Why**: same compiler; `serve` adds watcher + dev server. `check` is the surface that's friendly to hooks and CI.

---

## 10. Imports for sub-docs

**Decision**: `<import name="..." from="..." />` + `<use name="..." />`.

**Why**: LLM editing degrades on 5000-line files; 200-line subdocs keep edit context tight. Subdocs are independently versionable. Each subdoc has its own layout scope - re-layout doesn't ripple to the main doc. Multi-page falls out for free.

---

## 11. Comments compile to stickies

**Decision**: `<!-- ... -->` in source becomes a sticky note anchored to the next element. `<note>` exists for stickies that need explicit position.

**Why**: makes inline annotation first-class without extra syntax. Aligns with how the agent (and humans) naturally write comments next to the thing they're describing.
