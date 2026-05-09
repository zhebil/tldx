# tldsl — Architecture Context

This document is the source of truth for the project's architecture: vocabulary, layers, dependency rules, and patterns. The `eslint`/`dependency-cruiser` configs (defined in `docs/lint-config.md`, wired by the bootstrap toolchain task) mechanically enforce what's described here. **If code disagrees with this doc, the code is wrong (or this doc is stale - update it deliberately).**

> Status note: this is pre-implementation. The lint rules described below are *designed to* fail CI from day 1; they actually take effect once `tldsl-iuk` (bootstrap toolchain) lands. No production code should be merged before that issue closes.

## What the application is

`tldsl` is a CLI + local viewer that turns a plain-text DSL into a live tldraw canvas. AI agents (Claude Code et al.) author `.tldsl` files with normal Edit/Write tools; a watcher recompiles on save and pushes scene JSON to a browser viewer. A one-shot `tldsl check` validates files and is wired into the agent's `PostToolUse` hook so syntax/layout errors land back in context.

## Scope split

There are three concentric scopes. **Every section below is MVP-scoped.** Phase 1 and phase 2 are tracked in `docs/roadmap.md`.

- **MVP (now):** the smallest slice that proves the thesis (file → live canvas, errors land in agent context within one tool turn).
- **Phase 1 (later):** full DSL feature surface from the original design (`<group>`, `<shape>`, `<text>`, `<line>`, `<import>`, `<use>`, 13 anchors, edge styling, comments-as-stickies).
- **Phase 2 (later):** round-trip from canvas back to DSL.

### MVP scope

- `tldsl serve <file>` and `tldsl check <file>`.
- Grammar subset: `<doc>`, `<box>`, `<note>`, `<edge>`, `<frame>`. No `<group>`, no `<import>`/`<use>`, no `<shape>` kinds, no edge styling beyond defaults, no comments-as-stickies.
- Layout: ELK auto-layout for `layout=auto`; `free` with hard pins (`x y`) supported. Other layout modes deferred.
- Anchors: default-center attach only. The 13-anchor scheme is phase 1.
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
              <port>.fake.ts. (FsReadPort, WatchPort, TransportPort, LogPort.)

domain/     Pure compiler core. No imports outside domain/ + contracts/.
  parser/     DSL text → AST.
  ir/         AST → normalized IR. Derives IDs, expands shorthand, applies
              MVP validation (e.g. <edge> endpoints reference real elements).
  layout/     IR → IR-with-positions. Calls the layout port.
  emit/       IR-with-positions → contracts/SceneJSON.
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
  log/          stdout/stderr logger. Implements LogPort.

contracts/  Wire types shared across layers. Imports NOTHING.
  scene-message.ts    Envelope pushed over the transport: { v, kind, payload }.
  scene-json.ts       The scene payload (currently a re-export/pin of tldraw's
                      scene-JSON shape; treated as our wire format).

