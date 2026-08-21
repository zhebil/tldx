# tldsl — Architecture Context

This document is the source of truth for the project's architecture: vocabulary, layers, dependency rules, and patterns. The `eslint`/`dependency-cruiser` configs (defined in `docs/lint-config.md`, wired by the bootstrap toolchain task) mechanically enforce what's described here. **If code disagrees with this doc, the code is wrong (or this doc is stale - update it deliberately).**

> Status note: the lint rules described below are live and enforced in CI.

## What the application is

`tldsl` is a CLI + local viewer that turns a JSX authoring surface into a live tldraw canvas. AI agents (Claude Code et al.) author `.tldsl.jsx` files with normal Edit/Write tools, importing `Doc`, `Frame`, `Box`, `Note`, `Edge`, and `flow` from the `"tldsl"` module; a watcher recompiles on save and pushes scene JSON to a browser viewer. A one-shot `tldsl check` validates files and is wired into the agent's `PostToolUse` hook so syntax/layout errors land back in context.

## Scope split

There are three concentric scopes. **Every section below is MVP-scoped.** Phase 1 and phase 2 are tracked in `docs/roadmap.md`.

- **MVP (now):** the smallest slice that proves the thesis (file → live canvas, errors land in agent context within one tool turn).
- **Phase 1 (later):** remaining feature surface from the original design (`Group`, `<Shape>` kinds, `<Text>`, `<Line>`, full anchor scheme, edge styling). `<import>`/`<use>` and comments-as-stickies are not phase 1 - the former was superseded outright by ES `import`, the latter was rejected as incompatible with the JSX execution model. See `docs/decisions.md` ADR-10, ADR-11.
- **Phase 2 (landing):** round-trip from canvas back to DSL. The lossless half is built - canvas edits live in `x.tldsl.overlay.json` and the render is `applyOverlay(overlay, compile(jsx))` (ADR-22, `docs/round-trip.md`). `tldsl absorb` folds the half of an overlay that JSX can express back into the source, verifies the rewrite reproduces the render before emptying the overlay, and leaves everything else in the overlay.

### MVP scope

- `tldsl serve <file>` and `tldsl check <file>`.
- Component library: `Doc`, `Frame`, `Box`, `Note`, `Edge`, `flow`, imported from `"tldsl"` in a `.tldsl.jsx` file. No `Group`, no `<Shape>` kinds, no edge styling beyond defaults, no comments-as-stickies (comments are plain JS comments and compile to nothing).
- Layout: hybrid - `row`/`col`/`grid`/`free` place deterministically in the domain; `layout="auto"` calls ELK on that container's already-sized direct children. `free` with hard pins (`x`/`y`) supported.
- Anchors: default-center attach only. The full scheme (8 compass points + `center`, plus arbitrary `0..1` fractions) is phase 1; see `docs/decisions.md` ADR-6.
- Live viewer reload on file change.
- Diagnostics from `check` printed as plain text, exit non-zero on error.
- Success criterion: in a fresh agent session, the agent authors a 5-node auth-flow diagram, the canvas updates live, and any invalid edit produces an inline error within one tool turn.

## Patterns in use

Picked from `bootstrap-architecture/PATTERN-CATALOG.md` - use these exact names; do not paraphrase.

- **Layered architecture** - single domain, no bounded contexts.
- **Hexagonal / ports & adapters** - external boundaries that *vary* (real impl + test fake) get a port. Boundaries that don't vary are wired directly in `cli/`.
- **Functional core, imperative shell** - the parser → IR → layout → emit chain is pure; I/O lives at the edges.
- **Pipeline** - the compiler is a linear chain of pure stages.
- **Use case / interaction** - `app/` exposes verbs (`compileFile`, `watchAndServe`) that the CLI and tests both call. Each use case takes a narrow per-use-case dependency struct, not a global capability bundle.

## Layers

