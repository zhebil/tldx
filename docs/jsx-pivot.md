# JSX pivot — decision record

Status: **agreed, not implemented.** Supersedes parts of `dsl.md`, `decisions.md`,
`roadmap.md`, and `CONTEXT.md` once it lands. Until then, those docs describe the
shipped `.tldsl` text format and this one describes where it's going.

## Thesis

The custom XML syntax has a learning curve and no reuse story. Replacing it with
JSX gives an LLM author a syntax it already writes natively, plus JS-native reuse
(components, props, `.map()`), at the cost of the file no longer being
self-contained text.

The pivot replaces exactly one stage of the pipeline:

```
before:  read file → tokenize → parse → AST → lower → IR → layout → emit → SceneJSON
after:   read file → esbuild bundle → execute in worker → AST → lower → IR → layout → emit → SceneJSON
                     └──────── replaces tokenize + parse (~710 LOC) ────────┘
```

`domain/parser/ast.ts` is unchanged. So are `lower.ts`, `elk-layout.ts`,
`emit.ts`, `contracts/`, `infra/transport/`, and `src/viewer/`. That containment
is the reason this is worth doing.

## Decisions

### 1. JSX as syntax — no React, no reconciler

`<Box/>` is a function returning a plain object. No `react`, no
`react-reconciler` on the authoring path.

A reconciler exists to incrementally mutate a long-lived stateful host tree over
time. The output here is a whole `SceneJSON` recomputed from scratch per save and
shipped over SSE — no persistent host tree, no state, no time dimension. Nothing
to reconcile.

The fluency being bought lives in JSX mechanics (composition, props, `.map()`),
not in hooks. Without React, `useState` is an unresolved identifier and `<div>` is
an unknown element — loud failures instead of silently-wrong output.

`react`/`react-dom` stay as deps for `src/viewer/` (tldraw). They leave the
authoring path.

### 2. Execution in Node, not the browser

`tldsl check` runs headless in a PostToolUse hook (ADR-8), so a Node execution
path is required regardless. A browser path on top would be a second
implementation of the same pipeline.

HMR was the stated draw and buys nothing here: its value is preserving
component-local state across a module reload, and there is no state. Latency is
dominated by ELK layout either way. Scene-level push over SSE is strictly better,
because it's what makes ADR-13 (last-good scene + error banner) possible — Vite
would give its own error overlay and no last-good policy.

Consequence: `domain/` stops being pure at the front. The executor is an adapter
behind a port; the AST it returns stays a pure domain type.

### 3. Edge endpoints are strings with dotted anchors

```jsx
<Edge from="api.bottom" to="db.top" />
```

Elements-as-handles (`const login = <Box/>` … `<Edge from={login}/>`) was
considered and rejected: it forces declare-then-place, so the JSX stops reading
as a tree and becomes a pile of `const`s followed by a flat render. Nesting was
the whole reason XML beat Markdown (ADR-2); trading it away to eliminate a typo
class that was never a stated pain is a bad deal. Strings also keep
cross-component edges trivial.

Typos are caught by `lower.ts` (`ir/unknown-reference`) and land in agent context
within one tool turn. Editor-squiggle vs. hook-error is a latency difference, not
a correctness one, for an LLM author.

### 4. Anchors: 8 compass points + `center`, plus fractions

```jsx
<Edge from="api.right"  to="db.left" />   // named — the common case
<Edge from="api@1,0.25" to="db.top"  />   // any point on the box
```

`normalizedAnchor` is continuous `0..1`, so a fixed table of 12 names buys
nothing a fraction doesn't. Add names only if a specific fraction gets typed
constantly.

Mostly already built: `lower.ts:293` already parses `id.anchor` and rejects it
with `ir/anchor-not-supported`; `contracts/builders.ts:248` already plumbs
`normalizedAnchor` into the tldraw binding record. Shipping anchors is an
`anchorName → {x, y}` table plus deleting a diagnostic. Independent of this
pivot — could land today.

