# Ralph plan

Source of truth for the autonomous loop. **This file is the only state that
survives between sessions.** Every wake reads it, does exactly one unit of work,
and writes back.

Branch: `ralph/jsx-layout`. Never work on `main`.

Two phases. Phase A is finite and ordered. Phase B is infinite and runs forever
once A is done. The loop never terminates; the human stops it.

---

## Status

- Phase: **A**
- Champion layout revision: _(none yet — set when Phase B starts)_

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

- [ ] **A7 — Port fixtures and corpus to JSX.**
  Convert `tests/e2e/` fixtures and `scratch.tldsl`. Parity gate: the auth
  fixture must produce byte-identical `SceneJSON` through both front ends.
  Also create the Phase B corpus (see A9's tooling for what it feeds):
  `tests/corpus/hexagonal.tldsl.jsx`, `sequence.tldsl.jsx`,
  `wide-fanout.tldsl.jsx`, `deep-nesting.tldsl.jsx`, `sparse-graph.tldsl.jsx`,
  `long-labels.tldsl.jsx`. Six diagrams, deliberately different shapes.

- [ ] **A8 — Delete the text parser.**
  `tokenize.ts`, `parse.ts`, their tests, `.tldsl` dispatch. Update the
  PostToolUse matcher to `.tldsl.jsx`. One commit, clearly labelled.

- [ ] **A9 — Layout report tool.**
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

- [ ] **A10 — Docs.**
  Rewrite `docs/dsl.md` for JSX. Amend `docs/decisions.md`: ADR-2 amended;
  ADR-10, ADR-11, ADR-12 rule 2 removed; ADR-5 gets a note that ELK is demoted
  to opt-in `layout="auto"`; add ADRs for the pivot decisions. Update
  `CONTEXT.md` layers, ports table, and glossary. Update `README.md`.

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

2. **Record the champion.** `tools/layout-report.mts` over all six corpus files,
   saved as the champion report. This is the baseline for this wake only.

3. **Build it.** Delegate implementation. Smallest change that tests the
   hypothesis. No refactoring rides along.

4. **Objective gates.** Candidate is rejected without a judge if any hold:
   - `npm run check` fails.
   - Any overlapping shape pair that the champion did not have.
   - Any source-order violation in a `row`/`col`/`grid` container.
   - Canvas area more than 1.5× the champion's on any corpus file.
   A rejection here is still a result — record it and move on.

5. **Subjective judgement.** Delegate to a **fable** subagent, once per corpus
   file. Give it: the source, and two reports labelled **A** and **B** with the
   assignment **randomised per file** (record which was which; do not tell the
   judge). Ask for a winner and one sentence of reasoning. Never ask for a
   numeric score — pairwise comparison only.

6. **Verdict.** Candidate becomes champion iff it wins strictly more files than
   it loses. Ties go to the champion (bias toward not churning).

7. **Record.** Append to `docs/layout-hypotheses.md`: the hypothesis, the diff
   summary, gate results, per-file verdicts with the judge's reasoning, and
   KEPT or REVERTED. A reverted hypothesis is `git checkout`-ed away and struck
   through in the backlog so it is never retried blind.

8. **Commit.** Kept → commit the change plus the ledger entry. Reverted →
   commit the ledger entry alone. Either way the wake ends with a commit.

### Rules that keep this honest

- **Never edit the corpus to make a hypothesis win.** Corpus changes are their
  own hypothesis, judged on whether the corpus covers real diagram shapes, and
  they invalidate the champion report (regenerate it).
- **Never let the judge see which side is the candidate.**
- One hypothesis per wake even if it looks trivial.
- If a hypothesis needs more than ~200 LOC, split it and put the pieces at the
  top of the backlog.
- Objective gates run before the judge, always. Pretty-but-broken never wins.

### Hypothesis backlog

Ordered. Take from the top. Strike through when resolved.

- [ ] **B1** `align` attribute (`start`/`center`/`end`) on row/col containers.
  Evidence: in `scratch.tldsl` the `core` frame is 196 tall among siblings of
  268/268/556/484, top-aligned — the centre of a hexagonal diagram sits pinned
  to the top edge. `dsl.md` declares `align` and nothing implements it.
- [ ] **B2** Real text measurement instead of `len * 9 + 48`. Height is
  currently pinned at 60 and text never wraps, so `a10` is a 426px box for one
  line. Try: wrap at a max width, measure per-line, grow height.
- [ ] **B3** Default arrow `kind: "elbow"` instead of tldraw's `arc`.
  `builders.ts` never sets `kind`. Curved arrows read as amateur on
  architecture diagrams.
- [ ] **B4** Ship the anchor scheme (8 compass + `center` + `@x,y`), then bind
  edges to sides instead of centres. Evidence: `usecases` has seven outgoing
  edges all bound to its centre.
- [ ] **B5** Edge-aware child ordering *within* a `col` container: keep source
  order as the tie-break but let a container opt into sorting children to line
  up with a neighbouring container's connected children. Evidence: 7 ports
  against 6 adapters gives every port→adapter arrow a constant 72px up-left
  slope.
- [ ] **B6** Spacing as a function of edge density rather than the constant 40.
- [ ] **B7** Aspect-ratio targeting for the doc root: currently defaulting to
  `col` makes tall skinny documents (1198 × 2940). Try wrapping top-level
  children into a grid that targets ~16:9.
- [ ] **B8** Frame title width participates in frame sizing. Frame `name` is
  never measured, so long titles overflow.
- [ ] **B9** Note sizing: notes reserve a fixed 200×80 in layout but tldraw
  resizes stickies to fit, so reserved space and rendered space disagree.
- [ ] **B10** `elk.layered.considerModelOrder.strategy` for containers that do
  opt into `layout="auto"`, so even ELK respects source order as a tie-break.

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
