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

**Update (JSX pivot, see `docs/jsx-pivot.md`)**: the custom XML grammar (`tokenize.ts` + `parse.ts`) is deleted; JSX is the syntax now. The structural-nesting reasoning that won this ADR is exactly why JSX won too - it's the same argument one level up the stack, applied to a syntax LLMs already write natively instead of a bespoke one they have to be taught. The `<edges>`-block mitigation is moot: `flow(a, b, c)` is an ordinary function, not new grammar.

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

**Update (JSX pivot)**: `Group` does not exist in the shipped component library - `domain/parser/ast.ts` has no `group` kind, only `Frame`. The split is deferred, not rejected: nothing about the JSX pivot argues against it, it just never got built. Revisit if `<Frame>`-for-everything turns out as visually noisy in practice as this ADR predicted.

---

## 5. ELK over Dagre for auto-layout

**Decision**: ELK as the auto-layout engine.

**Why**: per-region direction, native port model (matches the 13-anchor scheme), nested layout for group/frame hierarchies, WASM build runs in Node and browser.

**Trade-off**: heavier, less ergonomic API than Dagre. Acceptable.

**Update (JSX pivot)**: ELK is demoted to opt-in. `domain/layout/stack.ts` (`hybridLayout`) places `row`/`col`/`grid`/`free` deterministically in the domain, bottom-up; only a container with `layout="auto"` calls ELK, and it gets a flat graph of that container's already-sized direct children, not the whole nested hierarchy. The nested-layout and native-port-model reasoning above still justified picking ELK over Dagre for the `auto` case - it just applies to a smaller slice of the tree than originally planned.

---

## 6. 13 fixed anchors + free endpoints as escape hatch

**Decision**: 13 named anchors per shape; default attach is center; free endpoints (`x:100,y:200` or `x:50%,y:0`) available when needed.

**Why**: tldraw's free-form attach as default produces messy diagrams. Fixed anchors give clean visuals and tractable routing.

**Crowding**: multiple edges on one anchor get visually offset by the renderer; they stay semantically on the same anchor. No re-anchoring.

**Update (JSX pivot)**: the fixed count of 13 didn't survive - see `docs/jsx-pivot.md` decision 4. The design is 8 compass points + `center`, plus arbitrary `0..1` fractions (`api@1,0.25`) for anything a name doesn't cover; `normalizedAnchor` is already continuous, so a bigger fixed table buys nothing. Not shipped yet: both named anchors and free endpoints are still parsed and rejected outright (`ir/anchor-not-supported`, `ir/free-endpoint-not-supported`).

---

## 7. Phase 1 is write-only

**Decision**: agent edits DSL → tldraw renders. No round-trip.

**Why**: round-trip is ~60% of total complexity (parser tldraw → DSL, diff, reconciliation, stable IDs, free-form drag handling). Cutting it ships a useful tool fast. Round-trip is on the roadmap, not abandoned.

---

## 8. PostToolUse hook for error feedback, not a sidecar

**Decision**: Claude Code's `PostToolUse` hook calls `tldsl check` after every Write/Edit. Plain-text diagnostics inject into agent context inline.

**Why**: hooks are synchronous - errors land in-session. A polling sidecar is always a turn behind, and the last edit of a session never gets feedback.

**Hook config**: in `.claude/settings.json` with `matcher: "Write|Edit"` and `command: "tldsl check ... 2>&1 || true"`. The `|| true` keeps a hook failure from aborting the session.

**Update (JSX pivot)**: the hook still matches every `Write|Edit`; the file-extension filter that lives inside `tldsl check` itself moved from `.tldsl` to `.tldsl.jsx` - see the "Delete the text parser" ADR below.

---

## 9. Two CLI modes from one pipeline

**Decision**: `tldsl serve <file>` (watcher + viewer, human use) and `tldsl check <file>` (one-shot validator, hook + CI).

**Why**: same compiler; `serve` adds watcher + dev server. `check` is the surface that's friendly to hooks and CI.

---

## 10. Imports for sub-docs - DELETED

**Original decision**: `<import name="..." from="..." />` + `<use name="..." />`.

**Original why**: LLM editing degrades on 5000-line files; 200-line subdocs keep edit context tight. Subdocs are independently versionable. Each subdoc has its own layout scope - re-layout doesn't ripple to the main doc. Multi-page falls out for free.

**Deleted, not amended (JSX pivot)**: `<import>`/`<use>` was custom grammar for a module system. ES `import` already is one, with real resolution, real paths, and no new syntax to design or parse. The whole unbuilt feature evaporates - see `docs/jsx-pivot.md` decision 11, which calls this the strongest single argument for the pivot.

---

## 11. Comments compile to stickies - REJECTED

**Original decision**: `<!-- ... -->` in source becomes a sticky note anchored to the next element. `<note>` exists for stickies that need explicit position.

**Original why**: makes inline annotation first-class without extra syntax. Aligns with how the agent (and humans) naturally write comments next to the thing they're describing.

