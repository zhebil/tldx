## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `docs/architecture.md` fixes the layering: `runtime` → `domain` → `app` →
  `infra`/`cli`/`viewer`, with `contracts` as a dependency-free wire surface.
  The rules are lint-enforced in `.oxlintrc.json` and each boundary is proved by
  `tests/tools/lint-boundaries.test.ts`. The binding one here:
  **`src/viewer/**` may import only `src/contracts/**`** - the viewer cannot
  reach domain helpers.
- `emit` produces a self-contained scene rooted at the constant page
  `page:main`, with shape ids `shape:<irId>` taken from author-supplied `id`
  props. Two diagrams that both declare `<Box id="api">` therefore produce the
  same record id.
- Overlay sidecars (`.overlay.json`) are keyed by those record ids. Anything
  that changes emitted ids invalidates every overlay on disk and breaks
  `render` and `absorb` with it.
- `TransportPort` currently retains one `last` message and replays it to each
  new subscriber. Its contract suite runs against the fake and the SSE adapter
  both, so the fake and adapter change together or the suite fails.
- The dev server binds `127.0.0.1`, which excludes the LAN but not the browser:
  any page can `fetch()` a loopback URL, and the response being unreadable
  cross-origin does not undo the side effect.

## Goals / Non-Goals

**Goals:**

- Keep a compiled diagram a single-page artifact everywhere except the shared
  viewer, so overlays, `render`, `absorb` and every domain test are unaffected.
- Keep the merged multi-page document in exactly one place - the browser's
  tldraw store - rather than maintaining it server-side as well.
- Confine the security surface to two endpoints and one shared secret.

**Non-Goals** (design-level; see `proposal.md` - Non-goals for scope):

- Server-side composition of a multi-page document.
- Any persistence of page state beyond the server's lifetime.
- Per-client (per-tab) message addressing on the transport.

## Decisions

### Namespacing happens at the boundary, not in `emit`

Shape and page ids are prefixed with the diagram's page key on the way out of
the server, and the prefix is stripped before the overlay diff. `emit` never
learns that pages exist.

The alternative - passing a diagram key into `emit` so it produces
`shape:<key>_<irId>` directly - keeps ids in one place, but makes the prefix a
property of the compiled artifact: every existing `.overlay.json` stops matching,
and the key derivation becomes a permanent compatibility surface (change it and
every sidecar breaks again). Namespacing is a presentation concern of the shared
viewer, so it lives at the presentation boundary.

The transforms are pure record-map rewrites with a round-trip property, so they
live in `domain/` as plain functions.

### Page key is `sha256(realpath).slice(0, 8)`

Stable per file, collision-free in practice, and it reuses the hashing the
registry already performs. A readable slug (`#page=web-architecture`) was
considered and rejected: slugs collide across directories, and they change when
a diagram is retitled, silently orphaning the URL. The readable name already
exists where it matters - the page menu, via `<Doc title>`.

### The viewer merges; the server pushes slices

Each push carries one diagram's scene, namespaced. The viewer puts the records
and removes the store records that share the page's id prefix but are absent
from the push. Prefix matching is why the viewer needs no domain code.

Rejected: server-side merge plus `loadSnapshot` of the whole document on every
push. `loadSnapshot` is a full document replace, so a keystroke in one diagram
would reload every page - the failure mode that makes a shared tab worse than
separate tabs.

Slices carry only the page record and its shapes. The `document:document`
singleton and the `schema` block are dropped: N scenes each carrying a document
record would overwrite each other, and `schema` exists so `loadSnapshot` can
migrate an old snapshot, which cannot arise when emitter and viewer are the same
build. tldraw's own default page is deleted when the first real page arrives,
since incremental puts no longer replace it.

### Transport keys its replay by page

`TransportPort.push` takes a page key and the transport keeps
`Map<pageKey, SceneMessage>`, replayed in insertion order on connect. A single
`last` would mean a browser reload restores exactly one page.

This is the smallest change that keeps the transport dumb: it stays a fan-out
with a replay buffer and never learns what a scene is. The alternative - a
`GET /diagrams` snapshot endpoint the viewer fetches on connect - adds a second
code path for state SSE already carries.

### One registry record per server, claimed before binding

`tmpdir/tldx-serve/<sha256(projectRoot)>.json` holds
`{pid, url, token, codeFingerprint, diagrams: {<realpath>: {pageKey, hash, compiledAt}}}`.
One writer - the server process - answers all three lookups (is a server up, what
page key does this file have, what is the token) in one read.