```
cli/        Composition root / entry point. Parses argv, builds real deps,
            invokes use cases, formats diagnostics, calls process.exit.
            The ONLY place real adapters meet use cases.

app/        Application. Use cases orchestrating the domain pipeline + ports.
  ports/      Port interfaces the use cases depend on. Fakes colocated as
              <port>.fake.ts. (FsReadPort, FsWritePort, WatchPort,
              TransportPort, LogPort.)

domain/     Pure compiler core. No imports outside domain/ + contracts/.
  parser/     The AST type (`ast.ts`) shared by `runtime/` (which produces it)
              and `domain/ir/` (which consumes it). Does not parse text - the
              text front end was deleted with the JSX pivot; see
              `docs/jsx-pivot.md`.
  ir/         AST → normalized IR. Derives IDs, expands shorthand, applies
              MVP validation (e.g. `<Edge>` endpoints reference real elements).
  layout/     IR → IR-with-positions. Calls the layout port.
  emit/       IR-with-positions → contracts/SceneJSON.
  overlay/    Canvas edits over a compiled scene. `applyOverlay` (overlay +
              scene → scene) and its inverse `diffScenes`. Pure; never
              re-runs layout. See ADR-22 and docs/round-trip.md.
  absorb/     Overlay records → JSX source text, and the splice into the
              root `<Doc>`. Pure; the writing, guardrails and verification
              live in `app/absorb.ts`.
  diagnostics/ Error type + source-span model. NO formatting (cli/ owns that).
  ports/      Port interfaces the domain pipeline depends on (LayoutPort).
              Fakes colocated as <port>.fake.ts.

infra/      Adapters. One per port that exists.
  fs/           read + watch (chokidar). Implements FsReadPort + WatchPort.
  layout-elk/   real ELK adapter (elkjs). Implements LayoutPort.
  transport/    SSE server. Implements TransportPort.
  devserver/    HTTP server (and the SSE endpoint host) serving the viewer
                bundle. Exports startDevServer({ port, viewerBundleDir, transport }).
                No port interface - one impl, called directly from cli/serve.ts.
                CLI composes and starts it; CLI does NOT contain HTTP code.
  execute-jsx/  esbuild bundle + worker_threads worker, hard-terminated at a
                2s budget. Implements ExecutePort. The only place that
                imports runtime/ - it bundles the runtime alongside the
                user's `.tldsl.jsx` entry and runs the result in a fresh
                worker per compile. esbuild is a real runtime dependency of
                the CLI here (the first platform-specific native binary in
                the project), contained to this directory the way elkjs is
                contained to layout-elk/.
  log/          stdout/stderr logger. Implements LogPort.

contracts/  Wire types shared across layers. Imports NOTHING.
  scene-message.ts    Envelope pushed over the transport: { v, kind, payload }.
  scene-json.ts       The scene payload (currently a re-export/pin of tldraw's
                      scene-JSON shape; treated as our wire format).
  overlay.ts          The overlay file's shape - a final-state map of canvas
                      edits keyed by record id. Shared by domain/overlay/
                      and the viewer, which PUTs its snapshot to /overlay.

viewer/     Separate Vite-built bundle. tldraw + transport client. Imports
            from contracts/ ONLY. Built into a static bundle that
            infra/devserver serves.

runtime/    The JSX authoring surface (`"tldsl"` module: `Doc`, `Frame`,
            `Box`, `Note`, `Edge`, `flow`, plus the `jsx`/`jsxs`/`jsxDEV`
            runtime esbuild's automatic transform targets). It is bundled by
            `infra/execute-jsx/` and executed inside a worker alongside user
            diagram code - not imported anywhere else in the project. It may
            import types from `domain/parser` and `contracts/` and nothing
            else. Output is exactly the `domain/parser/ast.ts` AST shape.
            `infra/execute-jsx/` is the one layer that imports it - that
            exception has landed, not just planned.
```

`viewer/` is its own deliverable. Both `viewer/` and `domain/emit/` reference `contracts/scene-message.ts` and `contracts/scene-json.ts`. That's the versioned contract.

## Dependency rules (lint-enforced)

```
cli       → app, infra, domain (types only), contracts
app       → app/ports, domain, contracts
domain    → domain itself, contracts             (PURE)
infra     → app/ports, domain/ports, contracts   (implements them)
viewer    → contracts                            (its own world otherwise)
contracts → nothing
runtime   → domain/parser (types), contracts     (leaf; nothing else may import it)
tests     → same rules as the code they test (no bypass)
```

Specifically:

- `domain/**` may not import `node:*`, `infra/**`, `app/**`, `cli/**`, `viewer/**`, or any third-party package that touches I/O. ELK is fine *only* via `domain/ports/layout.ts`; the real adapter lives in `infra/layout-elk/`.
- `app/**` may not import `node:*`, `infra/**`, `cli/**`, `viewer/**`. May import `app/ports/**`, `domain/**`, `contracts/**`.
- `infra/**` may import `app/ports/**`, `domain/ports/**`, `contracts/**`. May NOT import `app/!(ports)/**`, `cli/**`, `viewer/**`.
- `cli/**` is the wiring site. It may import everything except `viewer/**` (the viewer is a built artifact, not a TS dependency).
- `viewer/**` may import only `contracts/**`. No `cli`, `app`, `domain`, `infra`.
- `contracts/**` imports nothing - no node built-ins, no third-party packages, no internal modules.
- `runtime/**` may import types from `domain/parser/**` and `contracts/**` only - no `node:*`, `infra/**`, `app/**`, `cli/**`, `viewer/**`. It is a leaf: the only exception to "no other layer may import `runtime/**`" is `infra/execute-jsx/`, which bundles it.