### 5. `.tldsl.jsx`, aliased runtime import

Extension is `.tldsl.jsx`. Plain `.tsx`/`.jsx` would make the PostToolUse matcher
fire on every component file in a React repo.

The file writes `import { Doc, Box, Edge } from "tldsl"`; the esbuild pass aliases
`"tldsl"` to the CLI's own bundled runtime. Nothing needs installing in the target
repo to run. Editor support is opt-in via `tldsl init` writing a `tsconfig.json`
with a `paths` entry — skipping it costs squiggles, not correctness.

Entry convention: `export default function Diagram() { return <Doc>…</Doc> }`. A
function, not a bare element, so props (themes, datasets) can be added later
without a breaking change.

**Accepted cost:** the diagram is no longer self-contained. A `.tldsl` file is
just text and runs anywhere; a `.tldsl.jsx` needs the CLI.

### 6. No TypeScript on the authoring path

`.jsx`, not `.tsx`. No `tsconfig` required, no `tsc` in the check loop.

Types were a human-ergonomics argument. The author is an LLM, and LLMs don't
consume autocomplete — they consume a spec in the prompt.

**Conditional on:** `lower.ts` must reject unknown props. `parse.ts:79` already
errors on unknown *elements* with an `(allowed: …)` hint, but `lower.ts` reads
attributes by name and silently ignores the rest — so `<Box lable="API" />`
renders an unlabelled box with no complaint today. That pre-existing gap becomes
the most likely failure mode once the type checker is gone.

`.tsx` support is one alternation in the extension regex. Don't build it yet.

### 7. Source spans come from `jsxDEV`

esbuild with `jsx: "automatic"`, `jsxImportSource: "tldsl"`, `jsxDev: true`
compiles every element to `jsxDEV(type, props, key, isStatic, source, self)` where
`source` is `{fileName, lineNumber, columnNumber}` — injected by the transform,
per element. The runtime stashes it on the node; `lower.ts` keeps emitting spans
that point at exact lines in the user's original file.

No sourcemap plumbing, no AST walking, and `ast.ts`'s existing `span` field is
populated exactly as today. This is the single most important detail in the
pivot, and it's nearly free.

Thrown exceptions: enable esbuild sourcemaps, map the top user frame into one
`runtime/threw` diagnostic. No stack-trace beautification.

**Accepted regression:** `parse.ts:59` currently recovers from a bad subtree and
keeps going, so the agent sees every syntax mistake at once. A module that throws
produces exactly one error and no diagram. Syntax errors get strictly worse;
semantic errors are unchanged.

### 8. Worker per compile, hard terminate at 2s

`await import(userFile)` with a `setTimeout` guard **does not work**. An infinite
loop — or an accidental `Array.from({length: 1e9}).map(…)`, which an LLM writes by
mistake far more often — blocks the single event loop thread. The timer never
fires, the hook never returns, and the agent session hangs with no recovery short
of the user killing it.

`worker_threads` + `worker.terminate()` is the only thing that actually kills a
spinning loop. A fresh worker per compile also makes ESM module caching a
non-issue (new isolate, empty registry) instead of bodging it with
`import(path + "?t=" + mtime)`, which leaks a module on every save for the life of
a `serve` process.

Budget 2s, hardcoded. Report `runtime/timeout` as a normal diagnostic. Worker
startup is ~30–40ms, noise next to ELK.

**No sandbox.** The agent that wrote the file already has Bash, so executing its
JSX grants nothing new. *Known ceiling:* third-party diagrams. The day someone
pastes a `.tldsl.jsx` from the internet and `serve` executes it, this is a real
hole. Revisit if diagram-sharing becomes a use case.

```
app/ports/execute.ts   ExecutePort: (source, path) => Promise<{ ast } | { diagnostics }>
infra/execute-jsx/     esbuild bundle + Worker + terminate
                       fake: canned AST, no worker, instant tests
```

Two adapters justify the seam per `CONTEXT.md`; `domain/` stays pure.