Two details are load-bearing:

- **Atomic write** via temp file + `rename()`. The current recovery path deletes
  a corrupt record; with one record per server, a torn write would otherwise
  discard discovery info for every diagram at once.
- **`wx` claim before binding.** Two `serve` invocations racing both see no
  record, both bind, both write, and the loser becomes an orphan server holding
  a live tab. Creating the record with exclusive-create _before_ binding makes
  the first writer the owner; the loser takes the handoff path it should have
  taken anyway.

Per-file records and per-server records side by side were rejected as two files
to keep consistent, duplicating url and token into every diagram entry.

### Project root by filesystem walk

Nearest ancestor with `.git`, else nearest with `package.json`, else the file's
directory. A plain `fs` walk rather than `git rev-parse --show-toplevel`: no
subprocess, and it handles a worktree's `.git` file as well as a directory.
`src/infra/git/` shells out for `gitStatus`, but that is not a reason to pay for
a second subprocess here.

### Shared secret plus origin check on both write endpoints

`POST /diagrams` makes the server compile and execute an arbitrary path -
arbitrary code execution by design. Combined with loopback being reachable from
any browser tab, an unauthenticated endpoint is drive-by RCE for anyone with a
server up. A `crypto.randomUUID()` in the registry record (readable only by the
user who owns the temp file), sent as a header and compared with `===`, plus
rejection of cross-site `Origin` and non-JSON content types.

The same gate goes on `PUT /overlay`, which is unauthenticated today and lets
any page write to a file in the user's repo. Splitting that fix into its own
change would mean knowingly shipping the hole for another cycle, and it is the
same three lines in the same handler.

Deliberately excluded: TLS, per-request nonces, rate limiting, sessions. This is
one secret compared with `===`.

### Rendering waits on page identity, not on shapes

`tldx render` reusing a shared server navigates to the page-addressed URL and
waits for the editor's current page to be the expected one _before_ waiting for
shapes to attach. Waiting on `[data-shape-id]` alone is satisfied by whichever
page is showing, which on a shared server may be a different diagram. This also
closes a latent race in the single-page path, where the selector can attach
mid-load.

### `watchAndServe` stays per diagram

One instance per file, held in a map on the server, each with its own watcher,
overlay path and last-compiled scene. No new orchestration concept: the server
owns a map of the thing that already exists, and the per-file behaviour it pins
is untouched.

## Risks / Trade-offs

- **Shared fate.** The foreground terminal that started the server owns every
  diagram; Ctrl-C there kills pages other terminals added. → Handoff prints
  which terminal owns the server, and log lines are tagged with the page key so
  output from a diagram you did not start is identifiable.
- **Prefix round-trip is now correctness-critical.** A bug in strip-before-diff
  writes another diagram's shapes into a sidecar, i.e. corrupts source-adjacent
  files. → Round-trip property test in `domain/`, plus the app-level test that a
  recompile of one diagram leaves the other's overlay untouched.
- **Incremental merge loses `loadSnapshot`'s guarantees.** Stale-record removal
  is now our code; a scoping bug leaves ghost shapes or deletes a live page's
  records. → Page-scoped removal is a pure function tested in the viewer, and
  the e2e renders both pages after two serves.
- **Auth token in a temp file.** Anyone able to read the user's temp dir can
  drive the endpoint. → That is already the user's own trust boundary; the
  threat being closed is the browser, which cannot read the file.
- **Pages accumulate.** Nothing removes a page in v1, so a long-lived server
  collects pages for diagrams no longer of interest, and deleting a page from
  the menu is undone by the next save of that source. → Accepted; the idle TTL
  reaps the server, and page removal is a follow-up.
- **All tabs jump on page add.** With several viewers open, adding a diagram
  moves all of them. → Accepted rather than building per-client addressing.
- **`--ttl` on handoff is silently inapplicable.** → Reported explicitly rather
  than ignored quietly.

## Migration Plan

No data migration. Registry records live in the OS temp dir and die with the
process, so old-format records are simply not found and the caller starts a
server - which is the correct behaviour anyway. No compatibility shim is
written.

Overlay sidecars, compiled scenes and `.tldx.jsx` sources are unchanged by
design; a user who never runs two `serve` commands sees no difference beyond the
new deep-link fragment in the opened URL.

Rollback is reverting the change: nothing on disk outside the temp dir differs.