## Boundaries

A boundary becomes a port only when **two adapters justify the seam** (real impl + fake, or real impl + alternative impl). Boundaries that don't vary are wired directly in `cli/`. Concretely for MVP:

| Boundary | Port? | Why / why not |
|---|---|---|
| Filesystem read | `app/ports/fs.ts` | Real (node:fs) + InMemoryFs fake. Use cases need it; tests need it instant. |
| Filesystem write | `app/ports/fs.ts` (`FsWritePort`) | Real (node:fs) + InMemoryFs fake. Only the overlay is written; the same seam that already existed for reads. |
| Filesystem watch | `app/ports/watch.ts` | Real (chokidar) + controllable fake. Watcher tests need to drive events. `watch(paths, listener)` takes an array, not a single file - a `.tldsl.jsx` entry can pull in imports, and `WatchHandle.update(paths)` re-subscribes to the current set (diffing against what's already watched; an unchanged set emits nothing) after every compile. |
| Layout engine | `domain/ports/layout.ts` | Real (elkjs, opt-in for `layout="auto"`) + StubLayout. Domain unit tests need determinism. |
| JSX execution | `app/ports/execute.ts` (`ExecutePort`) | Real (`infra/execute-jsx/`: esbuild bundle + `worker_threads` worker, hard `terminate()` at 2s) + `FakeExecute`. Two adapters justify the seam; `domain/` stays pure by never touching esbuild or the worker directly. |
| Viewer transport | `app/ports/transport.ts` | Real (SSE) + InMemoryTransport. App tests assert what got pushed. |
| Logger | `app/ports/log.ts` | Real (stderr) + CaptureLog. Use cases emit structured logs; tests inspect them. |
| Dev HTTP server | **No port** (impl in `infra/devserver/`). | One impl, no test variation - port abstraction is ceremony. CLI composes via `startDevServer(...)`; HTTP/SSE code stays in `infra/devserver/`. |
| Stdout / process exit | **No port.** | Use cases return values; `cli/` writes + exits. App layer never prints. |
| Clock | **No port for MVP.** | Add when `watchAndServe` introduces debounce; tracked in `tldsl-2lu`. |
| Random | **No port.** | IDs are deterministic (see below). |

**Per-use-case dependency structs** (no global Caps):

```ts
type CompileFileDeps   = { fs: FsReadPort; layout: LayoutPort; execute: ExecutePort };
type WatchAndServeDeps = { watch: WatchPort; fs: FsReadPort; layout: LayoutPort; execute: ExecutePort; transport: TransportPort; log: LogPort };
```

Each use case declares only what it needs. `compileFile` does not see a transport; `watchAndServe` does not see stdio.

## Transport choice

**SSE for MVP.** Push is one-way (CLI → viewer); SSE is simpler to reason about, no upgrade dance, native EventSource in the browser. Reconnect is built in. Round-trip did not need a second transport after all: the viewer writes its canvas edits over a plain `PUT /overlay` on the same dev server, so SSE stays one-way and `TransportPort` is unchanged (ADR-22, `docs/round-trip.md` D4).

## Scene message contract

Lives in `contracts/scene-message.ts`. Versioned envelope:

```ts
type SceneMessage =
  | { v: 1; kind: "scene"; payload: SceneJSON }
  | { v: 1; kind: "error"; payload: { diagnostics: Diagnostic[] } }
  | { v: 1; kind: "ping"; payload: {} };
```

`v` bumps on incompatible change. Both producer (`infra/transport`, fed by `app/watchAndServe`) and consumer (`viewer/`) import from contracts.

**On compile error**: `watchAndServe` pushes only `{kind: "error", payload}` - no `scene` is sent. The viewer keeps its last successful `scene` rendered and overlays an error banner from the diagnostics. On the next successful compile, push the new `scene` and clear the banner. See `docs/decisions.md` ADR-13.

## IDs

Stable IDs matter for phase 2 round-trip; we set the rules now so MVP doesn't paint us into a corner.

- **Explicit `id` is required on addressable elements** - anything that can be referenced by `<Edge from="..." to="...">`.
- **Namespacing is a convention, not a compiler guarantee** - a reusable component takes an `ns` prop and interpolates it into its ids (`id={`${ns}-login`}`; the separator must not be `.`, which `<Edge>` `from`/`to` read as anchor syntax). ES `import` gives module reuse but no automatic id prefixing; `ir/duplicate-id` catches a collision and names the first definition's line. See `docs/decisions.md` ADR-12 (rule 2) and `docs/jsx-pivot.md` decision 11.
- **Anonymous IDs are allowed only for non-addressable visual elements** - e.g. a `<Note>` with no `id` (it cannot be referenced anywhere). The IR generates a synthetic ID for these.
- **Sibling reorder must not change IDs.** This is the test of the rule: a parser/IR refactor that changes IDs across reorder is a bug.
- **Renaming an `id` is a breaking change** for that element - phase 2 round-trip will reflect this.
- **Synthetic-id scheme**: `<content-hash>-<n>` where `n` is the 0-based index among elements with the same content-hash, in document order. Reordering siblings of differing content leaves all ids unchanged. See `docs/decisions.md` ADR-12.

## Source span model

Diagnostics carry source spans for editor + agent feedback:

```ts
type SourceSpan = { file: string; line: number; column: number; length?: number };
type Diagnostic = { severity: "error" | "warning"; code: string; message: string; span?: SourceSpan };
```

`code` is a stable identifier (e.g. `ir/missing-id`, `runtime/threw`) so agents can pattern-match. The CLI formatter renders these to the plain-text format.

Spans come from esbuild's `jsxDEV` transform: every JSX element compiles to a `jsxDEV(type, props, key, isStatic, source, self)` call where `source` is `{fileName, lineNumber, columnNumber}`, injected per element. The runtime component library stashes it as the node's `span`. No sourcemap walking for element spans; sourcemaps are used only to map a *thrown* error's top frame back to user code (`runtime/threw`). `span.file` is normalised at the `compileFile` boundary so it's expressed the same way the caller expressed `path` - relative in, relative out; absolute in, absolute out.

## `tldsl check` on non-`.tldsl.jsx` files

The `PostToolUse` hook fires on every `Write|Edit`. `tldsl check` exits 0 with no output for files that don't end in `.tldsl.jsx`. Don't pollute agent context with noise on unrelated edits.

## Glossary

- **DSL** - the `.tldsl.jsx` JSX authoring surface: plain JSX importing `Doc`, `Frame`, `Box`, `Note`, `Edge`, `flow` from `"tldsl"`, executed by the CLI to produce an AST.
- **AST** - close to surface syntax; the type is defined in `domain/parser/ast.ts` but produced by `runtime/` (via `jsx`/`jsxs`/`jsxDEV`), not by a parser, and consumed by `domain/ir/`.
- **IR** - normalized intermediate representation; IDs derived/validated, shorthand expanded. Lives in `domain/ir/`.
- **SceneJSON** - the scene payload pushed to the viewer (currently a pin of tldraw's scene-JSON shape). Lives in `contracts/scene-json.ts`.
- **Scene message** - the versioned envelope around SceneJSON on the wire. Lives in `contracts/scene-message.ts`.
- **Port** - an interface a layer depends on, owned by that layer. Has at least two adapters (real + fake).
- **Adapter** - a concrete implementation of a port; lives in `infra/`.
- **runtime** - the `"tldsl"` module (`src/runtime/`): the component library (`Doc`, `Frame`, `Box`, `Note`, `Edge`, `flow`) plus the `jsx`/`jsxs`/`jsxDEV` functions esbuild's automatic JSX transform targets. Bundled into the user's entry by `infra/execute-jsx/` and executed in a worker; not imported anywhere else.
- **ExecutePort** - `app/ports/execute.ts`; `(source, path) => Promise<{ ast; inputs } | { diagnostics }>`. Runs a `.tldsl.jsx` module and hands back its AST plus every file that contributed to the bundle. Real adapter: `infra/execute-jsx/` (esbuild bundle + `worker_threads`, hard `terminate()` at 2s). Fake: `FakeExecute`.
- **hybrid layout** - `domain/layout/stack.ts`'s `hybridLayout`: `row`/`col`/`grid`/`free` containers are placed deterministically bottom-up in the domain; only a container with `layout="auto"` calls ELK, on a flat graph of that container's already-sized direct children.

## Out of scope (do not build for MVP)

Tracked in `docs/roadmap.md`. Highlights:

- Componentised `absorb`: `tldsl absorb` exists and is human-invoked, but it only rewrites source for the overlay ops JSX can express exactly (added geo/note shapes, hard-pinned). Turning a flat pile of absorbed shapes into frames and components is a model's job, not the compiler's.
- `Group`, `<Shape>` kinds, `<Text>`, `<Line>`. (`<import>`/`<use>` is not on this list - ES `import` replaced it outright, not deferred.)
- Full 8-compass-point-plus-fractions anchor scheme; default-center is enough for MVP. (Named anchors and free endpoints are parsed and rejected today: `ir/anchor-not-supported`, `ir/free-endpoint-not-supported`.)
- Edge styling, head decorators, waypoints, edge labels.
- Domain bundles (`<Service>`, `<Decision>`).
- Mermaid as input.
- Drawings / freehand.
- Multi-page beyond what module composition gives.
- Comments-as-stickies - rejected outright (`{/* */}` is a JS comment, stripped before it ever reaches the runtime), not deferred.