**Rejected: incompatible with the JSX execution model (JSX pivot)**. `{/* ... */}` is a JavaScript comment; esbuild strips it during transform, so it never becomes a call, never reaches `jsxDEV`, never exists at runtime. No flag or pragma recovers it - see `docs/jsx-pivot.md` decision 10. Rebuilding it means running a comment-extractor over the source, i.e. reintroducing a parser to the front end of a pivot whose entire point was deleting the parser. Use `<Note>` to annotate.

---

## 12. ID rules: explicit on addressable, namespaced via import, reorder-stable

**Decision**: four invariants, normative for parser + IR.

1. **Explicit `id` is required on addressable elements** - anything that can be referenced by `<edge from="..." to="...">` or (later) `<use name="...">`. IR emits `ir/missing-id` if absent.
2. ~~**Imported IDs are namespaced** - `<import name="auth" from="./auth.tldsl" />` prefixes every child id with `auth.`. No collisions across imports.~~ **Removed (JSX pivot)**: `<import>` is gone (ADR-10), so the mechanism this rule described no longer exists. Replacement is convention, not a compiler guarantee: a reusable component takes an `ns` prop and interpolates it into its ids (`id={`${ns}-login`}`, hyphen not dot - a dotted id can never be referenced by an `<Edge>`, since `from`/`to` read a literal `.` as anchor syntax) - there is no automatic prefixing. `ir/duplicate-id` still catches a collision and names the first definition's line, so it self-corrects in one agent turn. See `docs/jsx-pivot.md` decision 11.
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

---

The following ADRs (14-21) record the JSX pivot: replacing the custom XML text front end with JSX executed in a Node worker. Long-form reasoning for each lives in `docs/jsx-pivot.md`; these are the terse decision/why/rejected form for the log.

## 14. JSX as syntax - no React, no reconciler

