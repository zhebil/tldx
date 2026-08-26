## Why

A project's diagrams live side by side in one directory (`docs/diagrams/`,
`examples/`), and looking at all of them means typing `tldx serve` once per
file. The server already holds many diagrams as pages in one tab - the only
thing missing is letting the command name the directory instead of each file.

## What Changes

- `tldx serve <dir>` serves every `*.tldx.jsx` file directly inside `<dir>` as
  its own page on one server in one browser tab, exactly as if `tldx serve` had
  been run once per file in sorted order.
- Directory scanning is one level deep. Subdirectories are not descended into,
  and files that do not end in `.tldx.jsx` (including `.overlay.json`
  sidecars) are skipped.
- A directory holding no `.tldx.jsx` file is an error: the command prints the
  directory it scanned and exits 1 without starting a server.
- Both paths grow the behaviour: the cold start (this process becomes the
  server) and the handoff (a server is already up, so each file is posted to
  it). A per-file compile failure still surfaces as that page's diagnostics and
  does not stop the rest of the directory being served.
- The browser tab, when one is opened, deep-links to the first diagram in
  sorted order.
- `README.md`, `docs/reference.md` and `plugin/skills/tldx/SKILL.md` document
  the directory form in their `tldx serve` usage lines.

Not breaking: `tldx serve <file>` is untouched.

## Capabilities

### New Capabilities

None. The behaviour is a new entry point into the existing shared-server
capability, not a new one.

### Modified Capabilities

- `serve/shared-instance`: adds a requirement covering a directory argument -
  which files are selected, their order, the empty-directory error, and that
  each selected file is served under the existing per-file rules (page key,
  watcher, overlay sidecar, idempotence, handoff).

## Impact

**Layers touched**: `cli` only.

**Ports crossed**: none. No port signature changes and no new port. The
directory listing happens in the composition root, which already reads the real
filesystem directly (`existsSync`, `statSync`, `realpathSync` in
`src/cli/main.ts`); `FsReadPort` has no `readdir` and does not grow one for a
single caller that is already outside the port boundary.

**Code**:

- `src/cli/serve-target.ts` (new) - resolve one CLI path argument to the list of
  files to serve, with its unit test.
- `src/cli/main.ts` - the `serve` command serves the resolved list: cold start
  on the first file then `addDiagram` for the rest, or handoff for each file
  when a server is live. `--no-open`/`--ttl` parsing is unchanged.
- Docs: `README.md`, `docs/reference.md`, `plugin/skills/tldx/SKILL.md`.

**Dependencies**: none added. `fs.readdirSync` is stdlib.

**Constraints**: `projectRootFor` and `pageKeyFor` take a file, not a
directory, so expansion happens before any registry call - the registry, the
transport and `watchAndServe` see exactly the files they see today.

## Non-goals

- Recursion into subdirectories, or a `--recursive` flag.
- Watching the directory for files added or removed after the server starts.
  Pages still only appear when a `serve` names them, and are still never
  removed.
- Glob arguments (`tldx serve 'docs/**/*.tldx.jsx'`) or multiple path
  arguments. Shell globbing plus repeated `serve` already covers that.
- A directory argument for `check`, `render`, `verify`, `absorb`, `measure` or
  `overlay`.
- Changing which page the viewer lands on beyond the existing deep link, or any
  ordering/grouping in tldraw's page menu.
- Making an empty or unreadable directory a warning instead of an error.