viewer/     Separate Vite-built bundle. tldraw + transport client. Imports
            from contracts/ ONLY. Built into a static bundle that
            infra/devserver serves.
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
tests     → same rules as the code they test (no bypass)
```

Specifically:

- `domain/**` may not import `node:*`, `infra/**`, `app/**`, `cli/**`, `viewer/**`, or any third-party package that touches I/O. ELK is fine *only* via `domain/ports/layout.ts`; the real adapter lives in `infra/layout-elk/`.
- `app/**` may not import `node:*`, `infra/**`, `cli/**`, `viewer/**`. May import `app/ports/**`, `domain/**`, `contracts/**`.
- `infra/**` may import `app/ports/**`, `domain/ports/**`, `contracts/**`. May NOT import `app/!(ports)/**`, `cli/**`, `viewer/**`.
- `cli/**` is the wiring site. It may import everything except `viewer/**` (the viewer is a built artifact, not a TS dependency).
- `viewer/**` may import only `contracts/**`. No `cli`, `app`, `domain`, `infra`.
- `contracts/**` imports nothing - no node built-ins, no third-party packages, no internal modules.

## Boundaries

A boundary becomes a port only when **two adapters justify the seam** (real impl + fake, or real impl + alternative impl). Boundaries that don't vary are wired directly in `cli/`. Concretely for MVP:

| Boundary | Port? | Why / why not |
|---|---|---|
| Filesystem read | `app/ports/fs.ts` | Real (node:fs) + InMemoryFs fake. Use cases need it; tests need it instant. |
| Filesystem watch | `app/ports/watch.ts` | Real (chokidar) + controllable fake. Watcher tests need to drive events. |
| Layout engine | `domain/ports/layout.ts` | Real (elkjs) + StubLayout. Domain unit tests need determinism. |
| Viewer transport | `app/ports/transport.ts` | Real (SSE) + InMemoryTransport. App tests assert what got pushed. |
| Logger | `app/ports/log.ts` | Real (stderr) + CaptureLog. Use cases emit structured logs; tests inspect them. |
| Dev HTTP server | **No port** (impl in `infra/devserver/`). | One impl, no test variation - port abstraction is ceremony. CLI composes via `startDevServer(...)`; HTTP/SSE code stays in `infra/devserver/`. |
| Stdout / process exit | **No port.** | Use cases return values; `cli/` writes + exits. App layer never prints. |
| Clock | **No port for MVP.** | Add when `watchAndServe` introduces debounce; tracked in `tldsl-2lu`. |
| Random | **No port.** | IDs are deterministic (see below). |

**Per-use-case dependency structs** (no global Caps):

```ts
type CompileFileDeps   = { fs: FsReadPort; layout: LayoutPort };
type WatchAndServeDeps = { watch: WatchPort; fs: FsReadPort; layout: LayoutPort; transport: TransportPort; log: LogPort };
```

Each use case declares only what it needs. `compileFile` does not see a transport; `watchAndServe` does not see stdio.

## Transport choice

**SSE for MVP.** Push is one-way (CLI → viewer); SSE is simpler to reason about, no upgrade dance, native EventSource in the browser. Reconnect is built in. Websocket is reserved for phase 2 if round-trip needs bidirectional.

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

- **Explicit `id` is required on addressable elements** - anything that can be referenced by `<edge from="..." to="...">` or (later) `<use name="...">`.
- **Derived IDs are namespaced** - when imports land in phase 1, IDs from imported docs are prefixed by the `<import name="...">`. No collisions across imports.
- **Anonymous IDs are allowed only for non-addressable visual elements** - e.g. a `<note>` with no `id` (it cannot be referenced anywhere). The IR generates a synthetic ID for these.
- **Sibling reorder must not change IDs.** This is the test of the rule: a parser/IR refactor that changes IDs across reorder is a bug.
- **Renaming an `id` is a breaking change** for that element - phase 2 round-trip will reflect this.
- **Synthetic-id scheme**: `<content-hash>-<n>` where `n` is the 0-based index among elements with the same content-hash, in document order. Reordering siblings of differing content leaves all ids unchanged. See `docs/decisions.md` ADR-12.

## Source span model

Diagnostics carry source spans for editor + agent feedback:

```ts
type SourceSpan = { file: string; line: number; column: number; length?: number };
type Diagnostic = { severity: "error" | "warning"; code: string; message: string; span?: SourceSpan };
```

`code` is a stable identifier (e.g. `parser/unexpected-token`, `ir/missing-id`) so agents can pattern-match. The CLI formatter renders these to the plain-text format.

## `tldsl check` on non-`.tldsl` files

The `PostToolUse` hook fires on every `Write|Edit`. `tldsl check` exits 0 with no output for files that don't end in `.tldsl`. Don't pollute agent context with noise on unrelated edits.

## Glossary

- **DSL** - the `.tldsl` source language.
- **AST** - parser output; close to surface syntax. Lives in `domain/parser/`.
- **IR** - normalized intermediate representation; IDs derived/validated, shorthand expanded. Lives in `domain/ir/`.
- **SceneJSON** - the scene payload pushed to the viewer (currently a pin of tldraw's scene-JSON shape). Lives in `contracts/scene-json.ts`.
- **Scene message** - the versioned envelope around SceneJSON on the wire. Lives in `contracts/scene-message.ts`.
- **Port** - an interface a layer depends on, owned by that layer. Has at least two adapters (real + fake).
- **Adapter** - a concrete implementation of a port; lives in `infra/`.

## Out of scope (do not build for MVP)

Tracked in `docs/roadmap.md`. Highlights:

- Round-trip from canvas back to DSL.
- `<import>` / `<use>`, `<group>`, `<shape>`, `<text>`, `<line>`.
- Full 13-anchor scheme; default-center is enough for MVP.
- Edge styling, head decorators, waypoints, edge labels.
- Domain bundles (`<service>`, `<decision>`).
- Mermaid as input.
- Drawings / freehand.
- Multi-page beyond what import gives.
