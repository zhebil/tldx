# Ralph plan

Source of truth for the autonomous loop. **This file is the only state that
survives between sessions.** Every wake reads it, does exactly one unit of work,
and writes back.

Branch: `ralph/jsx-layout`. Never work on `main`.

Two phases. Phase A is finite and ordered. Phase B is infinite and runs forever
once A is done. The loop never terminates; the human stops it.

---

## Status

- Phase: **B**
- Champion layout revision: `docs/layout-champion.md`, regenerated at wake 37
  when **B25 was kept**. The champion is now the wake-37 **B25** revision (a
  grid whose children carry a skip edge lays its rows out at double the gap) on
  top of the wake-28 **B9** revision (a note reserves the space tldraw actually
  draws), the wake-22 **B20** revision (topology-gated doc-root aspect wrap) and
  the wake-12 **B1** revision (cross-axis `align`, default `center`). Those four
  are the only hypotheses still standing - B2, B3, B4a, B13, B14, B15, B6, B27
  and B31 all reverted after judging, and B7 and B24 were rejected at an
  objective gate before judging. Judged results live in
  `docs/layout-hypotheses.md` - read it before proposing a hypothesis.
- **Arrows are `arc` with centre anchors, and arrow *attachment* is now a
  closed line of enquiry.** Eight hypotheses have changed how arrows attach -
  B3, B4a, B13, B14, B15, B24, B27, B31 - and all eight are reverted or
  rejected. Wake 36's B31 was the cleanest of them and the only one ever to
  clear gate 5 outright, and that is exactly what killed it: a clearance
  predicate fires only where the corridor is already empty, so it turns elbows
  on where they buy nothing (crossings unmoved on all six files) and off where a
  crossing needs fixing. The residual effect is pure cost - collapsed nubs on
  short hops, doglegs on already-straight lines - which is what the judge saw.
  **Do not file another attachment hypothesis.** Wake 37 confirmed the
  redirection was right: **B25** moved the corridor into *placement* and became
  the first hypothesis in the loop's history to lower gate 5, taking
  `wide-fanout` from 36 crossings to 31 with two blind wins and no losses. The
  live line of enquiry is now placement, not terminals - see **B32**.
  Gate 5's instrument is `tools/arrow-truth.mts`, which reads the vertices
  tldraw actually drew (the old model-based tracer matched 0 of 84 corpus arrows
  and was deleted at wake 32); the champion baseline is the table at the top of
  `docs/layout-champion.md`, at 10/5/1/0/0/**31** since wake 37.
- **The judge may answer `WINNER: TIE`** since wake 33 (B29). Ties count as
  neither wins nor losses, and the ledger distinguishes a *judged tie* from a
  *structural tie* (a file never sent to a judge because nothing changed). The
  exact prompt wording is fixed in protocol step 5 - use it verbatim.
- Last drift audit (protocol step 9): **wake 35** - **no drift**. All six corpus
  files came back a *structural tie* against `docs/baselines/wake-30/`:
  byte-identical PNGs and identical reports (modulo the gate-5 metric line wake
  32 deleted from `layout-report.mts`), so no file went to a judge and the
  ratchet did not engage. Expected, since the only hypothesis kept in between
  (B27) was reverted at wake 34 - but it confirms that revert was complete to
  the pixel, and it shows the screenshot pipeline is deterministic across five
  wakes. Epoch saved at `docs/baselines/wake-35/`. **Next audit: wake 40.**
  An audit is that wake's whole unit of work; it does not also run a hypothesis.
  The ratchet still has not been exercised against a champion that actually
  differs from its epoch - two audits in, drift is undetected, not
  demonstrated-absent. **Wake 40 will be the first audit that can fire**: B25
  moved `long-labels` and `wide-fanout` at wake 37, so the champion no longer
  matches the wake-35 epoch on those two files.

---

## Phase A — JSX pivot (finite, ordered, do the topmost unchecked)

Design is settled in `docs/jsx-pivot.md`. **Read it before starting any A task.**
Do not relitigate decisions recorded there. If a task turns out to contradict
that doc, stop, write the contradiction into "Blocked notes" below, and pick the
next task.

- [x] **A0 — Land the stack-layout spike properly.** _(wake 1)_
  `src/domain/layout/stack.ts` + `stack.test.ts` already exist in the working
  tree from a spike, along with `layout`/`gap`/`pad`/`cols` on IR and `lower.ts`.
  Turn it into the real thing: hybrid dispatch, bottom-up. A container with
  `layout` = `row`/`col`/`grid` is placed deterministically; a container with
  `layout="auto"` goes to ELK with its already-sized children as fixed-size leaf
  nodes. Default when `layout` is absent is `col`. Delete nothing from
  `elk-layout.ts` except what the hybrid makes dead.
  Done when: `npm run check` green, and `hex` in `scratch.tldsl` still lays out
  as a row of five column frames in source order.
  **Done.** `domain/layout/stack.ts` now exports `hybridLayout(ir, placeAuto)`:
  a pure bottom-up driver that sizes children first (recursing into frames),
  then dispatches per container on `layout ?? "col"`. `row`/`col`/`grid` and
  `free` are placed in the domain; `auto` builds an `AutoPlaceRequest` (sized
  unpinned children as flat fixed-size nodes, plus edges from anywhere in the
  subtree resolved to the owning direct child) and awaits the injected
  `AutoPlacer`. `ElkLayoutAdapter` shrank from 364 to 105 lines: it is now only
  that placer, building one flat ELK graph per auto container. `gap` drives
  `elk.spacing.nodeNode` and `round(gap * 1.5)` drives
  `nodeNodeBetweenLayers`, so the default `gap` of 40 reproduces the previous
  40/60 spacing exactly. `npm run check` green (264 tests); `hex` verified as a
  row of five column frames at x = 24, 224, 469, 741, 995.

- [x] **A1 — JSX runtime + component library.** _(wake 2)_
  `src/runtime/jsx-runtime.js` and `jsx-dev-runtime.js` exporting `jsx`, `jsxs`,
  `jsxDEV`. `jsxDEV` receives `(type, props, key, isStatic, source, self)`;
  stash `source` as the node's `span` in the shape `domain/parser/ast.ts`
  already uses. Components: `Doc`, `Frame`, `Group`, `Box`, `Note`, `Edge`, plus
  a `flow(...nodes)` helper returning an array of `Edge` nodes.
  Output must be exactly the existing AST type — `ast.ts` does not change.
  Done when: a unit test executes a small element tree and asserts the AST
  matches what the old parser produced for the equivalent `.tldsl`.
  **Done.** `src/runtime/` is a new lint-enforced leaf layer (eslint zones +
  dependency-cruiser rules + `CONTEXT.md`): it may import types from
  `domain/parser` and `contracts` and nothing else, and nothing may import it
  until A3's executor. `jsx-runtime.ts` exports `jsx`/`jsxs`/`Fragment`,
  `jsx-dev-runtime.ts` exports `jsxDEV(type, props, key, isStatic, source)`;
  both just call the resolved `type` as `type(props, source)`, so user-defined
  components work for free. `components.ts` has `Doc`, `Frame`, `Box`, `Note`,
  `Edge`, `flow`, building the exact `ast.ts` shapes — `ast.ts` untouched.
  esbuild's `source.columnNumber` is **1-based**, matching the text parser, so
  spans map straight through with no fixup. `runtime.test.tsx` builds a tree in
  real JSX and asserts it equals `parse()` on the equivalent `.tldsl` once spans
  are stripped, then asserts the spans separately. `npm run check` green (269
  tests, 34 files).
  Two deviations, both deliberate: written as `.ts` not `.js` (`allowJs` is off,
  so `tsconfig.build.json` would not emit `.js` from `src/` and neither linter
  would cover it — the module specifiers `tldsl/jsx-runtime` and
  `tldsl/jsx-dev-runtime` are what actually matter and still resolve), and
  `Group` omitted (see Blocked notes).

- [x] **A2 — `ExecutePort` + fake.** _(wake 3)_
  `src/app/ports/execute.ts`: `(source, path) => Promise<{ast} | {diagnostics}>`.
  Fake returns a canned AST with no worker. Contract test alongside, following
  the pattern in `src/app/ports/watch.contract.ts`.
  **Done.** Four new files, nothing existing touched. `execute.ts` is
  `ExecuteResult = { ast: AstNode } | { diagnostics: Diagnostic[] }` plus a
  one-method `ExecutePort`. Success carries `AstNode`, not `AstDoc`, so
  root-must-be-`<doc>` validation stays in `lower.ts` where the text parser
  already put it. The port never rejects: compile error, user throw, and
  timeout all come back as `{ diagnostics }`, and the header names the codes
  A3 must emit (`runtime/threw`, `runtime/timeout`).
  `FakeExecute` is a lookup table keyed by the **source string** (not the
  path), programmed with `setResult(source, result)`, defaulting to an empty
  `<doc>`, with a `calls` log. It never inspects `source`.
  `execute.contract.ts` exports `runExecuteContract(label, make, options)` over
  a harness that yields `okSource(boxId)` / `throwingSource()` / `infiniteSource()`
  plus one `path`. Four scenarios: success (ast is a doc containing the box),
  throw (resolves, all-error diagnostics, one `runtime/threw` with
  `span.file === path`), timeout (`runtime/timeout`), and **no cross-call
  state** — two different sources at the *same* path must return their own
  box, which is what pins decision 8's "fresh worker per compile, so ESM module
  caching is a non-issue". The real A3 adapter fails that test if it caches by
  path. `npm run check` green (35 files, 276 tests).

- [x] **A3 — `infra/execute-jsx/` adapter.** _(wake 4)_
  esbuild **bundle** (not transform) with `jsx: "automatic"`,
  `jsxImportSource: "tldsl"`, `jsxDev: true`, `metafile: true`, `sourcemap`,
  `"tldsl"` aliased to the bundled runtime, `node_modules` external.
  Execute the bundle in a fresh `worker_threads` Worker per compile.
  `worker.terminate()` at 2s → `runtime/timeout` diagnostic. A thrown error maps
  through the sourcemap to one `runtime/threw` diagnostic with a real line.
  Return `metafile.inputs` alongside the AST.
  Done when: contract test covers success, throw, and infinite-loop-terminates.
  **Done.** `createJsxExecute()` in `src/infra/execute-jsx/execute-jsx.ts`.
  esbuild is now a real `dependency`, contained to this folder the same way
  `elkjs` is contained to `infra/layout-elk/` (eslint group + dep-cruiser rule).
  The entry's *contents* come from the `source` argument and never from disk:
  a plugin claims the entry path in `onResolve` (esbuild's own resolver refuses
  a path whose on-disk content is irrelevant) and serves `source` in `onLoad`,
  so the resolved path stays the real one - `jsxDEV`'s `source.fileName` and
  every downstream span depend on that, and it is what makes the contract's
  "no cross-call state" scenario pass. The `"tldsl"` alias resolves
  extensionless off `import.meta.url`, so the same code picks `src/runtime/*.ts`
  under vitest/tsx and `dist/runtime/*.js` from a build (`npm run build:cli`
  verified). The bundle goes to a fresh `Worker(bootstrap, { eval: true })` per
  call - no temp files - where `Module#_compile` runs it under the entry's own
  path, so thrown frames read `<path>:line:col` and `node:module`'s `SourceMap`
  maps the topmost one back to the original line (pinned: a throw on line 3
  reports line 3). 2s hardcoded budget, then `terminate()` and
  `runtime/timeout`.
  Two additions beyond the task's wording, both flagged in "Discovered work"
  by earlier wakes: `ExecuteResult`'s success arm widened to
  `{ ast; inputs: string[] }` (absolute, from `metafile.inputs`, transitive
  imports pinned by an adapter test), and a build failure got its own code
  `runtime/compile` plus a fifth contract scenario.
  Review caught one real bug the subagent shipped: esbuild's
  `BuildFailure.location.file` is relative to `absWorkingDir`, not
  `process.cwd()`, so every compile diagnostic pointed at a path under the repo
  root instead of the user's file. Fixed, and pinned by an adapter test - the
  contract alone only asserts the code, which is why it slipped.
  `npm run check` green (36 files, 285 tests); `npm run build:cli` green.

- [x] **A4 — Wire `.tldsl.jsx` into `compileFile`.** _(wake 5)_
  Dispatch on extension. `.tldsl` keeps working for now. Nothing downstream of
  `ast.ts` changes.
  **Done.** `CompileFileDeps` gains a required `execute: ExecutePort`;
  `compileFile` dispatches on a `.jsx` suffix, hands `(source, path)` to the
  port, short-circuits to `{ sceneJson: null, diagnostics }` on the diagnostics
  arm, and otherwise feeds `result.ast` into the same `lower → layout → emit`
  chain the text parser feeds. Nothing downstream of `ast.ts` moved. Threaded
  through `watchAndServe` → `runServe` → `main.ts`, which now wires
  `createJsxExecute()` into both subcommands. `runCheck`'s PostToolUse skip
  guard accepted only `.tldsl`, which silently swallowed every `.tldsl.jsx`;
  it now accepts both.
  Wake 4's three-disagreeing-`SourceSpan.file`-shapes note is **resolved**. The
  rule picked: *every diagnostic's `span.file` is expressed the same way the
  caller expressed `path`*. Because a span only reaches the outside world
  through a `Diagnostic` (`emit`/`SceneJSON` never carry one), that is a
  `.map()` over the returned diagnostics in `compileFile`, not an AST walk -
  and it is a no-op for the text parser, which is what makes it safe. A
  sibling-imported component's span survives as `foo/Parts.jsx`, not flattened
  onto the entry.
  **Review caught a second real bug**, this one invisible to the test suite:
  `createJsxExecute` used `dirname(path)` verbatim as esbuild's
  `absWorkingDir`, so a **relative** entry path - exactly what the CLI and the
  PostToolUse hook pass - died with *"The working directory ... is not an
  absolute path"*, and the span it produced was double-prefixed. Every existing
  test passed because the contract harness and the e2e fixtures all build
  absolute paths from `tmpdir()`. Found by running `npm run dev:cli -- check`
  on a relative path by hand. The adapter now resolves the entry once in
  `execute()` and every span it returns is absolute (which is what
  `compileFile` normalises back); pinned by an adapter test that deliberately
  builds a cwd-relative path.
  `npm run check` green (36 files, 294 tests). Verified by hand:
  `check <relative>.tldsl.jsx` exits 0 silently on the good fixture, prints
  `tests/e2e/fixtures/check-jsx-broken.tldsl.jsx:2:9: error[runtime/threw]` and
  exits 1 on the broken one, and still exits 0 silently on `src/cli/main.ts`.

- [x] **A5 — Unknown-prop rejection in `lower.ts`.** _(wake 6)_
  `<Box lable="x" />` and `<Box className="..." />` must produce
  `ir/unknown-prop` with the allowed list and a real span. Mirror the existing
  `parser/unknown-element` hint format in `parse.ts`.
  This is the safety net that replaces the type checker — do not skip it.
  **Done.** One `ALLOWED_PROPS` table in `lower.ts` plus a `checkUnknownProps`
  helper called at the top of `lower()` (doc root) and of each of
  `lowerFrame`/`lowerBox`/`lowerNote`/`lowerEdge` - before `lowerEdge`'s early
  return on a missing endpoint, so a typo'd edge still reports. One diagnostic
  per offending attribute, spanned on `AttrValue.nameSpan`, best-effort like
  every other check in the file: it never drops the element.
  The allowed sets are **exactly what `lower.ts` consumes** and nothing more:
  `doc` = id/direction/layout/gap/pad/cols, `frame` = that plus name/x/y/w/h,
  `box` = id/label/x/y/w/h, `note` = id/x/y/w/h, `edge` = id/from/to.
  That is the one real decision in this task, and it was made deliberately:
  `docs/dsl.md` documents `type`, `route`, `head-start`, `head-end`, `bg` and
  `border`, none of which the IR reads. Whitelisting them would re-create for
  those six props the exact silent-ignore bug A5 exists to kill, and the
  message ("is not supported on") is honest about them. It matches how
  `lower.ts` already treats anchor and free-endpoint syntax
  (`ir/anchor-not-supported`). Consequence: `scratch.tldsl` used `type="bi"`,
  `type="line"` and `route="curved"` on ten edges; those attributes were
  removed (nothing else in that file touched) and it now checks clean.
  The rule immediately caught a real pre-existing fixture bug it was not
  aiming at: `watch-and-serve.test.ts`'s `ANOTHER_VALID_DOC` had
  `<note id="readme" label="ok" />`, and `<note>` takes its text as a child,
  never as `label` - so that fixture had been silently rendering an empty
  sticky. Fixed to `<note id="readme">ok</note>`.
  `npm run check` green (36 files, 298 tests). Verified by hand through the
  **JSX** front end, which is the front end that matters here:
  `<Box id="a" lable="API" className="rounded-lg bg-blue-500" />` prints two
  `error[ir/unknown-prop]` lines with the allowed list and exits 1, and
  `check scratch.tldsl` exits 0 silently.

- [x] **A6 — Watch the module graph.** _(wake 7)_
  `app/ports/watch.ts` takes a set of paths and supports re-subscription.
  `watchAndServe` re-subscribes to `metafile.inputs` after each compile.
  A **failed** compile keeps the previous watch set — pin that in the contract
  test, it is the nasty failure mode.
  **Done.** `WatchPort.watch(paths, listener)` now takes an array and
  `WatchHandle` gains `update(paths)`, which replaces the watched set and is
  required to diff (an unchanged set must not itself produce an event, or a
  re-subscribe would look like a change and recompile forever). `FakeWatch`
  holds a mutable `Set` per subscription; the chokidar adapter keeps one
  `FSWatcher` per handle and calls `unwatch`/`add` on the delta only.
  `watch.contract.ts` gained four scenarios — initial multi-path set,
  `update()` adds, `update()` drops (200ms silence check), and `update()` with
  an unchanged set stays silent — all four run against both the fake and real
  chokidar.
  `CompileFileResult` gained `inputs: string[] | null`, resolving the wake-5
  note. `null` means *unknown, keep whatever you had*: the fs-read-error arm
  and the JSX `{ diagnostics }` arm return it, so `watchAndServe` skips the
  `update()` and the previous set survives a failed compile. The text parser
  always returns `[path]` (known even on a parse error); the JSX success arm
  returns `executed.inputs` normalised through the same path-style rule A4
  introduced for spans (`normaliseSpan`'s core became `normalisePath` and is
  now shared), so a stable module graph produces a byte-identical set every
  compile and the diff is a no-op.
  The plan said "pin it in the contract test", but `WatchPort` knows nothing
  about compiles, so the rule cannot live there. It is pinned in
  `watch-and-serve.test.ts` instead, with a comment saying why; the contract
  covers the port-level half (`update` semantics).
  **Review corrected one claim the subagent shipped:** its adapter comment
  asserted that re-adding an already-watched path makes chokidar re-emit
  `add`. Probed chokidar 5.0.0 directly — it honours `ignoreInitial` for
  post-`ready` `add()` too, and emits nothing. The diff is therefore
  defensive, not load-bearing; the comment now says so. This also means the
  contract's "update() adds a path" scenario is *not* passing vacuously.
  `npm run check` exit 0 (36 files, 312 tests). Verified by hand with the
  **real** adapters (chokidar + esbuild worker + ELK) on a two-file diagram:
  editing an imported `Parts.tldsl.jsx` pushes a second scene carrying the new
  label, and — the nasty case — breaking the entry then editing the import
  while it is still broken still pushes a third message, proving the import
  stayed subscribed across a failed compile.

- [x] **A7 — Port fixtures and corpus to JSX.** _(wake 8)_
  Convert `tests/e2e/` fixtures and `scratch.tldsl`. Parity gate: the auth
  fixture must produce byte-identical `SceneJSON` through both front ends.
  Also create the Phase B corpus (see A9's tooling for what it feeds):
  `tests/corpus/hexagonal.tldsl.jsx`, `sequence.tldsl.jsx`,
  `wide-fanout.tldsl.jsx`, `deep-nesting.tldsl.jsx`, `sparse-graph.tldsl.jsx`,
  `long-labels.tldsl.jsx`. Six diagrams, deliberately different shapes.
  **Done.** `auth.tldsl.jsx` sits beside `auth.tldsl` and the parity gate is a
  new `describe` in `auth-fixture.test.ts` asserting
  `JSON.stringify(jsxScene) === JSON.stringify(textScene)` — byte-identical,
  not `toEqual`, so key order counts. Verified non-vacuous by hand: 21 records
  each side, equal; flipping one label in a copy of the JSX fixture makes it
  differ. `scratch.tldsl` was **replaced** by `scratch.tldsl.jsx` (the `.tldsl`
  is deleted — A8 removes the front end that read it), with four genuinely
  linear edge runs collapsed onto `flow(...)`. `check-jsx-dup.tldsl.jsx` ports
  the duplicate-id case; its golden file was *captured from a real run*, not
  hand-written. The corpus is six files plus `corpus.test.ts`, which globs
  `*.tldsl.jsx`, asserts at least six were found, and compiles each through
  the real esbuild/worker + ELK stack expecting zero diagnostics.
  `sparse-graph.tldsl.jsx` sets `layout="auto"` so the corpus keeps one file
  on the ELK path. Verified `npm run check` green (37 files / 321 tests,
  exit 0) and every corpus file plus `scratch.tldsl.jsx` exiting 0 silently
  through the real CLI.

- [x] **A8 — Delete the text parser.** _(wake 9)_
  `tokenize.ts`, `parse.ts`, their tests, `.tldsl` dispatch. Update the
  PostToolUse matcher to `.tldsl.jsx`. One commit, clearly labelled.
  **Done.** 1090 LOC of front end gone (`tokenize.ts` 360 + `parse.ts` 350 +
  tests 383), plus `auth.tldsl`, `check-good.*`, `check-broken.*`.
  `compileFile` no longer dispatches on extension at all — every path runs
  through `ExecutePort` — and `runCheck`'s skip guard accepts `.tldsl.jsx`
  only, which collapses the two gates the wake-5 note warned could drift.
  `ast.ts` is untouched; it is the AST contract the JSX runtime produces.
  Two things the plan's one-line description did not anticipate, both
  resolved rather than deferred:
  1. `lower.test.ts` and `stack.test.ts` used `parse()` as a *terse AST
     fixture builder*, and cannot use the JSX component library instead
     (`domain/` may not import `src/runtime/`). New test-only
     `domain/parser/ast.fixture.ts` exports `astBuilders(file)`; `*.fixture.ts`
     joins `*.fake.ts` in `tsconfig.build.json`'s exclude. Its per-attribute
     synthetic column exists so the `ir/unknown-prop` test can still tell an
     attribute's `nameSpan` from its element's span — the first cut stamped
     one span on everything, which made that assertion vacuous.
  2. `serve-fixture.test.ts` copied `auth.tldsl` into a temp dir; nothing in
     the delete list mentioned it and it would have failed with ENOENT.
  Four tests deleted rather than ported, all pinning behaviour that is now
  structurally unreachable (`execute()`'s success arm always carries a node):
  the parse-error arm, `"never calls execute for a .tldsl path"`, and the two
  that relied on an empty file lowering to a null AST with no diagnostics.
  `auth-fixture.test.ts`'s grammar check was *rewritten* against
  `auth.tldsl.jsx` through the real esbuild adapter rather than dropped; the
  parity gate went, having nothing left to compare.
  Verified myself: `npm run check` exit 0 (35 files / 272 tests, down from 37
  / 321 — the delta is the parser's own 49 tests), `npm run build` exit 0, and
  by hand through the real CLI — corpus and `scratch.tldsl.jsx` exit 0
  silently, `check-jsx-broken.tldsl.jsx` still prints
  `2:9: error[runtime/threw]` and exits 1, and a non-`.tldsl.jsx` path is
  now skipped silently.

- [x] **A9 — Layout report tool.** _(wake 10)_
  `tools/layout-report.mts <file>` printing, deterministically:
  1. Per-container geometry table (id, parent, x, y, w, h) in source order.
  2. Objective metrics: canvas w/h, aspect ratio, total shape area / canvas
     area, count of overlapping shape pairs, count of edge-edge crossings,
     total edge length, mean edge length, count of edges crossing a frame
     boundary they don't belong to, source-order violations per container,
     left-edge alignment groups per container.
  3. A coarse **ASCII render**: normalise the canvas to ~100 columns, draw frame
     borders, place truncated box labels, draw edges as straight character
     lines. This is what makes a text-only judge able to see the diagram.
  Must be pure-stdout, no colour, stable across runs.
  Delete `dump-tmp.mts` when this lands.
  **Done.** `tools/layout-report.mts` exports a pure
  `layoutReport(doc: IRDocPositioned): string` plus a `main()` that builds its
  own mini pipeline (fs read → `createJsxExecute` → `lower` → `ElkLayoutAdapter`)
  (`compileFile` only returns opaque `SceneJSON`, useless for geometry).
  Child coordinates are parent-relative, so the walk accumulates offsets and
  every metric is absolute. Overlap skips ancestor-related pairs; edges are
  centre-to-centre segments; crossings use a strict orientation test that
  excludes shared endpoints. `tsconfig.json`'s `include` gained `"tools"` so
  typecheck covers the tool (eslint/dep-cruiser only scan `src`).
  Two deliberate deviations from the wording above, both load-bearing:
  - The ASCII render is capped at **60 rows**. Verbatim "~100 columns, preserve
    aspect" gave `wide-fanout` a **975-line** report, unusable as a judge
    prompt, and it would appear twice per Phase B judge call. The render now
    compresses vertically and its header states the distortion exactly
    (`1 cell = 1.4 x 42.7 px`), with the true canvas and aspect ratio printed
    in the metrics right above it.
  - "Total shape area" is **leaf area only** (boxes + notes). Frames contain
    their children, so summing both double-counts.
  Verified: `npm run check` green (36 files / 273 tests, one new test pinning
  the three gate metrics on a hand-built doc), and all six corpus files plus
  `scratch.tldsl.jsx` byte-identical across two consecutive runs.

- [x] **A10 — Docs.**
  Rewrite `docs/dsl.md` for JSX. Amend `docs/decisions.md`: ADR-2 amended;
  ADR-10, ADR-11, ADR-12 rule 2 removed; ADR-5 gets a note that ELK is demoted
  to opt-in `layout="auto"`; add ADRs for the pivot decisions. Update
  `CONTEXT.md` layers, ports table, and glossary. Update `README.md`. _(wake 11)_
  **Done.** `docs/dsl.md` rewritten from scratch (255 lines) against the shipped
  surface only, with a short "Not implemented" tail instead of the old doc's
  aspirational phase-1 element table. `docs/decisions.md` amended in place:
  ADR-2/4/5/6/8 gained JSX-pivot update notes, ADR-10 tombstoned as DELETED,
  ADR-11 tombstoned as REJECTED, ADR-12 rule 2 struck through with the `ns`
  convention as its replacement, and ADR-14..21 added for the eight shipped
  pivot decisions. `CONTEXT.md`: stale "pre-implementation" note removed,
  `domain/parser/` reworded as AST-type-only, `infra/execute-jsx/` added to the
  layers and dependency rules, an `ExecutePort` row added to the boundaries
  table, both dependency structs corrected, the span section rewritten around
  `jsxDEV`, and `runtime`/`ExecutePort`/`hybrid layout` added to the glossary.
  `README.md`: status corrected (it claimed "pre-implementation" while both
  subcommands work end to end), every `.tldsl` path fixed to `.tldsl.jsx`, the
  dead `docs/open-questions.md` link dropped, `docs/jsx-pivot.md` linked, and a
  real JSX snippet added.
  Verified myself, not the subagents' word: `npm run check` exit 0 (36 files /
  273 tests), and both the `dsl.md` full example and the `README.md` snippet
  extracted to `/tmp` and run through the real CLI - both exit 0 silently.

When every box above is checked, set **Phase: B** in Status, run one full
`tools/layout-report.mts` over the corpus, commit it as
`docs/layout-champion.md`, and begin Phase B on the next wake.

---

## Phase B — layout quality loop (infinite)

One hypothesis per wake. Never batch. Never stop.

### Protocol

1. **Pick a hypothesis.** Take the top unstruck entry from "Hypothesis backlog"
   below. If the backlog is empty, generate three new hypotheses from the
   evidence in `docs/layout-hypotheses.md` (what has already failed and why) and
   append them, then take the top one. The backlog is never allowed to be empty
   at the end of a wake.

2. **Record the champion.** `tools/layout-report.mts` over all six corpus
   files, saved as the champion report, AND `tools/screenshot.mts` over the same
   six, saved as champion PNGs. Both are the baseline for this wake only. See
   "Rendering for judgement" below - the report alone is not sufficient
   evidence.

3. **Build it.** Delegate implementation. Smallest change that tests the
   hypothesis. No refactoring rides along.

4. **Objective gates.** Candidate is rejected without a judge if any hold:
   - `npm run check` fails.
   - Any overlapping shape pair that the champion did not have.
   - Any source-order violation in a `row`/`col`/`grid` container.
   - Canvas area more than 1.5× the champion's on any corpus file.
   - `arrow paths crossing a non-endpoint shape` higher than the champion's on
     any corpus file _(added wake 19 as B17; re-based on the real render at wake
     32, see B28)_. This is the only gate that can see an arrow change at all -
     the other four are tautologies for one. **It comes from
     `npx tsx tools/arrow-truth.mts tests/corpus/*.tldsl.jsx`, which reads the
     vertices tldraw actually drew - not from `layout-report.mts`, which no
     longer carries this metric.** The champion baseline is the table at the top
     of `docs/layout-champion.md`.
   A rejection here is still a result — record it and move on.

5. **Subjective judgement.** Delegate to a **fable** subagent, once per corpus
   file. Give it: the source, two **rendered PNGs** labelled **A** and **B**,
   and the two matching geometry reports under the same labels. The A/B
   assignment is **randomised per file** (record which was which; never tell the
   judge). Ask for a winner and one sentence of reasoning. Never ask for a
   numeric score — pairwise comparison only.

   **The judge may answer `WINNER: TIE`, and must be told so.** Required wording
   in the prompt: *"Answer `WINNER: A`, `WINNER: B`, or `WINNER: TIE`. Choose
   TIE only when you can see no difference that matters to a reader of the
   diagram - do not use it to avoid a call you can make, and do not break a
   genuine tie by guessing."* Never tell the judge how ties are counted.

   The judge must look at the images. Tell it explicitly: **where the render and
   the geometry report disagree, the render is the truth.** The report describes
   what layout intended; the PNG shows what tldraw actually drew.

   **Only files that actually changed get a vote.** Before judging, compare each
   file's candidate geometry report and PNG against the champion's. Identical on
   both → structural tie, never sent to a judge, no vote. A change that touches
   two of six corpus files must not have to win over the four that cannot see
   it.

6. **Verdict — keep unless the judge says it is worse.** Count only the voting
   files from step 5.

   - Losses **strictly greater than** wins → **REVERT**.
   - Everything else - more wins, equal wins and losses, or no voting files at
     all → **KEEP**.

   **A judged tie counts as neither a win nor a loss.** It is recorded in the
   ledger table as a *judged tie*, kept distinct from the *structural tie* of
   step 5 (a file that never went to a judge because nothing changed). A
   candidate whose every voting file comes back a judged tie is still a KEEP,
   under the "no voting files at all" clause - so this does not re-introduce the
   revert-everything failure mode. It only stops counting coin flips as
   evidence: before this rule the judge was told not to hedge, so an
   indistinguishable pair was decided by position, and under keep-by-default
   that silently converted no-information files into candidate votes whenever
   the randomiser favoured one label (B27 scored two of its three wins as "A
   wins by default", with the candidate at A on 4 of 5 files).

   This inverts the burden of proof deliberately. The five objective gates
   already block measurable breakage, so the judge's job is to catch the
   regressions the metrics miss, **not** to certify improvements. Under the old
   rule (strictly more wins, ties to the champion) 10 of 12 judged hypotheses
   were reverted and the rendered output did not change across 13 wakes; B13
   scored 1 win, 1 loss and 4 blind ties and was thrown away. A loop that
   reverts almost everything learns almost nothing, and small real gains never
   get the chance to compound.

7. **Record.** Append to `docs/layout-hypotheses.md`: the hypothesis, the diff
   summary, gate results, per-file verdicts with the judge's reasoning, and
   KEPT or REVERTED. A reverted hypothesis is `git checkout`-ed away and struck
   through in the backlog so it is never retried blind.

8. **Commit.** Kept → commit the change plus the ledger entry. Reverted →
   commit the ledger entry alone. Either way the wake ends with a commit.

9. **Drift audit — every fifth wake, before step 1.** Keeping by default trades
   a revert-everything failure mode for a slow-decay one, so it needs a ratchet.
   Blind-A/B the current champion against the epoch baseline saved five wakes
   ago, all six files. If the *older* baseline wins more files than it loses,
   the loop has drifted: record it, and make the next wake's unit of work
   bisecting the ledger for the change responsible and reverting it. Either way,
   save a fresh epoch baseline (reports + PNGs) under `docs/baselines/wake-NN/`
   and note the audit in the ledger. An audit wake counts as that wake's unit of
   work - do not also run a hypothesis.

### Rendering for judgement

`tools/screenshot.mts <file.tldsl.jsx> <out.png>` starts `serve`, loads the
viewer in headless chromium via playwright, waits for the canvas to paint,
captures a PNG, and kills the server. Playwright is a devDependency; chromium is
already cached locally. Do not use the playwright MCP browser tools for this -
they report success but do not write the file to this filesystem.

**Why this exists.** The geometry report describes the layout engine's model of
the diagram. tldraw does not honour that model exactly, so the report can be
confidently wrong:

- Notes reserve a fixed box in layout, but tldraw resizes stickies to fit their
  text. A note can overlap three shapes while the report says
  `overlapping shape pairs: 0`.
- tldraw wraps box label text to the box width no matter what the estimator
  believed. A box the estimator thinks fits on one line can render clipped or
  wrapped.

Both defects are invisible to a text-only judge, and one of them already cost a
correct decision: **B2 (label wrapping) was REVERTED at wake 13** on the
reasoning that the champion "keeps every long label on one legible line" - which
was true of the report and false of the render. B11 carries that hypothesis
forward; retry it now that the judge can see, and treat the B2 verdict as void
rather than as evidence.

Any hypothesis about text metrics, note sizing, arrow routing, or anything else
whose effect is produced by the renderer rather than by layout **must** be judged
on PNGs. If the screenshot tool is broken, fix it as that wake's unit of work
rather than falling back to text-only judging.

### Rules that keep this honest

- **Never edit the corpus to make a hypothesis win.** Corpus changes are their
  own hypothesis, judged on whether the corpus covers real diagram shapes, and
  they invalidate the champion report (regenerate it).
- **Never let the judge see which side is the candidate.**
- One hypothesis per wake even if it looks trivial.
- **One causal claim per wake, revertible as a unit.** There is no line-count
  cap - size was never the point. What matters is that the ledger entry stays
  evidence: a wake changes one thing, and the verdict attributes to that one
  thing. A diff that mixes spacing *and* anchors *and* note sizing produces a
  verdict that means nothing, and under keep-by-default it gets absorbed whole,
  good parts and bad parts together, with no signal that anything was wrong.
  The drift audit's remedy is "bisect the ledger", which only works if entries
  are individually meaningful.
- **Bundle only when the parts are known to fail separately, and say why in the
  ledger.** Isolating one variable is the right default, but it is wrong when
  the variables only work together: B3 (elbow) and B4a (side anchors) each lost
  alone for mirror-image reasons, and B13 established they have to ship as one.
  A backlog entry marked **EPIC** is one that has already been argued to be
  indivisible; it may also span wakes by saving a patch under `docs/patches/`
  and picking it up next wake.
- A diff running past a few hundred lines is a *signal*, not a violation -
  usually it means two claims got bundled without noticing. Check, and split if
  that is what happened.
- Objective gates run before the judge, always. Pretty-but-broken never wins.
- **Keeping is the default.** Revert only on a gate failure or a judged
  regression. Neutral is a keep.
- **A reverted hypothesis may be restored** when the rule that rejected it has
  changed, or when a later wake removes the blocker its ledger entry named. Say
  so explicitly in the new backlog entry, cite the original entry, and re-judge
  from scratch - never resurrect one silently.
- **The report models layout; the PNG shows the render. The PNG wins.** Never
  conclude anything about text fit, note size, or arrow paths from the report
  alone - those are renderer behaviour, and the report does not simulate them.

### Hypothesis backlog

Ordered. Take from the top. Strike through when resolved.

- [x] ~~**B17** _(tooling wake, not an A/B)_ A fifth objective gate:
  `tools/layout-report.mts` (or a sibling) counts, from the **emitted scene**
  plus the layout rects, how many arrow paths cross a non-endpoint shape's rect
   - and for `kind: "elbow"` it must trace the actual L-legs, not the
  centre-to-centre chord. Reject a candidate that raises the count on any
  file.~~ **BUILT** _(wake 19)_ - `layoutReport` now emits the scene and traces
  each arrow from its binding records, so the metric follows whatever a
  candidate actually emits (`kind`, `normalizedAnchor`, `isPrecise`) rather than
  the IR edge list. Added to the protocol's gate list above. Champion baseline
  recorded in `docs/layout-hypotheses.md`.

- [x] ~~**B18** Short-edge arrowhead floor: keep centre anchors
  (`isPrecise: false`) for any edge whose endpoint rects are closer than a small
  multiple of the arrowhead size, and only use a precise anchor when there is
  room to draw a head.~~ **STRUCK - vacuous** _(wake 20)_ - never measured,
  because there is nothing to measure. B18 was written while B15's side anchors
  were live; B15 reverted, so no production code sets `normalizedAnchor` or
  `isPrecise` at all. `arrowShape()`'s only writer is
  `contracts/builders.ts:261-262`, which defaults every terminal to
  `{0.5, 0.5}` / `isPrecise: false`; grepping `src/` for either symbol outside
  tests and snapshots returns nothing. "Keep centre anchors for short edges" is
  therefore a description of the champion, not a change to it. Revive only if
  some future hypothesis reintroduces precise anchors - at which point this is
  the floor it needs, not a hypothesis of its own.

- [x] ~~**B15** Elbow arrows + B13 side anchors, gated per edge to the edges
  that have room to route: keep `kind: "elbow"` and the side anchor only if the
  centre-to-centre run does not pass through a third shape's rect.~~
  **REVERTED** _(wake 18)_ - 1 candidate / 2 champion / 3 ties, and it closes
  the whole terminal-binding line. Two findings. (a) A straight-line clearance
  test is the wrong predicate for an orthogonal router: `hexagonal` kept 18 of
  66 edges on elbow and still drew vertical legs through boxes, because the gate
  tests the chord and the router draws an L. (b) The `deep-nesting` win B13 and
  B14 both scored was never about routing - with only 2 of 24 edges left on
  elbow the file *flipped to the champion*, decided by the judge on arrowheads,
  the mirror of `wide-fanout` flipping the other way for the same reason. The
  one repeated win in five arrow wakes was a renderer artefact at short edges.
  Survives only as **B18**. Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B16** Bound the B14 distribution by the *targets' span* rather than by
  the whole side.~~ **STRUCK** _(wake 18)_ - never measured. Its own gate was
  "strictly gated on B15 ... only worth trying if B15 shows the routing is
  salvageable at all", and B15 shows it is not: the router cannot be made to
  avoid boxes by choosing anchors, whatever the spacing rule. Retry only if
  something makes the routing itself obstacle-aware.

- [x] ~~**B14** Distribute the edges that share a side along that side instead
  of stacking them all on its midpoint, sliding the `k`-th of `n` to
  `k / (n + 1)`.~~ **REVERTED** _(wake 17)_ - and a regression against B13,
  which stays the high-water mark. 1 candidate / 3 champion / 2 ties, where B13
  scored 1-1 on the same corpus with the same routing. Distribution did not
  repair `hexagonal` and it lost `long-labels` and `wide-fanout`, both of which
  B13 had tied. Cause: stacking `n` edges on one anchor makes them *share* one
  trunk; distributing them creates `n` distinct parallel trunks, each of which
  must cross the diagram on its own path - so in a corridor layout it multiplies
  the box-piercing runs by `n`. Survives as **B16**, gated behind **B15**.
  Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B13** Elbow arrows **and** side anchors as one change. Flip
  `arrowShape()` to `kind: "elbow"` *and* derive each terminal's
  `normalizedAnchor` from layout geometry with `isPrecise: true`, then judge the
  pair.~~ **REVERTED** _(wake 16)_ - but the closest result yet, and the first
  arrow hypothesis to win a file. 1 candidate / 1 champion / 4 ties; ties go to
  the champion, so a 1-1 split reverts. The package hypothesis held
  (`deep-nesting` won exactly as B3 predicted once terminals stopped binding to
  centres); what remains broken is that all seven of `usecases`'s outgoing edges
  stack on one side midpoint. Survives as **B14**. Patch saved to
  `docs/patches/b13-elbow-side-anchors.patch`. Ledger entry in
  `docs/layout-hypotheses.md`.

- [x] ~~**B1** `align` attribute (`start`/`center`/`end`) on row/col
  containers.~~ **KEPT** _(wake 12)_ - shipped with the implicit default
  flipped from `start` to `center`, which is the part the frozen corpus could
  actually see. 5 candidate / 0 champion / 1 structural tie. Ledger entry in
  `docs/layout-hypotheses.md`.
- [x] ~~**B2** Real text measurement instead of `len * 9 + 48`. Height is
  currently pinned at 60 and text never wraps, so `a10` is a 426px box for one
  line. Try: wrap at a max width, measure per-line, grow height.~~
  **REVERTED** _(wake 13)_ - a constant 320px wrap cap trades a too-wide canvas
  for a too-tall one (`long-labels` 948x1200 → 318x1880, aspect 0.79 → 0.17,
  crossings 0 → 2). 0 candidate / 1 champion / 5 structural ties. The mechanism
  survives as B11; the constant cap does not. Ledger entry in
  `docs/layout-hypotheses.md`.
- [x] ~~**B3** Default arrow `kind: "elbow"` instead of tldraw's `arc`.~~
  **REVERTED** _(wake 14)_ - and the backlog premise was wrong: `builders.ts`
  does set `kind`, to `"arc"`. 1 candidate / 2 champion / 3 ties. Elbow routing
  helps where it has room but every terminal is bound to a shape **centre**
  (`normalizedAnchor: {0.5, 0.5}`), so an orthogonal segment is drawn straight
  through the source box, the target box, and whatever is stacked between. Not
  a bad default - a default that cannot be adopted before B4. Survives as B12.
  Ledger entry in `docs/layout-hypotheses.md`.
- [x] ~~**B4** Ship the anchor scheme (8 compass + `center` + `@x,y`), then bind
  edges to sides instead of centres. Evidence: `usecases` has seven outgoing
  edges all bound to its centre.~~ **REVERTED** _(wake 15)_ - split first: the
  authored attribute is a language feature the frozen corpus cannot exercise, so
  only the judgeable half (**B4a**, anchors derived automatically from layout
  geometry) was measured. 0 candidate / 1 champion / 5 ties. `isPrecise: false`
  does not mean "draw from the centre" - tldraw clips the curve at the box
  boundary, which is a *continuous* side anchor, so snapping to four fixed side
  midpoints coarsens it. Survives only as part of **B13**. Ledger entry in
  `docs/layout-hypotheses.md`.
- [x] ~~**B5** Edge-aware child ordering *within* a `col` container: keep source
  order as the tie-break but let a container opt into sorting children to line
  up with a neighbouring container's connected children.~~ **STRUCK -
  unjudgeable as written** _(wake 20)_ - never measured. It has no form this
  loop can score. Automatic reordering is rejected by objective gate 3 *by
  construction*: `sourceOrderViolations()` walks `c.children` in IR order and
  counts every pair whose placement is not monotone, so a candidate that
  reorders a `col` scores one violation per moved child and never reaches a
  judge. The opt-in form dodges the gate but is an authored attribute the frozen
  corpus cannot exercise - the exact wall B4 hit at wake 15, where the authored
  half had to be split off and only the automatic half (B4a) was measurable.
  Reviving it needs a *decision*, not a wake: either the project relaxes the
  source-order gate (it currently encodes "source order is sacred", which is the
  premise A0 and the corpus were both built on), or the corpus gains a file that
  opts in - and corpus changes are their own hypothesis. The underlying evidence
  is real and survives as **B19**, which realigns *positions* without touching
  child order.
- [x] ~~**B6** Spacing as a function of edge density rather than the constant
  40.~~ **REVERTED** _(wake 20)_ - 1 candidate / 3 champion / 2 structural ties.
  All five gates passed; the judges did not. The heuristic has the sign right
  and the granularity wrong: gap is a **container-level** knob, so density
  measured per container is spent on *every* sibling pair, including the pairs
  with no edge between them. On `sparse-graph` that inverted the diagram's own
  grouping signal - connected pairs ended further apart than unconnected
  neighbours. A per-container scalar cannot express a per-pair property, so do
  not spend a wake retuning the cap or the curve; a spacing hypothesis motivated
  by edges has to act on the pair. The one win (`long-labels`) was B9's sticky
  overflow being masked by slack, not this hypothesis working. Ledger entry in
  `docs/layout-hypotheses.md`.
- [x] ~~**B7** Aspect-ratio targeting for the doc root: currently defaulting to
  `col` makes tall skinny documents (1198 × 2940). Try wrapping top-level
  children into a grid that targets ~16:9.~~ **REJECTED AT GATE 5** _(wake 21)_
  - built, measured, and thrown out before a judge was spent. `sequence` goes
  from 0 arrow paths crossing a non-endpoint shape to 3, so gate 5 rejects it;
  the other four gates passed comfortably (worst area ratio 1.28x, no new
  overlap, no source-order violation, `npm run check` green). The mechanism, not
  the tuning: wrapping a *chain* into a row-major grid leaves every row boundary
  spanned by a right-end-to-left-start diagonal across the whole canvas, and no
  choice of `cols` removes them. The grid wrap optimises the bounding box and is
  indifferent to which children the edges connect. Survives as **B20** and
  **B21**. Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B20** _(successor to B7)_ Gate the doc-root aspect wrap on
  **topology**: apply it when the top-level children form a fan or carry no
  edges at all, skip it when they form a chain (each child having at most one
  in- and one out-edge, covering most of the container).~~ **KEPT** _(wake 22)_
  - 2 candidate / 0 champion / 4 structural ties, all five objective gates
  passed, and the first hypothesis kept since B1 at wake 12. The prediction held
  exactly: `sequence` is byte-identical to the champion (the gate skips it),
  `long-labels` and `wide-fanout` wrap. Ships as an exported
  `formsChain(childIds, edges)` over `collectAutoEdges`' direct-child-resolved
  edges, plus B7's `bestGridCols` rebuilt unchanged. The finding is that **a
  layout rule may consult edge topology to decide whether to apply itself** -
  B7's wrap was not mistuned, it was blind. Two confounds recorded in the ledger
  and not to be leaned on: the `long-labels` win was decided on note legibility
  (B9's defect, given room rather than fixed), and `wide-fanout` still draws
  eighteen unrouted chords. Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B21** _(successor to B7)_ Serpentine (boustrophedon) row direction for a
  wrapped grid, so a chain's wrap-back edge becomes a short vertical hop instead
  of a full-width diagonal.~~ **RESOLVED** _(wake 24)_ - B21a built and kept,
  B21b measured and rejected at gate 5. Both halves below.
  **Two units of work, do them in this order:** first
  teach `sourceOrderViolations` in `tools/layout-report.mts` that a serpentine
  grid's odd rows run right-to-left, because gate 3 rejects it by construction
  otherwise; only then flip the placement. Do not attempt both in one wake.
  - [x] **B21a — the tooling half.** _(wake 23)_ Done, and it is deliberately a
    **no-op on today's corpus**: all six reports are byte-identical to the
    baseline, because every corpus grid is row-major and scores 0 either way.
    `sourceOrderViolations` now routes `mode === "grid"` through a new
    `gridOrderViolations(children, serpentine)` and returns the **minimum** of
    the row-major and serpentine counts. The helper walks consecutive children
    in source order, starts a new row whenever `y` changes (counting a violation
    if `y` went *up*), and inside a row expects `x` to increase, except on odd
    rows when `serpentine` is true. `row`/`col`/`auto`/`free` are untouched.
    Three tests in `tests/tools/layout-report.test.ts` pin it: row-major grid 0,
    serpentine grid 0, and a grid that fits neither reading order (`x` = 0, 200,
    100, 300 in one row) still above 0 - that last one is the load-bearing test,
    since the risk of this change is defanging gate 3 into always returning 0.
    `npm run check` green, 299 tests (up from 296).
    **The honest cost, for whoever runs B21b:** `min` does not *detect* which
    reading order the layout used, it scores under both and keeps the kinder
    number. Geometry alone cannot tell the two apart, and the report has no
    serpentine flag to read. So gate 3 is now genuinely weaker for grids: a
    scrambled grid that happens to look serpentine on some rows scores lower
    than it did yesterday. Judged worth it - the alternative is that B21b is
    unmeasurable - but if a future grid hypothesis passes gate 3 narrowly,
    re-derive the count by hand before trusting it.
  - [x] ~~**B21b — flip the placement.** `gridPositions` in
    `src/domain/layout/stack.ts` places row-major; make odd rows run
    right-to-left.~~ **REJECTED AT GATE 5** _(wake 24)_ - `wide-fanout` goes
    36 → 43 arrow paths crossing a non-endpoint shape, so no judge was spent.
    Gates 1-4 all passed and canvas was byte-identical on all six files.
    Wake 23's warning was the right one and the answer is worse than it looked:
    `sequence` is untouched (byte-identical, recorded as *not* evidence), and so
    are `deep-nesting`, `hexagonal` and `sparse-graph`. Only `wide-fanout` and
    `long-labels` could see the change, and **neither is a chain** - B20's gate
    admits a container to the wrap precisely when it is *not* a chain, so the
    auto-wrap and serpentine are aimed at structurally disjoint inputs. In a fan
    there is no wrap-back edge to shorten, only spokes to lengthen (total edge
    length +18% on `wide-fanout`, +39% on `long-labels`). Reviving this needs
    B20's gate reopened, which the corpus has no file to justify. Ledger entry
    in `docs/layout-hypotheses.md`.

- [x] ~~**B8** Frame title width participates in frame sizing. Frame `name` is
  never measured, so long titles overflow.~~ **STRUCK - measured no-op**
  _(wake 25)_ - the premise was measured before anything was built, and it is
  false on the frozen corpus. New tool `tools/text-metrics.mts` reads the real
  `getBoundingClientRect()` of every rendered label out of headless chromium at
  an asserted zoom 1, so the numbers are canvas units. The widest title/frame
  ratio anywhere in the corpus is **0.61** (`driving-adapters`, a 92.3px title
  in a 152px frame); `deep-nesting`'s four frames sit at 0.08-0.11. A width
  floor cannot bind, so the candidate would be byte-identical on all six files
  and no judge was spent. Rendered frame labels run **5.4-6.8 px/char** at 14px
  tall; the repo's only text constant (`AVG_CHAR_PX = 9`) is calibrated for the
  much larger box-label font and still would not bind (16 x 9 = 144 < 152), so
  there is no defensible estimator that makes B8 do anything here. Revive only
  if the corpus gains a frame whose title outruns its content - a corpus change,
  which is its own hypothesis. The measurement's real finding is vertical and
  survives as **B22**/**B23**. Ledger entry in `docs/layout-hypotheses.md`.
