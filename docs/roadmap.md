# Roadmap

This tracks direction and what's settled, not day-to-day task order. For
what's actively being worked on right now, `docs/plan.md` is the source of
truth - it's mid "Phase 11: the layout is the product", tracked issue-by-issue
in `bd`. This file doesn't duplicate that ledger; it says what shipped, what's
still ahead, and - the part that stays valuable after everything else goes
stale - what was rejected and why.

## Shipped

- **JSX authoring surface, no text parser.** `.tldsl.jsx` files import `Doc`,
  `Frame`, `Row`, `Col`, `Grid`, `Group`, `Pipeline`, `Layers`, `Swimlanes`,
  `Graph`, `Box`, `Note`, `Sticky`, `Edge`, `flow` from `"tldsl"`
  (`src/runtime/components.ts`). Executed via esbuild + a `worker_threads`
  worker, hard-terminated at 2s - not parsed. See `docs/jsx-pivot.md`.
- **Deterministic layout for the common case.** `row`/`col`/`grid`/`free`
  place bottom-up in pure domain code (`domain/layout/stack.ts`); ELK is
  opt-in for `layout="auto"` only, on a flat per-container graph. `<Group>`
  with zero coordinates is the recommended authoring style - field reports
  in Phase 11 found it matches hand-pinned layout across ten real diagrams.
- **Six-command CLI**: `check`, `serve`, `render`, `verify`, `overlay show`,
  `absorb`. All share one compiler pipeline (`src/cli/main.ts`).
- **The lossless half of round-trip.** Canvas edits land in
  `x.tldsl.overlay.json`; `apply(overlay, compile(jsx))` is pure, total, and
  never re-runs layout (ADR-22, `docs/round-trip.md`). `tldsl absorb` folds
  the overlay ops JSX can express exactly (today: added geo/note shapes)
  back into source, verifying the rewrite before it empties anything.
- **A real Claude Code plugin, not a settings.json snippet.**
  `.claude-plugin/plugin.json` + `hooks/hooks.json` wire a `PostToolUse` hook
  (`hooks/on-edit.sh`: check, then render-if-a-server-is-already-up, both
  fed back as structured `additionalContext`) and a `UserPromptSubmit` hook
  (`hooks/on-prompt.sh`: nudges toward `/tldsl:sync` when an overlay has
  unabsorbed entries). Both are pinned end-to-end by
  `tests/e2e/hooks-fixture.test.ts`.
- **`/tldsl:sync`** (`commands/sync.md`) packages `overlay show` → `absorb`
  → hand-edit-the-residual → `verify` into one guided workflow.
- **Edge routing beyond a straight chord**: same-axis skip edges bow around
  obstacles, edges sharing an endpoint pair fan out, cross-container edges
  route around intervening shapes (`domain/layout/routing.ts`,
  `detourAroundObstacles`). Bounded by what a tldraw arrow can render - one
  scalar (`bend` or `elbowMidPoint`), no polyline. See
  `docs/round-trip-scope.md` section 6.

## In flight

Tracked in `bd` (`bd ready`, `bd list`) and ordered in `docs/plan.md`'s Phase
11. Headline categories, not a task list:

- **Edges, labels, occlusion.** Node placement is considered solved; what's
  left is reciprocal-label overprinting, label clipping (the one failure
  mode `check` doesn't catch today - see `bd show tldsl-4hz`), export-crop
  bounds cutting off arrow labels, and deciding whether ELK's `auto` mode
  keeps the `ORTHOGONAL` routing option it currently pays for and discards.
- **`absorb` handles moves** (`tldsl-d3o`, F4). Reorder/gap intent-recovery
  for drags inside flow containers, restyle/relabel/delete round-trip for
  *existing* shapes (not just added ones), a `--pin` escape hatch for
  `layout="free"`. Scoped in `docs/round-trip-scope.md`; blocked on `R1`
  (`tldsl-oro`) fixing emit's z-index/parenting so the overlay stops
  recording tldraw's own housekeeping as user edits.
- **Named anchors + free endpoints.** Designed (8 compass points + `center`
  + fractions, ADR-6) but not shipped - blocked on `tldsl-4s1`, an unresolved
  separator collision between anchor syntax (`id.anchor`) and the namespacing
  convention (`${ns}.id`) reuse already relies on.
- **`<Text>` and a real `<Note>`.** `<Note>` today fakes a note as a
  `fill: "semi"` geo box; once `<Text>` ships (`tldsl-b8v`), the vocabulary
  splits into `<Sticky>` (real tldraw note), `<Text>` (borderless
  annotation), `<Box>` (bordered). `<Note>` is not removed until then.
  Separately, `<Note>`/`<Sticky>` are the wrong tldraw shape underneath
  (`tldsl-npd`, C2).
- **Skill restructure** (`tldsl-8g9`, G1) into a referenced multi-file guide,
  intentionally last so it documents what shipped rather than what was
  planned.

## Explicitly rejected (and why)

- **MCP integration** - tried first, timed out reliably, killed it. The
  original failure that motivated this whole project shape (ADR-1).
- **A custom XML/lowercase syntax** (`<doc>`, `<box>`, `<shape kind="...">`,
  `<import>`/`<use>`) - shipped for a while, then deleted outright. JSX gives
  an LLM author a syntax it already writes natively plus JS-native reuse
  (components, props, `.map()`) at the cost of the file no longer being
  self-contained text. Full reasoning and the staged deletion plan:
  `docs/jsx-pivot.md`. `<import>`/`<use>` wasn't deferred, it was superseded
  outright by ES `import`; comments-as-stickies wasn't deferred either -
  `{/* */}` is a JS comment esbuild strips before it ever reaches the
  runtime, so it's rejected as incompatible with the execution model, not
  merely unbuilt (`docs/jsx-pivot.md` decision 10).
- **Mermaid as the base syntax** - rendering language, not a semantic DSL.
  No nesting, no imports, no anchors, no stickies, no hard pins. Grammar is
  messy (Jison-generated, multiple incompatible diagram types). "AI must
  learn new syntax" turned out to be a non-issue for the DSL that replaced
  it, too: JSX is syntax an LLM already writes natively.
  Mermaid-as-lossy-import-source is a separate, still-open idea (see below),
  not resurrected by this rejection.
- **Free-form arrow attach as the default** - rejected in favor of anchor
  addressing, which produces cleaner, more tractable-to-route diagrams. Note
  the asymmetry this leaves: anchors themselves haven't shipped either (see
  "In flight"), so today's actual default - center-to-center attach - is a
  degenerate case of the still-unbuilt design, not a live alternative
  someone chose over anchors.