### 9. Raw tldraw enums + thin `variant` presets; no CSS

`contracts/builders.ts` hardcodes tldraw's fixed style enums — `color` is a
13-value palette, `fill` is `none|semi|solid|pattern`, `size` is `s|m|l|xl`. There
is no `#3b82f6`, no border-radius, no flexbox.

Surface is (a) the enums directly, plus (b) a thin `variant` prop. CSS
translation is refused: it's a colour-quantisation engine that spends its life
explaining why `#3b82f6` rendered as `light-blue` and why `shadow-md` did nothing.

What makes this survivable is decision 6's unknown-prop rejection. The same model
that writes `<Box>` natively also writes
`<Box className="rounded-lg bg-blue-500" />`. That must produce
`ir/unknown-prop: 'className' is not supported on <Box> (allowed: color, fill, …)`
with a line number. Without it, the most common failure is a diagram that renders
plain black boxes while the agent believes it styled them.

Keep the preset library tiny — a `variant` prop on existing primitives, not a zoo
of domain components. `<Service name="api"/>` is no more native to an LLM than
`<box id="api">` was; it's a bespoke vocabulary either way. The fluency win comes
from JSX mechanics, not element names. `roadmap.md` already rejected
`<service>`/`<decision>` bundles on this reasoning and that call still holds.

**Update (T9/T16b):** the `variant` prop clause above is superseded - presets
are userland JSX components (plan T16b: a function returning `<Box color="..."
fill="..." />`), not a built-in prop. There is no `variant` prop on any element
today; only the raw enums (`color`, `fill`, `dash`, `arrowheadStart`,
`arrowheadEnd`) landed as pass-through props (T9).

### 10. Comments-as-stickies (ADR-11) is dead

`{/* … */}` is a JavaScript comment. esbuild strips it during transform — it never
becomes a call, never reaches `jsxDEV`, never exists at runtime. No flag or pragma
recovers it.

Rebuilding it means running a comment-extractor over the source to recover what
the transform deliberately discarded — reintroducing a parser to the front end of
a pivot whose justification was deleting the parser. And line-number stitching is
fragile exactly where it matters: comments inside `.map()` callbacks, inside
components called twice, inside helpers in other files. A comment in a component
body would become N stickies.

Annotate with `<Note>`. ADR-11 becomes "rejected: incompatible with the JSX
execution model."

### 11. Id scoping: prefix-prop discipline

ES `import` gives module reuse but no id namespacing. `<AuthFlow /><AuthFlow />`
emits `id="login"` twice. ADR-12 rule 2 solved this for `<import>` by auto-
prefixing; that mechanism is gone.

For now: every reusable component takes an `ns` prop and interpolates
(`id={`${ns}.login`}`). `ir/duplicate-id` (`lower.ts:264`) already catches the
mistake and names the first definition's line, so it self-corrects in one turn.
The real reuse patterns mostly dodge it: `.map()` over data derives ids from the
data, and diagram components nest shallowly.

**ponytail:** prefix-prop discipline; lexical scoping (ids scope to the nearest
id-bearing ancestor, edges resolve outward, cross-scope refs qualified) if
prop-threading starts hurting. Deferred because the resolution rule has surprises
in it — an edge inside a component silently binding to an outer node of the same
name — and shouldn't be designed before the pain justifies it.

**ADR-10 is deleted, not modified.** `<import name>/<use name>` existed to give
the DSL a module system. ES `import` *is* one, with real resolution and paths and
no new syntax. An entire unbuilt phase-1 feature evaporates — probably the
strongest single argument for the pivot.

ADR-12 rules 1, 3, 4 survive (explicit id on addressable elements, synthetic ids
for anonymous ones, reorder stability). Only rule 2 goes.

### 12. Bundle, and watch the module graph