- [x] ~~**B9** Note sizing: notes reserve a fixed 200×80 in layout but tldraw
  resizes stickies to fit, so reserved space and rendered space disagree.~~
  **KEPT** _(wake 28)_ - premise measured first and it was understated: tldraw
  draws a sticky 200 wide with a 168px text column, and both corpus notes render
  **564px** of text into the 80px layout reserved for them, ink running from
  `y 318` to `y 882` straight through four box labels while the report says
  `overlapping shape pairs: 0`. `estimatedNoteSize(text)` now returns
  `200 x max(200, lines * 30 + 32)` over a naive wrap, and `emitNote` passes the
  reserved height on as `growY` so the drawn sticky matches. One voting file
  (`long-labels`; the other five have no notes and are byte-identical), judge
  chose the candidate. Gate 4 passed on rendered extents and failed on reported
  ones - see the ledger entry, and the discovered-work item it filed.
- [x] ~~**B24** _(restored from the revert pile, wake 26)_ Re-apply
  `docs/patches/b13-elbow-side-anchors.patch` - elbow arrows and automatic side
  anchors, shipped together - and re-judge under the loosened verdict rule.~~
  **REJECTED AT GATE 5** _(wake 29)_ - no judge spent. Gate 5 did not exist when
  B13 was judged at wake 16; it was built at wake 19, and the restored patch
  dies on it. `wide-fanout` goes 36 -> **45** `arrow paths crossing a
  non-endpoint shape`, and the render corroborates the count: the orthogonal
  router turns the hub's eighteen spokes into vertical trunks that run down the
  inside of six `Worker` boxes, several of them sharing one trunk segment so the
  individual edges stop being separable by eye. Gates 1-4 all passed and every
  rect is byte-identical (this hypothesis does not touch layout). The finding is
  that the effect is **topological and strong in both directions** - `hexagonal`
  5 -> **0** and `deep-nesting` 10 -> 9, against `wide-fanout` 36 -> 45 - which
  is the same container-level signal B20 used to gate the doc-root wrap, not the
  per-edge geometric predicate B15 went looking for. Survives as **B27**.
  Candidate patch refreshed against today's tree as
  `docs/patches/b24-elbow-side-anchors.patch`. Ledger entry in
  `docs/layout-hypotheses.md`.

