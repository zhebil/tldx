# Architecture

`tldsl` turns a JSX authoring surface into a live tldraw canvas. An agent
writes `.tldsl.jsx` files with normal Edit/Write; the CLI executes them,
lays them out, and pushes tldraw scene JSON to a browser viewer. This doc
covers the pipeline, the CLI surface, the round-trip status, and the hook
loop that gets errors back to the agent in-session. For the enforced
layer/dependency rules, read `CONTEXT.md` - this doc narrates the same
system, it does not restate the rule table.

## Pipeline

```
x.tldsl.jsx
  → esbuild bundle + worker_threads execution   (infra/execute-jsx/)
  → AST                                          (domain/parser/ast.ts)
  → IR (lower)                                   (domain/ir/lower.ts)
  → layout                                       (domain/layout/stack.ts, opt-in ELK)
  → emit                                         (domain/emit/emit.ts)
  → SceneJSON                                    (contracts/scene-json.ts)
  → apply(overlay, scene)                        (domain/overlay/apply.ts)
  → viewer (tldraw, over SSE)                    (src/viewer/, infra/transport/, infra/devserver/)
```

There is no text parser. The file is a real JS/JSX module: `infra/execute-jsx/`
bundles it with esbuild (aliasing the `"tldsl"` import to the bundled
`src/runtime/` component library) and runs the bundle in a fresh
`worker_threads` Worker, hard-terminated at a 2s budget - an infinite loop in
user JSX cannot hang the process. The component functions (`Doc`, `Frame`,
`Box`, `Edge`, ...) are plain functions that build the same `domain/parser/ast.ts`
AST shape a text parser used to produce; that containment (`lower.ts`,
`emit.ts`, `contracts/`, `src/viewer/` all unchanged) is why the JSX pivot was
worth doing. Full reasoning: `docs/jsx-pivot.md`.

`domain/ir/lower.ts` turns the AST into normalized IR - derives ids, expands
shorthand (`flow()`), validates references (`ir/unknown-reference`),
rejects unsupported syntax (`ir/anchor-not-supported`,
`ir/free-endpoint-not-supported` - see "Layout engine and edges" below).
Layout fills in `x`/`y`/`w`/`h`. Emit turns positioned IR into tldraw
records. `apply` folds in whatever the user did on the canvas since the last
compile (see "Round-trip", below) - it never re-runs layout, so it's a pure
patch over the finished scene.

## Layers, briefly

Full rules and rationale live in `CONTEXT.md`. For orientation:

- **`cli/`** - composition root. Wires real adapters, parses argv, calls
  `process.exit`. The only place real adapters meet use cases.
- **`app/`** - use cases (`compileFile`, `watchAndServe`, `absorb`, ...)
  orchestrating the domain pipeline through ports.
- **`domain/`** - the pure compiler core (`parser/`, `ir/`, `layout/`,
  `emit/`, `overlay/`, `absorb/`, `diagnostics/`, `ports/`). No `node:*`, no
  `infra/`, no I/O.
- **`infra/`** - adapters: `fs/` (chokidar + node:fs), `layout-elk/`
  (elkjs), `transport/` (SSE), `devserver/` (HTTP + SSE host),
  `execute-jsx/` (esbuild + worker), `render/` (playwright), `serve-registry/`,
  `log/`.
- **`contracts/`** - wire types (`scene-message.ts`, `scene-json.ts`,
  `overlay.ts`). Imports nothing.
- **`viewer/`** - separate Vite bundle: tldraw + the transport client.
  Imports only `contracts/`.
- **`runtime/`** - the `"tldsl"` module itself (`Doc`, `Frame`, `Box`, `Note`,
  `Edge`, `flow`, plus the `jsx`/`jsxs`/`jsxDEV` functions esbuild's
  automatic JSX transform targets). Bundled into the user's entry by
  `infra/execute-jsx/`; not imported anywhere else.

## Layout engine and edges

**`domain/layout/stack.ts`'s `hybridLayout` is the layout engine, not ELK.**
It sizes every child bottom-up and places `row`/`col`/`grid`/`free`
containers deterministically in pure domain code - no constraint solver, no
port model. `layout="col"` is the default when the prop is absent.