`watchAndServe` takes a single `path`; `chokidar-watch.ts` says outright "we watch
a single path." Under the XML design that was fine — `<import>` was unbuilt, so a
diagram was one file. ES imports make multi-file normal from day one, so editing
`auth.jsx` would change nothing on the canvas with no error explaining why. **The
live-reload loop breaks precisely when reuse starts working.**

esbuild *bundles* the entry (`"tldsl"` aliased, `node_modules` external) into a
single worker-loadable module. One decision buys three things: the worker never
resolves relative imports, module identity across reloads stops mattering, and
`metafile.inputs` is the exact set of contributing files. Re-subscribe the watcher
to that set after every compile.

Requires `app/ports/watch.ts` to take a set and support re-subscription — touches
the port, the chokidar adapter, and the fake. `watch.contract.ts` already exists
to pin the behaviour.

**Contract rule:** a failed compile must keep the *previous* watch set. Otherwise
a broken `auth.jsx` unsubscribes itself and fixing it never retriggers. Belongs in
the contract test.

### 13. Delete the text parser

`tokenize.ts` (360) + `parse.ts` (350) + tests (153 + 230) ≈ 1090 LOC, plus
`docs/dsl.md`, the e2e fixtures, and `scratch.tldsl`.

No dual front end. The tax isn't maintaining two parsers — it's that every
downstream change has to be expressed twice: anchors, unknown-prop rejection,
`variant`, each needing an XML syntax, a JSX syntax, docs for both, tests for
both. And `dsl.md` would have to explain two ways to say everything to an agent
that needs one.

Staging:

1. **Add** `app/ports/execute.ts`, `infra/execute-jsx/`, the JSX runtime, and the
   component library, dispatching on `.tldsl.jsx`. `.tldsl` keeps working.
   Nothing deleted; everything downstream of `ast.ts` untouched.
2. **Port** the e2e fixtures and `docs/dsl.md` to JSX. Parity is proven when
   `auth-fixture` produces the same `SceneJSON` through both front ends.
3. **Delete** `tokenize.ts`, `parse.ts`, their tests, `.tldsl` dispatch; update the
   hook matcher to `.tldsl.jsx`. One commit, clearly labelled.

Budget: ~750 LOC new (runtime ~60, component library ~120, port+fake ~100,
esbuild/worker adapter ~180, worker entry ~40, unknown-prop validation ~80,
watch-set change ~120, anchor table ~50) against ~1090 deleted.

## New dependency

**esbuild** becomes a runtime dep of the shipped CLI — the first
platform-specific native binary in the project. npm handles it via optional deps,
but installs become per-platform and CI matrices care.

Alternatives are worse: `esbuild-wasm` (slower, and the point of the native binary
is check-hook latency), `sucrase` (transform only, no bundling — kills decision 12's
metafile). `tsx` is currently a devDep and bundles esbuild already, so the binary
is effectively present today; this makes it explicit and non-dev.

## Accepted regressions

- Diagrams stop being self-contained portable text.
- Syntax errors report one at a time instead of the parser's multi-error recovery.
- Comments-as-stickies is gone.
- esbuild native binary in the shipped CLI.

## Deferred, with known ceilings

- Lexical id scoping (decision 11).
- Sandboxing third-party diagrams (decision 8).
- Configurable execution timeout (decision 8).
- `.tsx` support (decision 6).

## Still open (small)

- The `variant` vocabulary.
- Free-endpoint spelling: `from={{x: 100, y: 200}}` vs `from="x:100,y:200"`.
- Whether ADR-4's "`<group>` rejects visual props" stays a runtime check.
  Assumed yes, unchanged.

## Docs that go stale when this lands

- `docs/dsl.md` — full rewrite.
- `docs/decisions.md` — ADR-2 amended; ADR-10, ADR-11, ADR-12 rule 2 removed;
  ~6 new entries.
- `CONTEXT.md` — layers, ports table, glossary.
- `docs/roadmap.md` — phase-1 element list; open question 4 answered by
  `flow(a, b, c)` being an ordinary function.
- `.claude/settings.json` — hook matcher.
- `README.md`.