- [x] ~~**B27** _(successor to B24, wake 29)_ Gate elbow arrows and side anchors on
  **container topology**, the way B20 gates the doc-root wrap. B24 measured a
  clean split: the pair is a strict improvement where the container's children
  form layers or a chain (`hexagonal` 5 -> 0, `deep-nesting` 10 -> 9) and a
  strict regression where they form a fan (`wide-fanout` 36 -> 45). So emit
  `kind: "elbow"` + a derived side anchor for an edge only when the container
  holding both endpoints is not fan-shaped (no child whose out-degree exceeds a
  small threshold), and leave `arc` + centre anchors everywhere else. **This is
  not B15.** B15 gated per edge on whether the *chord* was clear, and failed
  because the router draws an L, not a chord; B27 does not test geometry at all,
  it tests the graph. `formsChain(childIds, edges)` and `collectAutoEdges` from
  B20 already exist and are the obvious starting point - a fan predicate is
  their mirror. Gate 5 measures the result directly; the target is `wide-fanout`
  staying at 36 while `hexagonal` reaches 0. **EPIC** for the same reason B13
  was: elbow and side anchors each lose alone.~~ **KEPT (weak)** _(wake 31)_ -
  the gate works exactly as designed: `wide-fanout` fires it, falls back to
  arc, and its PNG is **byte-identical** to the champion's, so B24's 36 -> 45
  regression is gone while `hexagonal` reaches 0 and `deep-nesting` 9. All five
  objective gates passed. Judged 3 wins / 2 losses over five voting files, so
  keep-by-default applies - but two of the three wins were the judge saying it
  could see no difference and picking by position, and the two losses were on
  precisely the two files gate 5 says improved. Recorded as **weak**; the two
  instruments that were meant to settle it are both suspect, filed as B28 and
  B29. Ledger entry in `docs/layout-hypotheses.md`.
  **REVERTED at wake 34 by B30.** Both suspect instruments were fixed (B28,
  B29) and the re-trial killed it: against real rendered vertices B27 takes
  `hexagonal` 5 -> **9**, not 5 -> 0, and moves no other file, so its whole
  measured effect is a regression and it fails gate 5. The re-run blind A/B
  scored it 2 wins / 1 loss / 2 judged ties, but its wins are on files where
  gate 5 is identical and its loss is on the one file gate 5 can see - the
  blind judge picked pre-B27 there for exactly the defect gate 5 counts.
  Gates run before the judge. Successor is **B31**.