- **CSS/flexbox-style translation** (`className`, hex colors, border-radius)
  - refused outright, not just undocumented. `tldsl` exposes tldraw's raw
    style enums (`color`, `fill`, `dash`, ...) plus thin userland preset
    components; an unrecognized prop is `ir/unknown-prop` with a line
    number, not a silently-ignored no-op. `docs/jsx-pivot.md` decision 9.
- **Domain bundles** (`<Service>`, `<Decision>`) - rejected to keep the
  vocabulary general-purpose. `<Service name="api"/>` is no more native to an
  LLM than a bespoke element name was; the fluency win is JSX mechanics, not
  element names.
- **Polling sidecar for error feedback** - a synchronous `PostToolUse` hook
  closes the loop in-session, including for the last edit before the agent
  stops; a sidecar is always at least a turn behind.
- **Padding / background on a chrome-free container** - the moment a
  `<Group>` or unnamed `<Row>`/`<Col>`/`<Grid>` carries visual attrs, the
  group/frame distinction collapses. Enforced by `drawsChrome`
  (`domain/ir/ir.ts`) being a property of the frame, not a per-attribute
  check.
- **Type checking on the authoring path** (`.tsx`) - the author is an LLM,
  not a human reaching for autocomplete. `.tsx` support is one alternation
  in the extension regex if this is ever revisited; not built.
- **Z-order syntax in the DSL** - checked against real overlay data (three
  corpus files, 138 total entries), not assumed: 133 of 138 were tldraw's
  own arrow re-indexing on load, not a user reordering anything. `diffScenes`
  stops recording `index` entirely rather than filtering the noise
  downstream. `docs/round-trip-scope.md` section 4.
- **Waypoints / arbitrary polylines on `<Edge>`** - `TLArrowShapeProps` is
  two endpoints plus exactly one scalar (`bend` or `elbowMidPoint`, checked
  in `@tldraw/tlschema`); there is no points array to target. A multi-point
  edge needs a custom `ShapeUtil` in both the viewer and the render adapter,
  a widened scene-JSON contract, and its own hit-testing - a phase, not a
  task, for a capability nothing in the corpus has asked for.
  `docs/round-trip-scope.md` section 6.
- **Re-running layout under an overlay** - would make the overlay an input
  to the thing it patches; the fixed point isn't guaranteed to exist.
  `docs/round-trip.md` D1.
- **`absorb` running automatically** (on save, from a hook, from `serve`) -
  always human-invoked. It rewrites source; a rewrite with no review gate is
  not a feature. `docs/round-trip.md` D5.
- **C4 notation** (dashed frame boundaries, `person`/`cylinder` geo) - blocked
  on tldraw itself, not on `tldsl`: `TLFrameShapeProps` has no `dash`, and
  neither shape is in the 20-value geo enum. Would need a custom `ShapeUtil`
  registered in both the viewer and the render adapter. Struck rather than
  worked around; see `docs/diagram-defects.md` D17/D18.

## Open (genuinely, not answered elsewhere)

- **Where anchors and namespacing meet.** `tldsl-4s1`: pick a separator for
  named-anchor syntax that doesn't collide with the `${ns}.id` dot
  convention reuse already relies on, or resolve ids before anchors are
  parsed. Blocks shipping the anchor design at all.
- **Mermaid as a lossy import source** - `<import from="./auth.mmd" mermaid />`
  or equivalent, converting a Mermaid diagram into `tldsl`'s richer model on
  the way in. Different from, and not precluded by, rejecting Mermaid as the
  base syntax. No design work has started; ES `import` gives module reuse
  but nothing about parsing a foreign format.
- **Naming.** `tldsl` is the working name. Alternatives considered:
  `scenefile`, `canvas-dsl`. Decide before any public release.
- **Sandboxing third-party diagrams.** `tldsl serve`/`check` execute
  arbitrary JSX with no sandbox - accepted because the agent that wrote the
  file already has Bash, so executing its JSX grants nothing new. The day
  someone pastes a `.tldsl.jsx` from the internet and `serve` executes it,
  this is a real hole. Revisit if diagram-sharing becomes a use case.
  `docs/jsx-pivot.md` decision 8.
- **Lexical id scoping**, as an alternative to the current prefix-prop
  (`ns`) discipline - deferred because the resolution rule has surprises in
  it (an edge inside a component silently binding to an outer node of the
  same name) and shouldn't be designed before prefix-prop discipline
  actually hurts. `docs/jsx-pivot.md` decision 11.