ELK (`elkjs`, wired at `src/infra/layout-elk/elk-layout.ts`) is opt-in,
reached only when a container sets `layout="auto"`. Even then it sees a
*flat* graph of that one container's already-sized, unpinned direct
children plus their edge topology - not the whole document, and not the
nested hierarchy. `elk-layout.ts` also discards ELK's routed edge geometry;
`AutoPlaceResult` (`domain/layout/stack.ts`) carries only node positions, so
`layout="auto"` buys placement, not routing. `<Group>` (an invisible
`drawsChrome() === false` container, see below) is the recommended way to
organize a diagram today - Phase 11's field reports found it matches
hand-pinned layout without a single coordinate across ten real diagrams, so
`<Graph>`/`layout="auto"` is treated as a last resort, not the default.

**There is no 13-anchor scheme, and no free-endpoint escape hatch, in the
shipped product.** `<Edge from to>` resolves ids to shape centers only.
Named-anchor syntax (`from="api.right"`) and free-endpoint syntax
(`from="x:100,y:200"`) both parse as strings but are rejected at lowering -
`domain/ir/lower.ts`'s `validateEndpoint` explicitly throws
`ir/anchor-not-supported` and `ir/free-endpoint-not-supported`. The design
for what should eventually replace default-center (8 compass points +
`center`, plus arbitrary `0..1` fractions) is written down in
`docs/jsx-pivot.md` decision 4 and `docs/decisions.md` ADR-6, but it is
design only - nothing has shipped, and `tldsl-4s1` (open) blocks it on
picking a separator that doesn't collide with the `ns.id` dot convention.
Read `docs/dsl.md`'s "Edges" section for the syntax as it actually behaves
today.

What *is* real, in `domain/layout/routing.ts`: same-axis "skip" edges (an
edge whose straight chord would pass through an intervening shape) get a
computed `bend` that bows the arrow around obstacles, with lane assignment
when several skip edges share a container/axis/side so they fan out instead
of stacking; edges that share an endpoint pair fan out perpendicular to
their chord; a cross-container edge with no shared axis is routed by
`detourAroundObstacles`, which grows a bend until the arc clears every
box/note between its endpoints. None of this is anchor addressing - it's
route computation on top of center-to-center attachment, bounded by what a
tldraw arrow can actually express (`bend` for an arc, `elbowMidPoint` for an
elbow, no points array - see `docs/round-trip-scope.md` section 6). This
machinery, and the label/occlusion work layered on it, is the active surface:
`docs/plan.md`'s Phase 11 is entirely about edges, labels, and the
round-trip, because node placement is the part that's already solved.

**The group/frame split is real and still the right call.** `<Group>`
(`src/runtime/components.ts`) is sugar for `<Frame group>`.
`drawsChrome(frame) = frame.group !== true && frame.name !== undefined`
(`domain/ir/ir.ts`) decides whether a container gets a tldraw frame shape
(border + title) or is purely a layout construct with no visual trace - so
an *unnamed* `<Row>`/`<Col>`/`<Grid>`/`<Graph>` is chrome-free the same way
`<Group>` is, not just `<Group>` itself. A chrome-free container also
changes coordinate spaces: it emits no tldraw shape, so its children are
folded into the parent's origin and parented straight to the page (relevant
for absorb - see D5's arithmetic note in `docs/round-trip-scope.md`).

## CLI surface

Six subcommands, wired in `src/cli/main.ts`:

- `tldsl check <file>` - one-shot validation. Exits non-zero on error. Files
  not ending in `.tldsl.jsx` are accepted silently with exit 0 (so the
  PostToolUse hook, which fires on every `Edit`/`Write`, stays quiet on
  unrelated files).
