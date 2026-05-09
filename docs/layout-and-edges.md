# Layout and edges (deeper notes)

This is the rationale behind decisions summarized in `dsl.md`. Read this when implementing the layout engine or edge router.

## Layout engine: ELK, not Dagre

Picked ELK over Dagre. Reasons:

- **Per-region direction** - different subgraphs can flow in different directions. Dagre is a single flat graph.
- **Port model** supports the 13-anchor system natively. Dagre's port support is limited.
- **Nested layout** for `group` / `frame` hierarchies. Dagre flattens.
- **Browser + Node** - ELK's WASM build runs in both. No native dependency.

Trade-off: ELK is heavier and the API is less ergonomic. Worth it for the structural fit.

## The group / frame split (deeper)

The user's diagrams are visually polluted if every layout container also draws chrome. tldraw's frame primitive renders a titled border, which is fine when you *want* a labelled region but wrong as a default for "I just need to align these three boxes".

So: **invisible layout container** (`<group>`) and **visual container** (`<frame>`) are separate primitives. Both can carry layout attributes; only `<frame>` can carry visual attributes.

Critical rule: **`<group>` must never accept `pad`, `bg`, `border`, etc.** If you let it, users (and the agent) will start treating groups as frameless frames - the distinction collapses, the codebase grows ad-hoc visual flags on the group element, and the diagrams gradually re-acquire the chrome we were trying to avoid.

Enforce in the parser. Reject visual attrs on `<group>` with a clear error.

## 13 anchors

Each shape exposes 13 named connection points:

```
top-left      top         top-right
left         center           right
bottom-left  bottom     bottom-right
```

Plus four edge-midpoints for port-style addressing on long sides.

Tldraw's free-form arrow attach is rejected as a default - it produces inconsistent, messy diagrams when arrows can land anywhere on a box. Fixed anchors give clean visuals and make edge routing tractable.

Free-form attach is still available via free endpoints (`from="x:100,y:200"` or `from="x:50%,y:0"`) for cases where the agent really wants to land an arrow somewhere unusual.

## Default attach + crowding

When the agent writes `<edge from="A" to="B" />` (no anchor), default is **center on both ends**. When multiple edges converge on the same anchor, the renderer offsets them visually by a few pixels - they remain semantically attached to the center.

The engine does **not** reroute crowded edges to neighbouring anchors. The offset is purely visual. Simpler than re-anchoring and matches what tldraw does naturally.

## Cross-container edges

Edges across `<frame>` / `<group>` / imported sub-docs are first-class but treated as the less-common case. Sibling-to-sibling edges within a container are the dominant pattern and should be the most ergonomic.

## Conflict between hard pins and auto-layout

Open. Three candidates when a hard-pinned box would overlap an auto-positioned one inside the same frame:

1. Push the auto-positioned one out of the way
2. Allow overlap (let user / agent see and fix)
3. Error / warn

Lean: warn (via `tldsl check` diagnostics) and allow overlap. Agent gets feedback, doesn't get silent corrections it didn't ask for. Validate this once we have real diagrams.