- [x] ~~**B28** _(from B27, wake 31)_ **Validate gate 5's arrow tracer against a
  real render.** `layoutReport` traces each arrow from its binding records and,
  for `kind: "elbow"`, walks the L-legs it believes tldraw will draw. Nothing
  has ever checked that belief. B27 produced a direct contradiction: gate 5
  scored `hexagonal` 5 -> 0 and `deep-nesting` 10 -> 9 while the judge, looking
  at the PNGs of those same files, saw arrows piercing boxes. Either the tracer
  or the render is wrong, and the protocol already says the render wins. This
  is a **tooling wake, not an A/B**: pick one corpus file, extract the arrow
  paths tldraw actually drew (the viewer has the editor; `getShapePageGeometry`
  or the rendered SVG path is the ground truth), diff them against the tracer's
  legs, and fix the tracer. Until this lands, treat every gate-5 number on an
  elbow candidate as unverified - including B24's wake-29 rejection, which was
  a pure gate-5 call with no judge, and B27's own keep.~~ **BUILT** _(wake 32)_
  - the tracer matched **0 of 84** corpus arrows and reported `hexagonal` as a
  clean file (0 crossings) where the render has **9**. Deleted rather than
  fixed; `tools/arrow-truth.mts` reads the real vertices and is now gate 5's
  only instrument. Corrected champion baseline: deep-nesting 10, hexagonal 9,
  long-labels 1, sequence 0, sparse-graph 0, wide-fanout 36. Full entry in
  `docs/layout-hypotheses.md`.

