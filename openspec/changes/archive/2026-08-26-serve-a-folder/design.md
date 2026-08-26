## Context

See proposal.md - Why. What matters here is that the hard part is already
built: `runServe` holds a `Map` of diagrams and exposes `addDiagram(file)`, and
`handOff(record, file)` posts one file to a live server. A directory argument
is therefore an argument-expansion problem in `src/cli/main.ts`, not a new
serving mechanism.

Two constraints shape the approach:

- `projectRootFor(file)` and `pageKeyFor(file)` take a file. Handing either a
  directory gives a wrong answer silently - `projectRootFor` would start its
  walk one level too high. So expansion must happen before any registry call.
- `FsReadPort` has no `readdir`, and `src/cli/main.ts` is the composition root:
  it already calls `existsSync`, `statSync` and `realpathSync` directly.

## Goals / Non-Goals

**Goals:**

- One code path downstream of expansion: after it, the CLI only ever deals in a
  non-empty list of files.
- The single-file invocation stays byte-identical in behaviour and output.
- The empty-directory failure happens before a port is bound or a claim taken.

**Non-Goals:**

- Teaching `runServe`, the registry, or the transport anything about
  directories. They keep seeing files only.
- Adding `readdir` to `FsReadPort`. See Decisions.
- A directory argument for the other subcommands (proposal Non-goals).

## Decisions

**Expand in the composition root, not behind a port.** A new
`src/cli/serve-target.ts` exports one function that maps the CLI's path
argument to `string[]`: a lone file stays a one-element list, a directory
becomes its sorted `.tldx.jsx` children. It uses `node:fs` directly, matching
`main.ts`'s existing use.

_Alternative rejected_: add `readdir` to `FsReadPort` and expand in `app/`.
That grows a port, its fake, and its contract suite for one caller that already
sits outside the port boundary, and buys nothing - there is no app-layer or
domain logic here to test against a fake.

_Alternative rejected_: teach the server to accept a directory over
`POST /diagrams`. That puts directory scanning on the far side of a trust
boundary and makes the endpoint's contract ambiguous, to save the client a
loop.

**Sort by file name, ascending, with a plain code-unit comparison.** Order has
to be deterministic so the deep-linked first page and the test assertions are
stable. `readdirSync` order is not. A locale-aware collator would make the
order depend on the machine.

**The first file boots the server; the rest go through `addDiagram`.** The
cold-start path already calls `addDiagram` once for its own file; serving the
rest is the same call in a loop, inside the same process, before
`awaitShutdown`. The claim, the port bind and the browser open all key off the
first file, which is what makes the deep link land on it.

**Handoff loops over `handOff` per file, sequentially.** `POST /diagrams` is
idempotent per file and the server serialises nothing that a parallel post
would speed up meaningfully; sequential keeps the printed lines in served
order. The tab-open decision uses the _first_ response's `hasViewer`, so a
directory of ten diagrams opens at most one tab.

**A per-file failure during expansion-driven serving does not abort the rest.**
Compile failures already surface as that page's diagnostics rather than as a
throw, so this only concerns `addDiagram`/`handOff` rejecting outright (an
unreadable file, a refused post). Those are reported per file and the loop
continues; the command's exit code is non-zero if any file failed, zero
otherwise. Aborting halfway would leave a partially-served directory with no
way to name what was missing.

**Empty directory is an error, not a no-op.** `tldx serve docs/` that silently
does nothing and exits 0 looks like a bug in the diagram, not in the argument.
The check runs in the expansion function, before `findServer`/`claimServer`.

## Risks / Trade-offs

- **A large directory boots slowly**: each diagram is compiled at add time, so
  `serve` on twenty diagrams pays twenty compiles before the tab is useful.
  → Not mitigated. The tab deep-links to the first diagram, which is added
  first, and the remaining pages appear as they compile. Parallel compiles are
  a separate change if this ever hurts.
- **Watching a directory of diagrams costs more watchers**: one per file, as
  today. → Unchanged per file; only the count grows, and the user chose it.
- **Files added to the directory after boot are invisible**: the user has to
  re-run `serve`. → Documented, and an explicit non-goal. `serve` on the
  directory again is idempotent for the files already served, so the fix is
  cheap.
- **A path that is not a directory** (a missing file, a broken symlink):
  expansion passes it straight through as a one-element list, so `tldx serve
missing.tldx.jsx` still starts a server whose page carries the compile
  diagnostic, exactly as today. Turning that into an up-front error would be a
  behaviour change outside this change's specs. → Pinned by a unit test so it
  cannot drift.

## Migration Plan

None. Additive: no flag, no config, no stored state changes shape. `tldx serve
<file>` is unaffected, so there is nothing to roll back beyond reverting the
commit.
