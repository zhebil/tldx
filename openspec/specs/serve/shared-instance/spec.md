## Purpose

Lets several diagrams from the same project share a single `tldx serve` process
and a single browser tab, so that serving a second diagram adds a page to the
running viewer instead of starting a competing server on another port.

## Requirements

### Requirement: Serving reuses a running server for the same project

`tldx serve <file>` SHALL determine the project root of `<file>` and reuse a
live server registered for that root. The project root is the nearest ancestor
directory of `<file>` containing `.git`; failing that, the nearest ancestor
containing `package.json`; failing that, the directory containing `<file>`.

A server is live when a registered record exists for the root and the process it
names is still running. Records naming a dead process SHALL be treated as
absent.

#### Scenario: First serve in a project

- **WHEN** no live server is registered for the file's project root
- **THEN** a new server starts, binds a port, and registers itself for that root
- **AND** the command stays in the foreground until interrupted or reaped

#### Scenario: Second serve in the same project

- **WHEN** a live server is registered for the file's project root
- **THEN** the file is handed to that server, which begins watching and
  compiling it
- **AND** the invoking command prints the server URL and the page name, and
  exits with status 0 without binding a port

#### Scenario: Serve in an unrelated project

- **WHEN** a live server exists for a different project root
- **THEN** it is not reused, and a new server starts for this root

#### Scenario: Registered process is gone

- **WHEN** a record exists for the root but names a process that is no longer
  running
- **THEN** the record is discarded and a new server starts

### Requirement: Each served diagram is an independent page

Each served file SHALL appear as one page in the shared viewer, identified by a
page key derived from the file's resolved path and stable for as long as the
path is unchanged. A diagram's compile, its watcher, and its `.overlay.json`
sidecar SHALL remain per file and SHALL NOT be affected by other diagrams
sharing the server.

#### Scenario: Two diagrams, two pages

- **WHEN** two files are served on one server
- **THEN** the viewer shows two pages, each named from that diagram's title or
  file name
- **AND** editing one file recompiles and updates only that page

#### Scenario: Canvas edits stay with their diagram

- **WHEN** a shape is moved on one page and the canvas edit is persisted
- **THEN** only that diagram's overlay sidecar is written
- **AND** no other diagram's shapes are recorded in it as changes or deletions

#### Scenario: Same-named diagrams

- **WHEN** two served diagrams resolve to the same page name
- **THEN** both are served as separate pages under that shared name, without
  error or automatic renaming

### Requirement: Re-serving an already-served file is a no-op

`tldx serve` on a file the live server already serves SHALL NOT add a second
page, restart the watcher, or disturb the running server.

#### Scenario: File already served

- **WHEN** a file already served by the live server is served again
- **THEN** the command reports that the file is already being served, names its
  page and the server URL, and exits 0

### Requirement: A viewer tab is opened when none is connected

Serving SHALL open a browser tab addressing the served diagram's page when no
viewer is currently connected to the server, and SHALL NOT open one when a
viewer is already connected. `--no-open` SHALL suppress opening in all cases.

When one invocation serves several diagrams, at most one tab SHALL be opened,
addressing the page of the first diagram in the order they were served.

#### Scenario: No viewer connected

- **WHEN** a diagram is served and no viewer is connected to the server
- **THEN** a browser tab is opened at a URL that selects that diagram's page

#### Scenario: Viewer already connected

- **WHEN** a diagram is served and a viewer is already connected
- **THEN** no browser tab is opened, and the connected viewer switches to the
  new page

#### Scenario: Opening suppressed

- **WHEN** `--no-open` is passed
- **THEN** no browser tab is opened regardless of whether a viewer is connected

#### Scenario: Several diagrams served at once

- **WHEN** one invocation serves several diagrams and no viewer is connected
- **THEN** exactly one browser tab is opened, addressing the first served
  diagram's page

### Requirement: The control endpoint is authenticated

The endpoint that adds a diagram to a running server, and the endpoint that
accepts canvas edits, SHALL both require a per-server secret issued when the
server starts and readable only by the user who started it. Requests SHALL be
rejected when the secret is missing or wrong, when the request declares a
cross-site origin, or when the body is not declared as JSON.

Rejection SHALL NOT reveal whether the file named in the request exists.

#### Scenario: Correct secret

- **WHEN** a request presents the server's current secret and a JSON body
- **THEN** it is accepted

#### Scenario: Missing or wrong secret

- **WHEN** a request omits the secret or presents a different one
- **THEN** it is rejected with 403 and has no effect on the server

#### Scenario: Cross-site request from a browser

- **WHEN** a request declares an origin other than the server's own
- **THEN** it is rejected regardless of the secret, and no file is compiled

### Requirement: Server lifetime is shared

The idle timeout SHALL apply to the server as a whole, not per diagram: any
activity from any viewer keeps every served diagram alive, and expiry ends the
server and all of its pages together. The timeout SHALL be fixed by the
invocation that started the server.

#### Scenario: Timeout requested on handoff