**Decision**: `<Box/>` is a function call returning a plain object (`domain/parser/ast.ts`'s `AstNode` shape). No `react`, no `react-reconciler` on the authoring path.

**Why**: a reconciler exists to incrementally mutate a long-lived stateful host tree over time. The output here is a whole `SceneJSON` recomputed from scratch per save - no persistent host tree, no state, nothing to reconcile. The fluency being bought is JSX mechanics (composition, props, `.map()`), not hooks. See `docs/jsx-pivot.md` decision 1.

**Rejected**: React + a custom reconciler. Would buy HMR-style incremental updates that nothing in this pipeline needs, at the cost of a second dependency chain (`react`/`react-dom`) already carried separately by `src/viewer/` (tldraw) - those stay scoped to the viewer and never touch the authoring path.

## 15. Execution in Node behind an `ExecutePort`, not the browser

**Decision**: `.tldsl.jsx` files execute headless in a Node `worker_threads` worker, behind `app/ports/execute.ts` (`ExecutePort`). Real adapter is `infra/execute-jsx/`; `FakeExecute` is the test double.

**Why**: `tldsl check` already has to run headless in a `PostToolUse` hook, so a Node execution path is required regardless - a browser path on top would be a second implementation of the same pipeline. HMR was the stated draw for a browser/Vite path and buys nothing here: there's no component-local state to preserve across a reload. Consequence: `domain/` stops being pure at the front - the executor is an adapter behind a port, but the `AstNode` it hands back stays a pure domain type. See `docs/jsx-pivot.md` decision 2.

**Rejected**: executing in the browser via Vite. Its own error overlay would compete with ADR-13's last-good-scene-plus-banner policy instead of feeding it.

## 16. Source spans from `jsxDEV`

**Decision**: esbuild compiles with `jsx: "automatic"`, `jsxImportSource: "tldsl"`, `jsxDev: true`, so every element becomes a `jsxDEV(type, props, key, isStatic, source, self)` call where `source` is `{fileName, lineNumber, columnNumber}`, injected by the transform per element. The runtime component library reads it and populates `ast.ts`'s existing `span` field exactly as the text parser used to.

**Why**: no sourcemap plumbing, no AST walking to recover a line number - this was nearly free and is the single detail that made the whole pivot viable without regressing diagnostic quality. See `docs/jsx-pivot.md` decision 7.

**Rejected**: walking esbuild sourcemaps to back-map generated positions to source positions for every diagnostic. `jsxDEV`'s `source` argument makes that unnecessary for element spans; sourcemaps are used only for the narrower job of mapping a *thrown* error's top frame back to user code (`runtime/threw`).

**Accepted regression**: the text parser recovered from a bad subtree and reported every syntax mistake in one pass; a JSX module that throws produces exactly one error and no diagram. Semantic errors (`ir/*`) are unaffected.

## 17. Worker per compile, hard `terminate()` at 2s, no sandbox

**Decision**: every compile spins up a fresh `worker_threads` Worker, budgeted 2s, hard-`terminate()`d on timeout (`runtime/timeout` diagnostic). No sandboxing beyond process isolation.

**Why**: `await import(userFile)` with a `setTimeout` guard does not work - an infinite loop (or an accidental `Array.from({length: 1e9}).map(...)`) blocks the single event-loop thread the timer would fire on, and the hook never returns. `worker.terminate()` is the only thing that actually kills a spinning loop. A fresh worker per compile also sidesteps ESM module-caching entirely (new isolate, empty registry) instead of cache-busting import paths, which would leak a module on every save for the life of a `serve` process. See `docs/jsx-pivot.md` decision 8.

**Rejected**: sandboxing the worker (vm2, a subprocess with restricted permissions, etc). The agent that wrote the file already has Bash, so executing its JSX grants no new capability today. **Known ceiling**: this stops being true the day someone pastes a `.tldsl.jsx` from the internet and `serve` executes it untrusted - revisit if diagram-sharing becomes a use case.

## 18. Bundle the entry, watch the module graph

**Decision**: esbuild bundles the `.tldsl.jsx` entry (`"tldsl"` aliased to the runtime, `node_modules` external) into one worker-loadable module. `WatchPort.watch()` takes an array of paths, not a single file; `watchAndServe` re-subscribes to `metafile.inputs` after every successful compile.

**Why**: ES imports make multi-file diagrams normal from day one (unlike the deleted `<import>` grammar, which was never built), so a single-path watcher would silently stop live-reloading the moment an author split a diagram into components. Bundling gets three things from one decision: the worker never resolves relative imports at runtime, module identity across reloads stops mattering, and `metafile.inputs` is exactly the contributing file set to watch. A failed compile keeps the *previous* watch set - a broken edit must not unsubscribe its own imports and orphan itself. See `docs/jsx-pivot.md` decision 12.

**Rejected**: watching only the entry file. Breaks live-reload precisely when component reuse - the feature ES imports were adopted for - starts working.

## 19. Delete the text parser - no dual front end

**Decision**: `tokenize.ts`, `parse.ts`, and their tests (~1090 LOC) are deleted outright, not kept alongside JSX. `domain/parser/` now holds only the `AstNode` type (`ast.ts`) and fixtures - it defines the AST, it no longer produces one. `tldsl check` silently exits 0 on any path not ending in `.tldsl.jsx`; `parser/unexpected-token` is gone from the live pipeline.

**Why**: the tax of a dual front end isn't maintaining two parsers, it's that every downstream change - anchors, unknown-prop rejection, `variant` - has to be expressed twice: once as XML syntax, once as JSX syntax, with docs and tests for both. `docs/dsl.md` would have to teach an agent two ways to say everything. See `docs/jsx-pivot.md` decision 13.

**Rejected**: keeping `.tldsl` XML as a permanent second front end alongside `.tldsl.jsx`. Considered as the staged rollout (land JSX, port fixtures, prove parity, *then* delete) - the staging was temporary by design, not the end state.

## 20. No TypeScript on the authoring path, with `ir/unknown-prop` as the safety net

**Decision**: source files are `.jsx`, not `.tsx`. No `tsconfig` required to author, no `tsc` in the check loop. `lower.ts` rejects any prop it doesn't recognize with `ir/unknown-prop` and an `(allowed: ...)` hint carrying a line number.

**Why**: types were a human-ergonomics argument - autocomplete, inline errors. The author is an LLM, and LLMs consume a spec in the prompt, not autocomplete. See `docs/jsx-pivot.md` decision 6.

**Conditional on** `ir/unknown-prop` existing: without it, `<Box lable="API" />` renders a silently unlabelled box instead of an error. That gap predates the pivot (the old `parse.ts` already rejected unknown *elements* but not unknown *attributes*) and becomes the most likely failure mode once the type checker is gone entirely. This ADR does not hold without it.

**Rejected**: `.tsx` support. One alternation in the extension regex if it's ever wanted; not built, because nothing currently needs it.

## 21. Hybrid layout: deterministic stacks in the domain, ELK opt-in for `auto`

**Decision**: `domain/layout/stack.ts` (`hybridLayout`) sizes children bottom-up and places `row`/`col`/`grid`/`free` containers deterministically in pure domain code. Only a container with `layout="auto"` calls the `AutoPlacer` port (ELK in production), and only with a flat graph of that container's already-sized, unpinned direct children - not the whole nested hierarchy. Default layout when the prop is absent is `col`.

**Why**: most containers don't need a constraint solver - a row or column stack is deterministic and cheap to reason about, both for the compiler and for an agent predicting what its markup will render as. Reserving ELK for the explicit `auto` opt-in keeps it in exactly the cases where its native port model and per-region direction earn their weight (ADR-5), instead of running it over structure that a stack layout already answers unambiguously.

**Rejected**: ELK over the whole nested hierarchy (the original ADR-5 shape). Correct but heavier than the common case needs, and it makes deterministic layouts (a simple top-to-bottom flow) depend on a constraint solver's output being stable across ELK versions.