- [x] ~~**B30** _(from B28, wake 32)_ **Re-judge B27 against the corrected gate
  5.** B27 (elbow + side anchors gated on container topology) was kept 3-2 and
  flagged weak. Its quantitative case was `hexagonal` 5 -> 0 and `deep-nesting`
  10 -> 9 on gate 5; wake 32 established those numbers came from a tracer that
  matches no real arrow, and that the real champion sits at 9 and 10. So B27's
  keep now rests on a 3-2 judge vote in which two of three wins were "A wins by
  default" and both losses were on the two files it claimed to improve. Treat
  the current champion as the candidate and pre-B27 as the alternative: rebuild
  the pre-B27 arc-and-centre-anchor emit, run **gate 5 on real vertices** for
  both, and run a fresh randomised blind A/B. If pre-B27 wins, revert B27. This
  is a full A/B and needs its own gates and judge - do not shortcut it into a
  bare revert.~~ **DONE - B27 REVERTED** _(wake 34)_ - the candidate (B27 live)
  fails gate 5: `hexagonal` 9 against pre-B27's 5, every other file identical,
  so its only measured effect is a regression. Judge, run anyway and blind,
  came back 2 wins / 1 loss / 2 judged ties for the candidate over five voting
  files (`wide-fanout` byte-identical, structural tie) - the first wake where
  the gate and the judge disagreed. The gate wins, because B27 never passed a
  real gate 5 in the first place, because the judge's one loss is on the one
  file the gate can see and cites the same defect, and because both its wins
  are on files where the crossing count does not move. Successor **B31**.
  Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B31** _(from B30, wake 34)_ **Gate elbow arrows on measured clearance,
  not on degree.** An edge gets elbow + side anchors only when the axis-aligned
  band between the two endpoint rects contains no third shape, measured on the
  layout rects. Not B15, which tested the centre-to-centre chord; test the L's
  own corridor. Target: `hexagonal` must not rise above 5 while `deep-nesting`
  and `long-labels` keep the elbows the judge preferred.~~ **REVERTED**
  _(wake 36)_ - 0 wins, 2 losses, 4 judged ties, and it **closes the arrow
  attachment line for good**. The predicate worked exactly as specified: it is
  the first arrow hypothesis ever to clear gate 5 outright, holding `hexagonal`
  at 5 and moving no file's crossing count at all. That flatness is the finding.
  Clearance-gating fires only where the corridor is already empty - and an edge
  with an empty corridor was never crossing anything - so it switches elbow on
  precisely where it buys nothing and off precisely where a crossing needs
  fixing. What is left is pure cost, and the judge named it on the two files
  B30 said elbows helped: `deep-nesting`'s short hops collapse to
  *"tiny directionless nubs"*, and `long-labels` gets *"a needless dogleg kink"*
  on lines that were already straight. Eight attachment hypotheses (B3, B4a,
  B13, B14, B15, B24, B27, B31) are now reverted or rejected. **File no more.**
  Ledger entry in `docs/layout-hypotheses.md`.

- [x] ~~**B29** _(from B27, wake 31)_ **Let the judge return a tie.** Step 5 tells
  the judge not to hedge, so a visually indistinguishable pair is decided by
  position rather than by content - two of B27's three wins were literally "A
  wins by default". Under keep-by-default that converts no-information cases
  into candidate votes whenever the randomiser puts the candidate at A more
  often, which is what happened at wake 31 (4 of 5). Amend the protocol: allow
  `WINNER: TIE`, exclude ties from both the win and the loss count, and record
  them in the ledger table as ties. A candidate whose every voting file comes
  back a tie is still a KEEP under step 6's "no voting files at all" clause, so
  this does not re-introduce the revert-everything failure mode - it only stops
  counting coin flips as evidence. **Also a protocol change, not an A/B.**~~
  **DONE** _(wake 33)_ - steps 5 and 6 amended in place; the prompt wording the
  judge must be given is fixed in step 5, and judged ties are now distinct from
  structural ties in the ledger. Taken ahead of B30 because B30 is an arrow A/B
  with a judge and the Status block required this to land first. Ledger entry in
  `docs/layout-hypotheses.md`.

- [x] ~~**B25** _(new, wake 26)_ Routing lanes in **placement**. Every arrow
  hypothesis so far (B3, B4a, B13, B14, B15) changed how arrows *attach*; none
  changed where boxes *sit*. Layout still packs children at a flat 40px gap, so
  an orthogonal arrow has no corridor and must cross a box - the champion
  carries **52** `arrow paths crossing a non-endpoint shape` across the corpus,
  36 of them in `wide-fanout` alone. tldraw cannot accept a computed route (an
  arrow is two endpoints plus one scalar; see `docs/jsx-pivot.md`), so placement
  is the only lever left. When a container's children carry an edge that skips a
  neighbour, widen the gap on the axis that edge must traverse. Gate 5 measures
  the result directly. **EPIC.**~~ **KEPT** _(wake 37)_ - landed as the row axis
  only, in grid containers only: `hasSkipEdge` on flow-position distance gates
  `rowGap = gap * 2`. A measured sweep decided the axis - row ×2 costs 1.35×
  canvas and passes gate 4, uniform ×2 costs 1.62× and fails it - and the
  column axis was left alone because a skip chord in a `row`/`col` runs through
  the intervening centres however wide the gap. First hypothesis ever to lower
  gate 5: `wide-fanout` 36 → 31, two blind wins, no losses. Ledger entry in
  `docs/layout-hypotheses.md`.

- [ ] **B32** _(successor to B25, wake 37)_ Scale the skip widening with the
  *size* of the skip instead of a flat ×2. B25 established that a corridor
  between grid rows is worth real canvas, but its factor is a constant chosen
  by one measurement on one file: `wide-fanout`'s hub reaches 18 flow positions
  away and `long-labels`' furthest skip reaches 6, and both get the same
  doubling. Derive the factor from the maximum skip distance (or from the count
  of skip edges crossing each row boundary), so a dense fan gets more corridor
  and a single long-range edge gets less. **Gate 4 is the whole difficulty**:
  uniform ×3 already fails it on `wide-fanout` at 1.70×, so any per-file
  scaling must spend the budget on the axis the file is not already long in.
  Measure the premise first - if the corpus's skip distances are bimodal
  (a hub or nothing) there is no gradient to exploit and this strikes like B8.

- [ ] **B10** `elk.layered.considerModelOrder.strategy` for containers that do
  opt into `layout="auto"`, so even ELK respects source order as a tie-break.
- [x] ~~**B12** Retry B3 (default arrow `kind: "elbow"`) *after* B4 lands.
  Strictly gated on B4: elbow routing only stops drawing through boxes once
  terminals bind to sides instead of centres. Do not retry it before then -
  wake 14 already measured that outcome.~~ **SUPERSEDED by B13** _(wake 15)_ -
  the gate was real but not directional. B4a measured the other half and it
  loses on its own too, for the mirror-image reason. Sequencing them cannot
  work; they have to ship together.
- [ ] **B19** _(successor to the struck B5)_ Cross-container **alignment**
  without reordering: when two sibling containers are connected child-to-child,
  keep both children lists in source order and instead shift the shorter
  container's flow origin (or pad its cross axis) so the connected pairs line
  up. Evidence is B5's, unchanged: 7 ports against 6 adapters gives every
  port->adapter arrow a constant 72px up-left slope, which is a *position*
  defect, not an ordering one. Passes the source-order gate by construction
  because no child moves relative to its siblings. Watch the canvas-area gate:
  padding one container to match another grows the parent.