- **WHEN** a diagram is handed to a running server with a timeout option
- **THEN** the option is ignored, and the command reports the timeout already in
  force

#### Scenario: Idle expiry

- **WHEN** no viewer activity occurs for the configured timeout
- **THEN** the server exits, all pages disappear, and its registration is
  removed

#### Scenario: Owner interrupts the server

- **WHEN** the foreground invocation that started the server is interrupted
- **THEN** the server exits, taking every page with it, and its registration is
  removed

### Requirement: Diagrams are never removed from a running server

While a server runs, a page SHALL remain served once added. Deleting, renaming
or breaking the source file SHALL NOT remove its page.

#### Scenario: Source file deleted

- **WHEN** a served file is deleted from disk
- **THEN** its page remains in the viewer and the compile failure is reported as
  a diagnostic for that page

### Requirement: Rendering targets a specific diagram on a shared server

`tldx render` reusing a running server SHALL export the diagram named on its
command line, regardless of which page the viewer is currently showing, or fail
rather than export a different diagram.

#### Scenario: Render while another page is in view

- **WHEN** a diagram is rendered against a shared server whose viewer is
  currently showing a different page
- **THEN** the exported image is of the requested diagram

#### Scenario: Requested diagram is not served

- **WHEN** a render reuses a server that does not serve the requested file
- **THEN** the reuse is refused, and rendering falls back to a private server
  unless reuse was required, in which case it fails with a message naming the
  file

### Requirement: Concurrent first serves resolve to one server

Two `tldx serve` invocations racing to start the first server for a project root
SHALL result in exactly one running server, with the other invocation handing
its file to the winner.

#### Scenario: Two invocations race

- **WHEN** two invocations for the same project root both find no live server
- **THEN** exactly one of them starts and registers a server
- **AND** the other hands its file to that server and exits 0

### Requirement: Serving a directory serves every diagram directly inside it

`tldx serve <path>` SHALL accept a directory as well as a file. Given a
directory, the command SHALL select every entry directly inside it whose name
ends in `.tldx.jsx`, and SHALL serve each selected file exactly as if `tldx
serve` had been invoked once per file, in ascending order of file name.

Selection SHALL be one level deep: subdirectories SHALL NOT be descended into,
and an entry that is itself a directory SHALL NOT be selected even if its name
ends in `.tldx.jsx`. Any other file SHALL be ignored, including a diagram's
`.tldx.overlay.json` sidecar.

Every rule that already governs a served file - its page key, its watcher, its
compile, its `.overlay.json` sidecar, the no-op on re-serving, and the choice
between starting a server and handing off to a live one - SHALL apply
unchanged to each file selected from a directory. A directory argument SHALL
NOT introduce a page that no file backs.

#### Scenario: Directory of diagrams

- **WHEN** a directory containing several `.tldx.jsx` files is served
- **THEN** one server holds all of them, each as its own page named from that
  diagram's title or file name
- **AND** editing any one of those files recompiles and updates only its page

#### Scenario: Ordering

- **WHEN** a directory is served
- **THEN** its files are served in ascending order of file name

#### Scenario: Unrelated entries are ignored

- **WHEN** a served directory also holds files that do not end in `.tldx.jsx`,
  such as overlay sidecars, images or notes
- **THEN** none of them is served, and no page is created for them

#### Scenario: Subdirectories are not descended into

- **WHEN** a served directory holds a subdirectory containing `.tldx.jsx` files
- **THEN** only the `.tldx.jsx` files directly inside the served directory are
  served, and nothing from the subdirectory is

#### Scenario: Directory served while a server is already running

- **WHEN** a directory is served and a live server is already registered for
  its project root
- **THEN** every selected file is handed to that server, which begins watching
  and compiling the ones it did not already serve
- **AND** the invoking command reports where each file landed and exits with
  status 0 without binding a port

#### Scenario: Some files already served

- **WHEN** a served directory contains files the live server already serves
  alongside files it does not
- **THEN** the already-served files are reported as already served and gain no
  second page, and only the remaining files are added

#### Scenario: One diagram in the directory fails to compile

- **WHEN** one file in a served directory fails to compile
- **THEN** its page reports that diagram's diagnostics
- **AND** every other file in the directory is still served

### Requirement: A directory with no diagrams is an error

`tldx serve <dir>` on a directory holding no `.tldx.jsx` file directly inside
it SHALL fail: it SHALL NOT start a server, SHALL NOT add anything to a live
server, SHALL NOT open a browser tab, SHALL report the directory it scanned,
and SHALL exit with a non-zero status.

#### Scenario: Empty directory

- **WHEN** a directory containing no `.tldx.jsx` file is served
- **THEN** the command reports that the directory holds no diagram to serve,
  naming the directory, and exits non-zero
- **AND** no server is started and no live server is modified

#### Scenario: Only nested diagrams

- **WHEN** a served directory holds `.tldx.jsx` files only inside
  subdirectories
- **THEN** it is treated as holding no diagram, and the command fails as above
