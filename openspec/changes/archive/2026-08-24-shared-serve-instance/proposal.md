## Why

Every `tldx serve` boots its own dev server, its own browser tab and its own
watcher. Working on a handful of diagrams at once means a handful of ports, a
handful of tabs, and no way to flip between two diagrams that belong to the same
system. One server per project, with each diagram as its own tldraw page, turns
that into one tab and one page menu - which is only worth doing now that pages
carry a readable name (`<Doc title>`, PR #24).

## What Changes

- `tldx serve <file>` finds a running server for the same project root and hands
  its file over instead of booting a second one; the handing-off process exits 0
  and the diagram appears as a new page in the existing tab.
- The first `tldx serve` stays in the foreground and owns every watcher, compile
  and log line for the server. No daemon.
- A diagram is one page: its own watcher, its own compile, its own
  `.overlay.json` sidecar. `emit` is untouched and still produces a standalone
  `page:main` scene; page namespacing happens at the boundary and is reversed
  before the overlay diff.
- **BREAKING (internal)**: `TransportPort.push` gains a page key, and the SSE
  transport replays the last message _per page_ instead of one global last
  message. Port contract and fake both change.
- **BREAKING (internal)**: the serve registry becomes one record per server
  (keyed by project root) holding a diagram map, replacing one record per file.
  No compatibility shim - the records live in the OS temp dir and die with the
  process.
- The viewer merges page slices into a live store instead of replacing the
  document, keeps diagnostics per page, jumps to a page when it is added, and
  honours a `#page=<key>` deep link.
- `tldx render` targets its page explicitly before reading shapes, which also
  closes a latent race in the current single-page path.
- Security: `POST /diagrams` and the existing `PUT /overlay` are gated on a
  per-server token plus a cross-site `Origin` rejection. `PUT /overlay` is
  unauthenticated today, and 127.0.0.1 does not stop a browser tab from posting
  to it.

## Capabilities

### New Capabilities

- `serve/shared-instance`: discovery and handoff between `tldx serve`
  invocations, the per-server registry record, the authenticated control
  endpoint, page-key assignment, server lifecycle and TTL ownership, and how
  `tldx render` reuses a shared server for a specific diagram.
- `viewer/multi-page`: how the viewer composes several diagrams into one tldraw
  document - page-slice merging, page-scoped diagnostics, page selection on add,
  and the `#page=` deep link.

### Modified Capabilities

None. This is the first change in the project; `openspec/specs/` is empty, so
both capabilities above are new.

## Impact

**Layers touched**: `domain`, `app`, `infra`, `cli`, `viewer` - every layer
except `runtime` and `contracts`.

**Ports crossed**:

- `app/ports/transport.ts` - `push` gains a page key. `transport.contract.ts`
  and `transport.fake.ts` change together; the contract suite runs against the
  fake and the SSE adapter both.
- `app/ports/watch.ts`, `app/ports/fs.ts`, `app/ports/execute.ts`,
  `app/ports/clock.ts` - used per diagram rather than once per process. No
  signature change.

**Code**:

- `src/domain/` - new pure page-namespacing module (`namespaceScene` /
  `denamespace` / page-slice helpers). Nothing else in domain changes;
  `emit`, `overlay` and `absorb` keep their single-diagram contract.
- `src/app/` - `watchAndServe` becomes one instance per diagram behind a
  registry of watchers; per-page pushes.
- `src/infra/serve-registry/` - record shape, atomic write, `wx` claim, token.
- `src/infra/devserver/` - `POST /diagrams`, token + `Origin` gate on it and on
  `PUT /overlay` (which grows a page key).
- `src/infra/transport/` - per-page `last` map.
- `src/infra/render/` - page-targeted wait before the shape wait.
- `src/cli/serve.ts`, `src/cli/main.ts`, `src/cli/render.ts` - handoff path,
  project-root resolution, deep-link open, `--ttl` ownership.
- `src/viewer/` - incremental merge replacing `loadSnapshot`, per-page
  diagnostics, hash routing, page jump.

**Dependencies**: none added. `crypto.randomUUID` and `fs.rename` are stdlib.

**Constraints**: `src/viewer/**` may only import `src/contracts/**`
(`.oxlintrc.json`, proved by `tests/tools/lint-boundaries.test.ts`), so the
viewer cannot use the domain namespacing helpers and merges by id prefix
instead.

## Non-goals

- A background daemon, or any `tldx serve` that does not block the first
  terminal.
- Removing a page: no drop message, no `--stop`, no unlink handling. Pages live
  until the server exits or the idle TTL reaps it.
- Per-page TTL. The reaper stays server-wide.
- Readable/slug deep links. The page key is a hash.
- Cross-version scene migration. Emitter and viewer ship from the same build.
- Per-client addressing - every open tab reacts to every page add.
- Badging or otherwise modifying tldraw's pages menu.