- [ ] **B22** _(from B8's measurement, wake 25)_ Reclaim the frame's unused
  interior title band. `FRAME_PAD_TOP = FRAME_TITLE_PX (32) + FRAME_PAD_INNER`
  reserves 32px of title chrome *inside* every frame, and
  `src/domain/ports/layout.fake.ts:11` states the assumption out loud - "so
  chrome never overlaps". It is wrong: tldraw draws the frame label **outside**,
  in the band `[top-23, top-9]`, and draws nothing inside. So every frame is
  32px taller than it needs to be and its first child row sits 32px below where
  `pad` asked. Drop `FRAME_TITLE_PX` from `padTop` and judge. Changes all six
  corpus files, and compounds four levels deep on `deep-nesting`. Do this before
  B23 - it is the half the corpus can actually see.

- [ ] **B23** _(from B8's measurement, wake 25)_ Reserve the frame title's
  *exterior* band. The label occupies 23px above the frame's top edge and is
  14px tall, and nothing in layout reserves it, so a frame placed under a
  sibling can have its title drawn on top of that sibling. On `deep-nesting`
  this already near-misses three times: `l2`'s band `185-199` against
  `l1-config` ending at 192, `l3`'s `385-399` against `l2-metrics` ending at
  394, `l4`'s `577-591` against `l3-validator` ending at 588 - saved only
  because titles are left-aligned at the frame's left edge while children are
  centred (`l2`'s title spans `x 24-66`, `l1-config` starts at `x 220`).
  Objective gate 2 is blind to it: a title is not a shape, so it contributes no
  overlapping shape pair. Note the risk that this is unjudgeable for the same
  reason B8 was - the corpus near-misses but never collides, so the change may
  be a no-op on the render. Measure the collision count first, before building.

- [ ] **B11** Wrap box labels at a width derived from the document's target
  aspect ratio instead of a constant. B2 showed wrapping itself is not the
  problem - a fixed 320px cap is. Pick the cap so the resulting canvas moves
  *toward* ~16:9, not past it. Overlapped B7, which was rejected at gate 5; the
  overlap now transfers to B20, so do B20 first if it lands and this reduces to
  choosing the cap from the width B20 already wants.

- [ ] **B26** _(from B9's measurement, wake 28)_ Calibrate `AVG_CHAR_PX` against
  a real browser. B9 established that a layout dimension may be measured rather
  than guessed, and `estimatedBoxSize`'s flat 9px per character is now the last
  estimator in the repo with no measured basis. `tools/text-metrics.mts` already
  prints `labelW` beside `shapeW` for every box, so the calibration is a
  reading, not a hypothesis - but changing the constant moves every box in every
  corpus file, so run it through the full protocol. **Measure the premise before
  building** (B8's lesson): if the current constant already sits within a few
  percent of the measured width, this strikes like B8 did. The champion's
  `long-labels` numbers suggest boxes over-reserve by a flat 32px of padding
  rather than by a per-character error, which would make the real finding
  `BOX_PAD_X`, not `AVG_CHAR_PX`.

  _(wake 30)_ The epoch PNG gives this a rendered symptom to aim at, not just a
  number: in `hexagonal`, `Use cases` and `Entities + rules` are drawn touching,
  because both labels wrap to two lines and tldraw grows each box past the 60px
  the layout reserved, eating the 12px gap between them. The report calls the
  file clean. Whatever B26 changes, that pair separating in the render is the
  test of it.

---

## Blocked notes

_(Wakes append here when a task cannot proceed. Never delete entries.)_

- **(wake 2, A1)** `Group` could not be built. A1 lists it as a component but
  also fixes `ast.ts` as unchangeable, and `ast.ts` has no `group` node kind
  (`ALLOWED_ELEMENT_NAMES` is `doc, frame, box, note, edge`). Aliasing it to
  `Frame` would be silently wrong — ADR-4 exists precisely to keep groups from
  collapsing into frames. Shipped the other five components and left `Group`
  out. Resolving it needs a decision that is out of A1's scope: either add a
  `group` kind to `ast.ts` + `lower.ts` (its own task), or drop `<group>` from
  the language. `docs/jsx-pivot.md` assumes it survives ("Still open: whether
  ADR-4's `<group>` rejects visual props stays a runtime check"), so the likely
  answer is the former. A10 must not document `Group` until it exists.

---

## Discovered work

_(Wakes append follow-ups here rather than doing them inline. `bd create` for
anything that outlives the loop.)_

- **(wake 1)** `StubLayout` (`domain/ports/layout.fake.ts`) still carries its own
  independent flow logic — left-to-right rows, ignores `layout`/`gap`/`pad`. It
  is now the only placement code that disagrees with `hybridLayout`. Collapsing
  it onto `hybridLayout` with a trivial placer would delete ~110 lines, but it
  would move every geometry assertion in the tests that use it, so it was left
  alone. Revisit after A7.
- **(wake 1)** `free` mode semantics were undefined and had to be picked: no flow
  placement at all, each unpinned child falling back to the container's padding
  origin. A10 should write that down in `dsl.md`.
- **(wake 1)** `auto` containers now get a *flat* ELK graph, so ELK no longer sees
  cross-hierarchy topology (`hierarchyHandling=INCLUDE_CHILDREN` is gone with the
  nested graph). Edges are resolved to the owning direct child instead. Phase B
  should watch whether cross-frame edge routing regressed; this also narrows
  B10's scope.
- **(wake 2)** TS's automatic-runtime JSX typing falls back to the *global* `JSX`
  namespace from `@types/react` unless the `jsxImportSource` module exports its
  own. `jsx-runtime.ts` therefore exports a minimal `namespace JSX` (with an
  `eslint-disable` for `no-namespace`). Consequence: a JSX expression's static
  type is always the namespace's declared `Element` union, never the specific
  component's return type, so `runtime.test.tsx` needs an `as AstDoc` cast. Only
  affects our own TS callers; `.tldsl.jsx` files are untyped by decision 6.
- **(wake 2)** `runtime.test.tsx` asserts hardcoded source line numbers (49–56)
  to prove the `jsxDEV` span plumbing. Editing anything above `buildTree()` in
  that file breaks it. Left as-is because it is the only thing that actually
  pins decision 7; if it turns into a nuisance, assert relative offsets from a
  captured base line instead.
- **(wake 2)** `Fragment` is exported from both runtime modules (esbuild imports
  it for `<>…</>`) and returns a bare array. Nothing rejects a fragment in a
  position that wants a single node yet — `lower.ts` will see an array where it
  expects an `AstNode`. Worth a check in A5.
- **(wake 3)** `ExecuteResult`'s success arm is `{ ast }` only, per A2's wording.
  A3 must return `metafile.inputs` alongside it and A6 feeds that to the
  watcher, so A3 widens the success arm (`{ ast; inputs: string[] }`) and adds
  a fifth contract scenario asserting `inputs` contains the entry plus every
  transitively imported file. Doing it in A2 would have been a field no adapter
  could populate yet.
- **(wake 3)** The `ExecutePort` contract has no scenario for a source that
  fails to *compile* (bad JS syntax), only one that throws at run time. A3 has
  to decide whether an esbuild build error is `runtime/threw` or its own code;
  jsx-pivot decision 7 only discusses thrown exceptions. Pick a code in A3 and
  add the scenario there.

- **(wake 1)** `dump-tmp.mts` lost its `--stack` flag (the `stackLayout` export it
  called no longer exists). It still dumps geometry via `ElkLayoutAdapter`, which
  is what the A0 acceptance check needed. A9 deletes it anyway.

- **(wake 4)** `mappedSpan()` always reports `span.file = path`, discarding the
  sourcemap entry's `originalSource`. For a throw inside an *imported* component
  file that is a wrong file with a right-for-the-other-file line. It is that way
  because the contract asserts `span.file === h.path` and esbuild's sourcemap
  `sources` are relative to the outfile dir, so honouring `originalSource`
  needs a resolution rule and a contract change. Revisit in A4 when multi-file
  diagrams become normal.
- **(wake 4)** `jsxDEV`'s `source.fileName` is relative to `absWorkingDir`
  (= the entry's own directory), so an AST span from `<Doc>` carries a bare
  basename while the adapter's own diagnostics carry absolute paths. Two span
  shapes in one pipeline; `contracts/diagnostic.ts` documents `SourceSpan.file`
  as relative to the watch root, which is a third. A4 has to pick one and
  normalise at the boundary.
- **(wake 4)** `packages: "external"` leaves a bare `require()` in the bundle
  for any real npm package a diagram imports, resolved in the worker from
  `Module._nodeModulePaths(dirname(entry))`. Nothing tests it. Also untested:
  what a `.tldsl.jsx` that imports `react` does (decision 1 wants it to fail
  loudly).
- **(wake 4)** esbuild reports *all* build errors, and the adapter maps every
  one to its own `runtime/compile` diagnostic. That partly walks back decision
  7's "syntax errors report one at a time" regression - for build errors the
  agent still sees the whole batch. Only *thrown* errors are one-at-a-time.
  Worth saying in A10's docs rewrite.

- **(wake 5, A4)** `CompileFileResult` deliberately drops the `inputs` array
  the `ExecutePort` success arm carries - nothing consumes it yet. **A6 owns
  widening it** (`{ sceneJson; diagnostics; inputs }`) and feeding it to the
  watcher; the data is already there, it is thrown away in one place in
  `compileFile`.
- **(wake 5, A4)** Two different extension gates now exist by design and could
  drift: `compileFile` dispatches on a bare `.jsx` suffix (so a hypothetical
  `foo.jsx` passed to it directly would take the JSX front end), while
  `cli/check.ts` gates on `.tldsl.jsx` specifically, which is what keeps the
  PostToolUse hook from firing on every React component in a repo. A8 touches
  the hook matcher - keep the two consistent then, or collapse them onto one
  shared predicate.
- **(wake 5, A4)** The new adapter test for relative entry paths has to
  `mkdtemp` **inside `process.cwd()`** (a cwd-relative path is the whole point
  of the test), so a crash between `mkdtemp` and its `finally` leaves a
  `tldsl-execute-jsx-relative-*` directory in the repo root. Untracked and
  harmless, but it is why `git add .` stays banned.
- **(wake 6, A5)** `ir/unknown-prop`'s span is only as precise as the front
  end allows. From the text parser it points at the attribute *name*; from
  JSX it points at the **element**, because `jsxDEV` hands the runtime one
  `source` per element and `propsToAttrs` copies it into both `span` and
  `nameSpan`. Two unknown props on one `<Box>` therefore report the same
  line:column twice. Acceptable (the message names the prop), but if it ever
  matters, the only fix is column-scanning the source line for the prop name
  in `components.ts` - esbuild does not emit per-attribute positions.
- **(wake 6, A5)** Wake 2's Fragment note is still open and A5 did **not**
  close it: `<>…</>` returns a bare array, and `lower()` is typed on `AstNode`.
  An array reaching `lower()` hits the `ast.kind !== "doc"` branch and reports
  `ir/root-not-doc` with `<undefined>` in the message and no usable span. It
  is a wrong-but-not-silent failure, so it was left alone rather than widened
  into A5's scope. The right place is `flattenNodes`/`Doc` in
  `src/runtime/components.ts`, not `lower.ts`.
- **(wake 6, A5)** `docs/dsl.md` now documents six edge/frame attributes the
  IR actively rejects (`type`, `route`, `head-start`, `head-end`, `bg`,
  `border`). **A10 owns reconciling that** - either mark them clearly as
  phase 1 and unimplemented, or delete them from the doc. Leaving the doc as
  it stands is a trap: an LLM reading `dsl.md` will write `type="bi"` and get
  an error.

- **(wake 7, A6)** `CompileFileResult.inputs` is `null` on the JSX
  `{ diagnostics }` arm even when esbuild built the bundle fine and it was
  *user code* that threw — in that case the input set is actually known, the
  port just does not carry it. Consequence: an edit that both adds a new
  import and throws will not widen the watch set until the file compiles
  clean once. Fix is to widen `ExecuteResult`'s diagnostics arm with an
  optional `inputs`, plus a contract scenario. Left alone because it needs
  another `ExecutePort` contract change and the failure mode is benign (the
  entry is always watched, so fixing the throw always retriggers).
- **(wake 7, A6)** `inputs` includes the bundled runtime itself
  (`src/runtime/*.ts` under tsx/vitest, `dist/runtime/*.js` from a build), so
  `tldsl serve` on any `.tldsl.jsx` also watches the tldsl source tree. Real
  but harmless — in a shipped CLI those live in `dist/` and nobody edits them.
  If it ever matters, filter inputs to files under the entry's directory in
  `compileFile`.
- **(wake 7, A6)** `chokidar-watch.ts`'s `update()` uses `next.includes(p)` in
  a loop — O(n²) over the input set. Module graphs are tens of files, so it
  will never matter; noted only so nobody "discovers" it as a bug.

- **(wake 5, A4)** `tests/e2e/fixtures/check-jsx-broken.tldsl.diagnostics.txt`
  asserts the message `Error: boom`, which comes from the first line of V8's
  `Error.prototype.stack`. Stable on Node 20-25, but it is a V8 format
  dependency in a golden file - if it ever goes flaky across Node versions,
  assert the code and span and drop the message text.

- **(wake 8, A7)** A prop named `key` on a tldsl element is **silently
  discarded**. `jsxDEV`'s signature takes `key` as argument 3, so it never
  reaches `props` and A5's `ir/unknown-prop` net cannot see it — the one prop
  name in the language that fails without a diagnostic. Two subagents reached
  for `key={...}` on `.map()` output out of React habit; it was stripped from
  the corpus before freezing. Either `jsx-dev-runtime.ts` should reject a
  non-`undefined` `key`, or A10 must document that `key` is meaningless here.
- **(wake 8, A7)** `flow(...)` edges carry no `id`, so the four runs collapsed
  onto it in `scratch.tldsl.jsx` lost their original ids (`ae-1..ae-4`,
  `ae-6..ae-8`, `pe-1..pe-5`, `pe-9..pe-13`) in favour of generated ones. No
  test referenced them, but it means `flow()` and explicit `<Edge id=...>` are
  not interchangeable if anything ever addresses an edge by id.
- **(wake 8, A7)** `tests/corpus/` is **neither typechecked nor linted** —
  `allowJs` is off so `tsc` skips `.jsx`, and `npm run lint` only runs over
  `src`. `corpus.test.ts` compiling each file at runtime is the only thing
  standing between a typo and a silently rotten bench. Adequate, but it is the
  reason that test asserts a minimum fixture count rather than trusting the
  glob.
- **(wake 8, A7)** **A8's delete list**, gathered while porting: `auth.tldsl`,
  `check-good.tldsl`, `check-broken.tldsl` + `check-broken.diagnostics.txt`,
  `check-good.diagnostics.txt`, the parity `describe` in
  `auth-fixture.test.ts`, and that file's *first* `describe` too — it calls
  `parse()` directly and dies with the text parser. `check-not-tldsl.txt`
  stays; it is the skip case.

- **(wake 9, A8)** `watchAndServe` still has a defensive branch for
  `sceneJson === null` with **no** diagnostics, and it is now unreachable and
  untested: the only front end left always returns a non-null `AstNode` on
  success, and `lower()` never returns a null IR without emitting a
  diagnostic. Its test was deleted. Either delete the branch or leave it as
  belt-and-braces, but it is dead code as of this wake.
- **(wake 9, A8)** `ast.fixture.ts`'s spans are synthetic — every element sits
  at line 1 column 1 and attribute *i* at column *i+2*. Any future diagnostic
  whose value depends on real source geometry (a length, a multi-line span, a
  column that must match the text) cannot be pinned in a `domain/` unit test
  any more; it has to move up to an e2e test that runs the real JSX front end.
  The `ir/unknown-prop` test lost its `length: 5` assertion this way.
- **(wake 9, A8)** `docs/dsl.md` still documents the deleted text grammar in
  full, and `domain/parser/ast.ts`'s header says unknown elements are
  "rejected at parse time" when the rejection now lives in
  `runtime/components.ts`. **A10 owns both.** `docs/architecture.md`'s
  PostToolUse snippet needs no change — it matches `Write|Edit` and lets
  `runCheck` filter.
- **(wake 9, A8)** The directory `src/domain/parser/` now holds only `ast.ts`,
  `index.ts` and `ast.fixture.ts`. The name is a lie — nothing parses. Worth
  renaming to `domain/ast/` at some point, but it touches ~20 import sites and
  `CONTEXT.md`, so it was not done inside A8.

- **(wake 10, A9)** The first thing the new tool showed: **`wide-fanout` is not
  wide.** Its canvas is **138 x 2560** (aspect 0.05), a single 26-element
  column, because a `<doc>` with no `layout` defaults to `col` and the fixture
  never overrides it. `sequence` is 282 x 1360. Half the corpus is a thin
  vertical ribbon. That is a genuine layout-quality finding and a strong
  Phase B hypothesis (auto-flow a container whose child count would make it
  absurdly tall), **not** a corpus bug: do not "fix" the fixtures.
- **(wake 10, A9)** The report's ASCII render is the judge's only view of the
  diagram, so its size directly bounds Phase B's prompt cost. Two reports per
  judge call at ~100 lines each is the budget the 60-row cap was chosen for.
  If a future hypothesis makes diagrams much taller, the cap - not the corpus -
  is what absorbs it.
- **(wake 10, A9)** `tools/` is typechecked but **not** linted: `npm run lint`
  and `npm run lint:deps` both scan `src` only. The tool imports across every
  layer (`domain/`, `infra/`, `cli/`) with nothing enforcing direction. That is
  fine for a diagnostic script, but nothing stops it rotting into a second,
  unpoliced entry point. Keep it a single file.
- **(wake 10, A9)** The frame-boundary-crossing metric skips a frame that is an
  endpoint of the edge, or an ancestor of either endpoint. No corpus file draws
  an edge to a `<frame>` today, so that guard is untested by anything but
  reading. If edges to frames ever appear, re-check it.
- **(wake 11, A10)** **`docs/jsx-pivot.md` decision 11's `ns` example is broken
  as written.** It suggests ``id={`${ns}.login`}``, but `lower.ts`'s
  `validateEndpoint` scans `from`/`to` for a literal `.` *before* resolving the
  id and treats any match as dotted-anchor syntax. Verified by running it: a
  `<Box id="billing.api">` is legal, but `<Edge from="billing.api" ...>` always
  fails with `ir/anchor-not-supported`. The docs now say hyphen. **This is a
  real constraint on B4** (ship the anchor scheme): resolution needs to
  disambiguate an id containing a dot from `id.anchor` - longest-id-match, or
  move anchors onto a separator that cannot appear in an id.
- **(wake 11, A10)** `.claude/settings.json` has **no `PostToolUse` hook at
  all** - only `PreCompact` and `SessionStart`, both running `bd prime`. ADR-8
  and `docs/architecture.md` both describe a `Write|Edit` → `tldsl check` hook
  that is not actually wired in this repo, so the one-tool-turn feedback loop
  the whole design rests on has never run here. Left alone: A10 was doc-scoped
  and wiring a hook is a behavioural change, not a documentation one.
- **(wake 11, A10)** Two source-comment leftovers, both out of A10's doc scope:
  `src/cli/main.ts`'s `serve` help text still says "watch a .tldsl or
  .tldsl.jsx file" (stale since A8 made `.tldsl` unsupported), and
  `src/domain/parser/ast.ts`'s header still claims unknown elements are
  rejected "at parse time" when that check now lives in
  `runtime/components.ts`'s `invokeComponent`.
- **(wake 11, A10)** A10's list named four docs; three more are now stale and
  were deliberately left alone. `docs/layout-and-edges.md` still teaches the
  `<group>`/`<frame>` split and 13 anchors, `docs/architecture.md` still draws
  the `tokenize → parse` data flow and the unwired hook, and
  `docs/roadmap.md`'s phase-1 element list still contains `<import>`/`<use>`.
  `jsx-pivot.md`'s "docs that go stale" section lists `roadmap.md`; A10's
  wording dropped it. Worth one cleanup task, not a Phase B hypothesis.
- **(wake 11, A10)** B1's evidence cites `scratch.tldsl` (now
  `scratch.tldsl.jsx`) and "`dsl.md` declares `align` and nothing implements
  it" - after A10, `dsl.md` no longer declares `align` at all. The measurement
  behind B1 still stands; only the citations are stale. Do not treat the
  rewritten `dsl.md` as evidence that `align` was considered and dropped.

- **(wake 12, B1)** `sparse-graph.tldsl.jsx` produced a **byte-identical**
  report under both variants - no container in it has children of differing
  cross-axis size. One sixth of the bench is blind to any cross-axis
  hypothesis, and a judge handed two identical reports will still pick one,
  injecting a coin flip into a strict-majority rule. It was recorded as a
  structural tie instead. Future wakes: diff the reports first and only judge
  the files that actually differ. Do **not** "fix" the fixture.
- **(wake 12, B1)** `align` is applied to `row` and `col` only. `grid` still
  anchors each child at its cell's top-left even when `colWidths`/`rowHeights`
  are ragged, which is the same defect B1 just fixed one dimension up. Cheap
  follow-up hypothesis; kept out of B1 because the cross axis of a grid is
  ambiguous (per-cell, two-dimensional) and needed its own decision.
- **(wake 12, B1)** Centring measures the cross extent as `max(child.w)` over
  the flowed children, i.e. the **content** box - so a `<frame>` with an
  explicit `w` wider than its widest child does *not* centre its children in
  the frame. Defensible (the alternative needs a second pass, since the frame's
  own width is only known after its children are placed), but it is a real
  inconsistency: `align="center"` means two different things depending on
  whether `w` is set.
- **(wake 12, B1)** `docs/dsl.md` does not document `align` - A10 deleted the
  stale declaration and B1 shipped the real thing without re-adding it. The
  language now has an attribute no doc mentions. Same for the `ir/bad-align`
  diagnostic code.
- **(wake 12, B1)** All five judges independently reached for the same
  mechanism: centring turns a flow into a *spine*, and edges bound to shape
  centres then run straight along it. Edge geometry, not whitespace, is what
  moved the verdict. That is direct evidence for B4 (bind edges to sides
  instead of centres) - and a warning that B4's own evidence
  ("`usecases` has seven outgoing edges all bound to its centre") was measured
  against the *old* champion. Re-measure before building it.
- **(wake 13)** `tools/layout-report.mts` renders every label as one unwrapped
  line in its ASCII view, so a box whose label wraps shows the text spilling
  past its own border. Any hypothesis that changes text metrics will be judged
  against a render that contradicts its own geometry table. Fix before
  retrying B11.
- **(wake 13)** Five of six corpus files are blind to anything that only
  affects long text - their labels are all short. B2 therefore came down to a
  single judge on a single file, which is a thin basis for a verdict. The
  corpus is frozen and must not be edited to suit a hypothesis, but a corpus
  *expansion* is a legitimate hypothesis of its own (per the Phase B rules) and
  is worth proposing once the text-metrics thread resumes.
- **(wake 13)** The reverted B2 diff is parked in `git stash` as
  `stash@{0}: B2 reverted (wake 13): wrapped box labels, lost blind A/B on
  long-labels`. `git checkout --` is auto-denied by the guardrail hook in this
  environment, so stashing was the only available revert. Drop it whenever
  convenient - the ledger entry records everything it contained.

- **(wake 14)** `screenshot.mts` captures the tldraw **editor chrome** along
  with the diagram: the colour-palette panel pinned top-right occludes whatever
  is under it (in `sparse-graph` it hides most of "Node 19"), and the toolbar
  covers the bottom strip. Judges were told to ignore it, which works but wastes
  a sentence of every judge prompt and still hides real pixels. The viewer
  should render without UI when screenshotting - a `?ui=0` query param the
  viewer reads, or `page.addStyleTag` hiding `.tlui-layout__top`/`__bottom`
  before capture.
- **(wake 14)** `wide-fanout` renders as a 138x2560 single-column stack with all
  24 edges stacked on one vertical spine - two judges independently called it
  degenerate. The geometry report already says so (21100 total edge length, the
  worst in the corpus by 4x) but no gate fires on it. This is the strongest
  evidence yet for **B7** (aspect-ratio targeting on the doc root); consider
  also adding a gate on mean-edge-length-per-canvas-diagonal so a fixture this
  bad cannot pass silently again.
- **(wake 14)** Untracked cruft is sitting in the repo root from a manual
  render session: `demo-render.png`, `demo.tldsl.jsx`, `.playwright-mcp/`.
  Neither the loop nor the build produces them. They want a `.gitignore` entry
  (or deleting), but they are not the loop's to remove.

- **(wake 15, B4a)** The **authored** half of B4 - the `anchor` attribute
  itself (8 compass points + `center` + `@x,y`) - was never built, and it is not
  a Phase B hypothesis: no corpus file uses it, so the blind judge cannot see it
  and the loop cannot decide it. It is a language feature. File it as its own
  task (parser/AST/IR + `docs/dsl.md`) rather than leaving it disguised as a
  layout experiment in the backlog. B13 does not need it - it derives anchors
  automatically - but an author who wants to override the derived side does.

- **(wake 15, B4a)** `sideAnchor()` divides by `rect.w` and `rect.h`. Nothing in
  IR currently guarantees those are non-zero, and a zero-size shape would give
  `Infinity` on both sides of the comparison. It did not bite (no corpus shape is
  degenerate) and the code is reverted, but whoever lands B13 should either
  guard it or pin the invariant where sizes are assigned.

- **(wake 16)** `docs/patches/` is a new directory holding one reverted-but-live
  patch (`b13-elbow-side-anchors.patch`). It exists because B13's code was about
  to be reconstructed from ledger prose for the third time. It is **not** a
  general convention: only save a patch when a reverted hypothesis has a named
  successor in the backlog that extends it directly. Delete the file when B14
  resolves either way.
- **(wake 16)** Every arrow hypothesis so far (B3, B4a, B13) is invisible to all
  four objective gates - the reports come back byte-identical by construction,
  because nothing about arrow routing touches layout. Three wakes have now spent
  the gate step learning nothing. Consider a fifth gate that can see rendered
  arrows (e.g. count edge segments crossing a shape's bounding box in the PNG,
  or emit the arrow paths from tldraw and test those), so a candidate that
  routes through boxes can be rejected before a judge is spent.
- **(wake 16)** `long-labels` renders its two notes overlapping each other and
  the reporting box into unreadable overprinted text, and `wide-fanout` renders
  arrows piercing every box in a degenerate vertical chain. Both were called out
  unprompted by judges as defects *shared* by champion and candidate, i.e. they
  are champion defects nothing has attacked yet. B9 covers the note half; the
  `wide-fanout` chain has no backlog entry.

- **(wake 17)** Five wakes of arrow hypotheses (B3, B4a, B12, B13, B14) have now
  each been judged on gates that are structurally blind to them: an arrow change
  moves no shape, so all four objective gates are tautologies and the verdict
  rests entirely on the judges. Wake 16 already noted this; wake 17 confirms it
  is systematic, not incidental. A fifth gate that can see rendered arrow paths -
  count of arrow segments that cross a shape's rect, extracted from the emitted
  scene plus the layout rects rather than from the PNG - would have rejected B14
  before spending six judge calls, and would have rejected B4a too. Worth one
  wake as tooling work rather than as a hypothesis.
- **(wake 17)** `docs/patches/b13-elbow-side-anchors.patch` is now load-bearing
  for two backlog entries (B15 and, behind it, B16). It applied cleanly against
  wake-17 `HEAD`. It will stop doing so the first time anything else touches
  `emit.ts` or `builders.ts`; whichever wake breaks it should regenerate it
  rather than hand-resolve, and whichever wake resolves B15 should delete it.
- **(wake 17)** Both `long-labels` and `wide-fanout` judges again named
  champion-side defects unprompted: `long-labels` renders its notes overprinted
  into unreadable text (B9 covers it) and `wide-fanout` is a 26-box vertical
  corridor whose 18 hub edges pierce every box in the column no matter which
  side wins. `wide-fanout` still has no backlog entry of its own - the corridor
  shape is a *layout* failure, not an arrow failure, and B7's aspect-ratio
  targeting is the closest existing entry.

- **(wake 18)** `docs/patches/b13-elbow-side-anchors.patch` is now **dead
  weight** and should be deleted. It was kept for B15 and B16; B15 is resolved
  and B16 is struck, so nothing in the backlog needs it. Keeping it invites a
  future wake to resurrect a line of attack that five wakes of evidence have
  closed. Deleting it is a one-line wake, or a hunk in whichever wake next
  touches `docs/`.
- **(wake 18)** The judges twice decided a whole file on **whether tldraw drew
  an arrowhead or a bare dot** at a short edge's target - `deep-nesting` against
  the candidate, `wide-fanout` for it, same mechanism, opposite sign. That means
  the corpus currently has files whose verdict is dominated by a renderer
  artefact at two edges rather than by layout quality, and any hypothesis whose
  visible effect is small enough will be decided by noise of this kind. B18
  attacks the artefact; the deeper issue is that a 1-file margin on this corpus
  is not a reliable signal, and a future wake may want to require a 2-file
  margin for hypotheses whose diff is this localised.
- **(wake 18)** Untracked cruft still sits in the repo root (`.playwright-mcp/`,
  `demo-render.png`, `demo.tldsl.jsx`), first noted at wake 14 and still not
  cleaned. It is now five wakes old. `demo.tldsl.jsx` may be worth keeping as a
  fixture; the other two are byproducts and should be gitignored or removed.

- **(wake 19)** The new gate's champion baseline puts a number on a defect the
  judges have described in prose since wake 16: `wide-fanout` scores **186**
  arrow-path/box crossings against 0-10 for every other corpus file. It is an
  outlier by an order of magnitude, and the cause is layout, not arrows - a
  26-box vertical corridor that no anchor or routing change can rescue. It still
  has no backlog entry of its own; B7 (aspect-ratio targeting) is the nearest
  thing, and a hypothesis aimed squarely at fanning a hub's children into a
  block rather than a column would now have an objective number to move.
- **(wake 19)** The elbow branch of `arrowPath` is unexercised by the corpus -
  everything emits `kind: "arc"` today, so only the direct unit tests cover it.
  Whichever wake next ships elbows should sanity-check the traced route against
  the PNG before trusting the gate's verdict on that candidate, because the
  model is a mid-split approximation of tldraw's router, not the router.
- **(wake 19)** The gate deliberately ignores frames, to stay independent of the
  existing frame-boundary metric. That leaves one blind spot: an arrow that
  tunnels through a *frame's* interior without touching a box is invisible to
  both metrics when the frame is an ancestor of one endpoint. Not worth a wake
  until a hypothesis is plausibly affected by it.

- **(wake 20)** Two of six corpus files are **structurally blind to any
  hypothesis about default spacing**: `deep-nesting` and `hexagonal` set an
  explicit `gap` on every frame and have a single top-level child, so B6's
  candidate produced byte-identical renders and reports for both. They cost
  nothing (no judge is spent on an identical pair) but they do mean a spacing
  hypothesis can win at most 4-0, and two "ties" in the verdict line are not
  evidence of anything. Worth knowing before reading any future spacing result.

- **(wake 20)** `tools/layout-report.mts`'s `canvas:` line may not track an
  `auto` container's real extent. On `sparse-graph` the candidate moved shapes
  40px right (`n4` x 500 → 540, so a right edge of 660 vs 620) while the
  `canvas:` header stayed 680x460 on both sides. **Objective gate 4 reads that
  line**, so if it is derived from the container's declared w/h rather than from
  the placed shapes' bounding box, the area gate is partly blind on `auto`
  files. The B6 deltas were far under 1.5x either way, so it did not change that
  verdict - but it should be confirmed before a hypothesis lands near the
  ceiling.

- **(wake 20)** `tools/screenshot.mts` waited on `[data-shape-id]` with
  playwright's default `state: "visible"`, which a perfectly vertical arrow
  (zero-width bounding box) never satisfies. Fixed to `state: "attached"` while
  unblocking B6's `sequence` capture. Two consequences worth remembering: a
  screenshot failure of this shape is a *selector* problem, not a broken
  diagram, and any corpus file whose first-painted shape is an axis-aligned
  arrow would have hit it.

- **(wake 21)** Three of six corpus files are **structurally blind to any
  doc-root hypothesis**: `deep-nesting` and `hexagonal` each have exactly one
  top-level child (a single frame), and `sparse-graph` sets `layout="auto"` on
  the doc. B7 produced byte-identical reports for all three. Combined with the
  wake-20 note above, this means the corpus can only ever decide a doc-root
  hypothesis 3-0, on `long-labels`, `sequence` and `wide-fanout`. Any future
  verdict line that reads "N ties" on this axis is describing the corpus, not
  the hypothesis. A corpus file with several top-level siblings would be a
  genuine gap - though adding one is its own hypothesis, judged on whether it
  covers a real diagram shape, and it invalidates the champion report.

- **(wake 21)** Estimated box width and rendered box width disagree in the
  direction the report cannot see. B7's `wide-fanout` render wraps `Dispatcher`
  to "Dispatch / er" and `Scheduler` to "Schedul / er" - tldraw is drawing those
  boxes narrower than `estimatedBoxSize` reserved. This is the same class of
  defect as B9's sticky overflow but in the opposite sign (reserved space
  exceeds rendered space rather than falling short), and it is invisible to
  every metric in the report. Worth folding into B9's wake rather than spending
  its own, since both are "the estimator and the renderer disagree about a
  shape's size".

- **(wake 22)** `docs/layout-champion.md` had drifted out of date and nobody
  noticed for three wakes. It was last regenerated at wake 12 (B1), so it
  predated the gate-5 metric that wake 19 added to `tools/layout-report.mts` -
  every stored section was missing its `arrow paths crossing a non-endpoint
  shape:` line. It did not affect any verdict, because the protocol regenerates
  the champion report fresh at step 2 of every wake and compares against *that*,
  never against the stored file. But the stored file is what a human or a future
  wake would read to answer "what does the champion look like?", and for three
  wakes the answer omitted the metric that rejected B7. **Regenerate
  `docs/layout-champion.md` whenever `layout-report.mts` gains a metric, not
  only when a hypothesis is KEPT** - the protocol's step 7 only mentions the
  latter.

- **(wake 22)** The doc-root axis is now down to **two** decidable corpus files.
  Wake 21 recorded that three of six are structurally blind to a doc-root
  hypothesis (`deep-nesting` and `hexagonal` have one top-level child,
  `sparse-graph` sets `layout="auto"`); B20 makes `sequence` a fourth *by
  design*, since the whole point of the chain gate is to leave chains untouched.
  So `long-labels` and `wide-fanout` are the entire electorate for anything that
  changes doc-root placement, and at wake 22 they both voted the same way. Any
  future doc-root hypothesis is deciding a 2-0 or a 1-1, and 1-1 reverts by the
  tie rule - which means the axis is now very hard to move and very cheap to
  fool. A corpus file with several top-level siblings and a non-chain topology
  would be the single highest-value corpus addition; it is its own hypothesis,
  judged on whether it covers a real diagram shape, and it invalidates the
  champion report.

- **(wake 22)** `hybridLayout` now writes `layout` and `cols` back onto the
  positioned doc, so `IRDocPositioned.layout` means "the mode actually used",
  not "the mode the author wrote". Two consequences. `tools/layout-report.mts`
  depends on this to pick the right source-order rule, so it is load-bearing
  rather than cosmetic. And a doc that authored nothing now reports
  `layout: "grid"`, which is a **behavioural change visible to anything that
  reads the positioned IR** - only the report does today, but `emit/` or the
  viewer could grow such a reader without noticing the distinction.

- **(wake 23)** Gate 3 is now weaker for `grid` containers than for `row`/`col`.
  `sourceOrderViolations` scores a grid under both the row-major and the
  serpentine reading order and keeps the lower count, because nothing in the
  geometry (or in the positioned IR) says which one the layout used. Wake 22
  already gave the report a `doc.layout` write-back for exactly this class of
  problem; if a future wake wants the gate back at full strength, the cheap fix
  is to write the *direction* back too - e.g. `layout: "grid"` plus a boolean -
  rather than to infer it. Left inferred because B21b is the only thing that
  will ever produce a serpentine grid and it has not shipped yet.
- **(wake 23)** A `layout-report.mts` change does **not** always oblige a
  champion regeneration - wake 22's follow-up said it did. The real trigger is
  the report *output* changing. B21a altered the metric's code and left all six
  corpus reports byte-identical, so `docs/layout-champion.md` is still current.
  Diff the six reports against the champion before deciding; do not regenerate
  on the mere fact that the tool was edited.

- **(wake 24)** Gate 3's grid weakness (wake 23, above) can now be **paid off or
  deleted**, and deleting is the cheaper option. B21b was "the only thing that
  will ever produce a serpentine grid", and it was rejected. So today nothing in
  `src/` places a serpentine grid, which makes `sourceOrderViolations`' `min`
  over two reading orders pure downside: a weaker gate protecting a code path
  that does not exist. Either revert the metric to row-major-only, or keep it
  and write the direction back onto the positioned doc as wake 23 suggested.
  Not done in this wake because it is its own unit of work, and because leaving
  it costs nothing until the next grid hypothesis.

- **(wake 24)** **The corpus has no multi-row chain at the doc root, and cannot
  grow one without reopening B20.** B20's chain gate sends every chain to `col`,
  so a chain never wraps and never has more than one column; every doc that
  *does* wrap is a fan or a tree. That means any hypothesis about the *order* in
  which a wrapped grid is filled is unmeasurable on this corpus by construction -
  not merely unsupported, structurally unreachable. B21b is the proof. Before
  proposing another doc-root placement rule, check which of the six files can
  physically see it; wake 22 already recorded that at most two can, and B21b
  found both of those are the wrong topology for wrap-order work.

- **(wake 28)** **Gate 4 compares layout-model canvases, so a layout that
  under-reserves gets a free pass on area.** B9 is 2.00x the champion's
  *reported* canvas and 1.32x its *rendered* one, because the champion's report
  claims 580px of height for a file whose ink reaches 882. The gate as written
  would have rejected the fix for the very defect it could not see. It was
  passed on the rendered comparison and both numbers were recorded. Fix the gate
  properly: compute the champion's canvas from rendered ink extents (the pieces
  exist - `tools/text-metrics.mts` returns per-label rects, `tools/screenshot.mts`
  has the browser), or at minimum add the note text's drawn height to the
  reported canvas. Until then, gate 4 is only trustworthy for files whose
  reserved rects and drawn ink agree.

- **(wake 28)** **`AVG_CHAR_PX = 9` is now the last unmeasured estimator.**
  `estimatedNoteSize` is calibrated against real browser metrics as of B9;
  `estimatedBoxSize` still guesses 9px per character for box labels. The same
  tool that settled the note can settle this - `tools/text-metrics.mts` already
  prints `labelW` next to `shapeW` for every box in a file, and the champion's
  `long-labels` numbers show boxes reserving a consistent 32px more than their
  label needs. Filed as **B26** in the backlog rather than done inline.

- ~~**(wake 29)** The step-9 drift audit has no baseline to audit against.~~
  **DONE** _(wake 30)_ - `docs/baselines/wake-30/` holds six reports and six
  PNGs, verified to be the wake-28 champion. The audit was recorded as vacuous,
  not passed. `docs/baselines/README.md` states the rule that makes the ratchet
  work: **epoch directories are write-once**. The first real audit is wake 35.

- **(wake 29)** Gate 5 excludes an arrow's own endpoint shapes by construction,
  so a count of 0 does not mean the render is clean. `hexagonal`'s B24 candidate
  scored 0 while still drawing arrows across box labels and into boxes from the
  wrong side. If a future arrow hypothesis reaches 0 on a file, look at the PNG
  before believing the file is solved.

- ~~**(wake 31, from B27)** **Gate 5's elbow tracer does not match tldraw's elbow
  router.** B27's candidate scored `hexagonal` 5 -> 0 and `deep-nesting` 10 -> 9
  on `arrow paths crossing a non-endpoint shape`, and the judge, looking at the
  PNGs for those same two files, described arrows piercing boxes and merging
  into shared trunks. Gate 5 (B17, wake 19) traces the L-legs it *believes*
  tldraw will draw from the binding records; nothing has ever checked that trace
  against a real render. Until it is checked, gate 5 is not evidence about an
  elbow candidate - which also weakens B24's wake-29 rejection, since that was a
  pure gate-5 call with no judge. Filed as **B28**.~~ **DONE** _(wake 32)_ - the
  tracer matched 0 of 84 corpus arrows and is deleted; gate 5 now reads the real
  vertices via `tools/arrow-truth.mts`. B27's quantitative case did not survive
  the correction, re-judging it is **B30**.
- **(wake 31, from B27)** **The judge cannot return a tie.** Step 5 tells it not
  to hedge, so a pair it finds visually indistinguishable is decided by
  position: two of B27's three wins were "A wins by default". Combined with
  keep-by-default that is a systematic pro-candidate bias in exactly the cases
  carrying no information, and it is invisible in the ledger unless the judge
  volunteers that it saw no difference. Filed as **B29**.

- **(wake 32, from B28)** **No corpus file contains a `<note>`.** Gate 5's
  candidate rects now come from `getShapePageBounds`, which was meant to stop
  the metric inheriting the note-resize error B9 documented. It changed none of
  the six numbers, because the corpus has no notes to resize. B9 is the champion
  revision that exists specifically to handle notes, and nothing in the corpus
  exercises it. Adding a note-bearing corpus file is its own hypothesis under
  the "never edit the corpus to make a hypothesis win" rule - judged on whether
  it covers a real diagram shape, and it invalidates the champion baseline.

- **(wake 32, from B28)** `src/viewer/app.tsx` now stashes the tldraw editor on
  `window.editor` unconditionally so `tools/arrow-truth.mts` can reach it. That
  is a debug hook shipped in the viewer bundle. Harmless, but if the viewer ever
  becomes something users embed, gate it behind a dev flag.

- **(wake 34, from B30)** **An objective gate and the judge can disagree, and
  the protocol does not say so out loud.** B30 is the first case: gate 5 rejects
  B27, the blind judge scores it 2-1-2, and which verdict you reach depends on
  which side you nominate as the candidate - the gate is a one-sided ratchet
  (it blocks increases, never rewards decreases) while keep-by-default is a
  one-sided burden of proof (it protects the status quo), and running the two
  in the same direction is what makes them agree. Step 4's "objective gates run
  before the judge, always" settles it in practice, but the plan should probably
  say explicitly that a re-trial nominates the *incumbent* as the candidate, so
  the incumbent has to clear the gates it would face if it were proposed today.
  Not filed as a hypothesis - it is a one-paragraph protocol edit, and it
  should be written the next time a re-trial actually comes up rather than
  speculatively.

- **(wake 34, from B30)** **`wide-fanout` is invisible to any arrow-attachment
  hypothesis and carries 36 of the corpus's 52 crossings.** B27's fan gate made
  its PNG byte-identical to the champion's, so it structurally ties every time
  and its 36 crossings never move. Every attachment hypothesis is therefore
  competing over the other 16. That is the concrete case for **B25** (routing
  lanes in placement) being the higher-value line of work now that the
  attachment line is exhausted.

- **(wake 35, from drift audit #2)** **The drift ratchet is only informative
  five wakes after a hypothesis that *survives*.** Audit #1 was vacuous (no
  baseline); audit #2 compared everything and found a byte-for-byte tie,
  because the one keep in the window (B27) was reverted inside the same window.
  A revert-heavy stretch therefore produces audits that cost a wake each and
  can never fire. Worth considering: skip the audit when the ledger shows no
  surviving keep since the last epoch, and instead re-save the epoch cheaply -
  or, better, keep the five-wake cadence but let a vacuous-by-construction
  audit be a *half* wake that also runs a hypothesis. Not filed as a
  hypothesis; it is a protocol edit and should wait until a third audit
  confirms the pattern rather than being generalised from two.

- **(wake 35, from drift audit #2)** **Epoch reports are not diffable across a
  change to `layout-report.mts`.** Wake 32 deleted the model-based gate-5 line
  from the tool, so every wake-30 report differs from every later one on that
  line and a naive `diff` calls all six files changed. The PNGs have no such
  problem. Recorded in `docs/baselines/README.md` so the next auditor does not
  mistake a tooling change for drift; if the report format changes again, the
  same note needs extending. A `--format-version` header on the report would
  make this self-describing, but that is a tool change for a problem that has
  cost one grep so far.

- **(wake 36, from B31)** **The geometry report actively pushes the judge
  toward TIE on any arrow-only change.** `layout-report.mts` carries no arrow
  information at all - it was stripped of the gate-5 line at wake 32 - so for a
  hypothesis that touches only `emit.ts`'s arrow path the two reports are
  byte-identical by construction. Three of B31's four judged ties cited exactly
  that in their reasoning (*"the geometry reports are byte-identical"*, *"the
  PNGs differ only in non-visible encoding"*), and two of them went on to
  dismiss a genuine elbow-vs-arc difference as "stroke jitter" or "encoding
  noise". Protocol step 5 already says the render is the truth where the two
  disagree, but handing the judge a document that says "nothing changed" invites
  it to reason from the document. Options: withhold the report entirely when it
  is identical on both sides, or have `layout-report.mts` carry the per-arrow
  `kind` and anchor so the report can see what the candidate actually changed.
  The first is a one-line change to the judge bundle and is the smaller fix.
  Not filed as a hypothesis - it is a protocol/tooling edit.

- **(wake 36, from B31)** **The short-edge arrowhead defect is a router
  property, not an anchor property.** B18 was struck at wake 20 as vacuous
  because nothing in production set precise anchors, so "keep centre anchors for
  short edges" described the champion rather than changing it. B31 shows the
  underlying defect is real and independent: on `deep-nesting`'s near-touching
  boxes the *elbow router* collapsed two edges into what the judge called
  *"tiny directionless nubs"*, losing the flow direction entirely. Any future
  change that puts an orthogonal route on a short edge needs a minimum-run floor
  regardless of how the terminals are anchored. Since attachment is closed, this
  matters only if B25's placement lanes ever create short orthogonal hops -
  noted here so it is not rediscovered a third time.

- **(wake 36, from B31)** **Independent per-file coin flips give lopsided A/B
  assignments often enough to matter.** This wake drew candidate-at-B on 5 of 6
  files; wake 31 drew candidate-at-A on 4 of 5, which is part of what motivated
  B29's tie rule. With ties allowed the damage is bounded - a position-biased
  judge now has somewhere neutral to go - so this was left alone rather than
  re-rolled mid-wake (re-rolling a draw you dislike is its own bias). A balanced
  assignment (shuffle three of six to each label) would remove the failure mode
  outright and costs nothing. Protocol edit, not a hypothesis.

- **(wake 37, from B25)** **Gate 4 is now the binding constraint on placement
  work, and it is measured wrong for tall files.** The area cap (1.5× the
  champion on any file) is what forced B25 down from uniform ×2 (1.62×, fails)
  to row-only ×2 (1.35×, passes) - a good outcome, but by accident. The cap is
  blind to *shape*: `wide-fanout` at 983 x 460 is a 2.14 aspect and growing its
  height moves it toward 16:9, while `sparse-graph` at 282 x 1360 is already
  0.21 and the same absolute growth would make it worse. A cap on the
  *aspect-ratio distance from 16:9*, or an area cap that is looser on the axis a
  file is short in, would let placement hypotheses spend their budget where it
  helps. Not filed as a hypothesis - it is a change to the objective gates, and
  loosening a gate is the kind of edit that needs its own wake and its own
  argument.

- **(wake 37, from B25)** **Four of six corpus files cannot see a grid row-gap
  change at all**, because `deep-nesting`, `hexagonal`, `sequence` and
  `sparse-graph` resolve to a single grid row or to a `col` chain. B25 got two
  voting files; a future placement hypothesis on the same axis will get the same
  two. That is not yet a corpus defect - the four are pulling their weight on
  frames, notes and chains - but it means the placement line of enquiry is
  effectively being judged by `long-labels` and `wide-fanout` alone. Worth a
  corpus hypothesis (its own kind of entry, per the honesty rules) adding a
  genuinely multi-row grid with mixed short and long skips, if placement work
  continues past B32.
