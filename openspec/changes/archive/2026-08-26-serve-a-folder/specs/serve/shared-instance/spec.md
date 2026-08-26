## ADDED Requirements

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

## MODIFIED Requirements

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