- `tldsl serve <file> [--no-open]` - watches the file and every file it
  imports (esbuild's `metafile.inputs`, re-subscribed after every compile),
  recompiles on save, pushes scene JSON to the bundled viewer over SSE.
- `tldsl render <file> <out.png> [options]` - exports the compiled diagram
  as a cropped PNG. Reuses a running `tldsl serve` for the file if one is
  recorded in `infra/serve-registry/`, otherwise boots an ephemeral one.
  Read-only: it never wires a write port, so it never writes an overlay
  sidecar.
- `tldsl verify <file>` - pass/fail: does the JSX source alone reproduce
  what the overlay says the canvas looked like?
- `tldsl overlay show <file>` - reports what's pending in a diagram's
  overlay.
- `tldsl absorb <file> [--force]` - folds a diagram's overlay back into its
  JSX source. See "Round-trip", below.

All six share the same compiler pipeline through per-use-case dependency
structs (`app/compile-file.ts`, `app/absorb.ts`, ...); `serve` and `render`
add a watcher/dev-server on top.

## Round-trip

Design is settled in `docs/round-trip.md` (D1-D5, landed as ADR-22) and
`docs/round-trip-scope.md` (the field-tested scoping pass, F5). Status is
**partially built, by design, not by omission**:

- **The lossless half is built.** Canvas edits land in `x.tldsl.overlay.json`
  keyed by tldraw record id (`domain/overlay/diff.ts`); the render is
  `applyOverlay(overlay, compile(jsx))` (`domain/overlay/apply.ts`) - pure,
  total, and it never re-runs layout. The viewer PUTs its snapshot to
  `/overlay` on the same dev server (no second transport; SSE stays
  one-way).
- **`tldsl absorb` is mechanical and narrow, on purpose.** It rewrites JSX
  only for the overlay ops it can express *exactly and verifiably* - today
  that's `added` geo/note shapes, spliced into the root `<Doc>`
  (`domain/absorb/codegen.ts`). Before it touches the overlay it recompiles
  the rewritten source, applies the untouched residual overlay to the fresh
  compile, and deep-equals the result against the pre-absorb scene
  (`app/absorb.ts`); on any mismatch it restores the original source and
  leaves the overlay alone. Everything else - moved shapes, restyles,
  relabels, deletes, added arrows - stays in the overlay as a legitimate
  resting state, not a pending migration.
- **`tldsl-d3o` (F4, "absorb handles moves") is open**, not shipped. It's
  scoped in `docs/round-trip-scope.md`: reorder/gap intent-recovery for
  moves inside flow containers, restyle/relabel/delete round-trip for
  *existing* shapes, and a `--pin` escape hatch for `layout="free"`. Do not
  describe absorb as handling drags, restyles, or deletes until this lands.
- **Turning absorbed shapes into structured JSX (frames, components) is a
  model's job**, not the compiler's. `absorb` is deterministic codegen, not
  an agent restructuring a diagram.

Given this, `tldsl absorb $1` → `tldsl overlay show` → hand-edit the residual
→ `tldsl verify $1` is the actual round-trip workflow today, packaged as the
`/tldsl:sync` slash command (`commands/sync.md`).

## The hook feedback loop

`tldsl` ships as a Claude Code plugin (`.claude-plugin/plugin.json`,
`hooks/hooks.json`), not a snippet a user pastes into `.claude/settings.json`.
Two hooks:

- **`PostToolUse` on `Edit|Write`** → `hooks/on-edit.sh`. It filters to
  `*.tldsl.jsx` paths, shells out to `tldsl check`, and on success also
  tries `tldsl render --reuse-only` (only renders if a `tldsl serve` for
  that file is already running - it never boots one). The hook emits
  **structured JSON**, not plain stdout:
  `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}`.
  On a check failure, `additionalContext` carries the diagnostics text and
  "Fix the diagram before continuing." On success with a live render, it
  tells the agent to `Read` the PNG - closing the loop with an actual look
  at the picture, not just IR-level diagnostics (this is what Phase 11
  calls the difference between what `check` catches and what only a render
  catches, e.g. label clipping).
- **`UserPromptSubmit`** → `hooks/on-prompt.sh`. Scans the cwd for
  `*.tldsl.overlay.json` files with pending entries and nudges the agent to
  run `/tldsl:sync` when the canvas and the source disagree.

Both scripts are pinned end-to-end by `tests/e2e/hooks-fixture.test.ts`,
which spawns them for real (`spawnSync("sh", ...)`) against the CLI run from
source. `tests/e2e/sync-fixture.test.ts` pins the `/tldsl:sync` workflow.

This was a deliberate design choice over a polling sidecar: hooks are
synchronous, so errors land in-session, including for the last edit before
the agent stops. A sidecar is always at least a turn behind and never
catches up on the final edit.

## Why no MCP

The original exploration was tldraw's MCP integration. It timed out
reliably and felt like the wrong abstraction - too heavy, too brittle for
the use case. The pivot to a local file + watcher + viewer maps onto how
the agent already works: edit a file, something else renders it. See
`docs/decisions.md` ADR-1 and `docs/roadmap.md`'s rejected list.
