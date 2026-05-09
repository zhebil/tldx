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

---

## 12. ID rules: explicit on addressable, namespaced via import, reorder-stable

**Decision**: four invariants, normative for parser + IR.

1. **Explicit `id` is required on addressable elements** - anything that can be referenced by `<edge from="..." to="...">` or (later) `<use name="...">`. IR emits `ir/missing-id` if absent.
2. **Imported IDs are namespaced** - `<import name="auth" from="./auth.tldsl" />` prefixes every child id with `auth.`. No collisions across imports.
3. **Anonymous IDs are allowed only on non-addressable visual elements** - e.g. a `<note>` that nothing references. IR generates a synthetic id.
4. **Sibling reorder must not change IDs.** This is the conformance test for the synthetic-id scheme.

**Synthetic-id scheme** (for rule 3): `<content-hash>-<n>` where `n` is the 0-based index *among elements with the same content-hash*, computed in document order. So reordering siblings of differing content does not change any id; the only case where ids shift is reordering two identical anonymous elements relative to each other (semantically a no-op anyway). Algorithm details land with `tldsl-evr` (IR lowering); these are the invariants any implementation must satisfy.

**Why**: stable IDs matter for phase-2 round-trip and we'd rather not paint ourselves into a corner now. Explicit ids on referenced elements keep the source diff-friendly; namespacing keeps multi-doc composition collision-free; reorder-stability is what makes diffs meaningful instead of churn. Renaming an `id` is intentionally a breaking change for that element - phase-2 round-trip will reflect this.

**Rejected**:
- *Synthetic ids by sibling-position alone* - any sibling reorder of differing-content elements would shift every id. Defeats rule 4.
- *Random / regenerated-per-parse ids on anonymous elements* - kills round-trip; trivially fails reorder stability.
- *Allowing anonymous addressable elements (auto-id everything)* - the moment two anonymous boxes get auto-ids, an `<edge from="..." to="...">` referencing them is a hidden coupling on parse order. Better to require the author to name the things they reference.

---

## 13. Partial-render-on-error: last-good scene + error banner

**Decision**: when `tldsl check` fails mid-watch, the dev server pushes only `{kind: "error", payload: { diagnostics }}`; it does not push a `scene` message. The viewer keeps the last valid scene rendered and overlays a red error banner sourced from the diagnostics. On the next successful compile, push the new `scene` and clear the banner.

**Why**: the use case is "agent edits while user watches" - blanking the canvas on every transient parse error is hostile. Last-good gives the user spatial continuity to keep reasoning while the agent fixes its mistake. The cost is one cached `SceneJSON` in the viewer; transport contract needs no change (the existing envelope already separates `scene` and `error` kinds, so this is a viewer-side policy). On viewer reconnect with no successful compile yet, the banner shows alone over an empty canvas - the only blank-canvas case.

**Rejected**: *blank canvas + error panel*. Clearer signal that something is broken, but it discards the visual state the user is actively reasoning about, and turns every fat-finger save into a context flush. The error banner already provides the "something is broken" signal.
