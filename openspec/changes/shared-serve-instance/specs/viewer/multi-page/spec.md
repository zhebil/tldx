## Purpose

Defines how the viewer presents several independently compiled diagrams as pages
of one tldraw document, so that a shared server's diagrams coexist in a single
tab without interfering with each other's canvas state or error reporting.

## ADDED Requirements

### Requirement: Updates apply to one page at a time

An update for a diagram SHALL replace that diagram's shapes and leave every
other page's contents untouched. Records belonging to the updated page that are
absent from the update SHALL be removed.

#### Scenario: Recompiling one diagram

- **WHEN** an update arrives for a page while other pages are loaded
- **THEN** only that page's shapes change
- **AND** other pages keep their shapes exactly as they were

#### Scenario: Shape deleted from a source file

- **WHEN** a shape is removed from a diagram's source and it recompiles
- **THEN** the shape disappears from that page
- **AND** no shape disappears from any other page

#### Scenario: Viewing state survives an update

- **WHEN** a page other than the one in view is updated
- **THEN** the viewed page's camera position and selection are unchanged

### Requirement: The viewer shows only real diagram pages

The viewer SHALL show one page per served diagram and no others. Any page the
editor creates for itself before the first diagram arrives SHALL NOT remain
visible.

#### Scenario: First diagram loads

- **WHEN** the first diagram's page is added to an empty viewer
- **THEN** the page menu lists exactly that one page

### Requirement: Adding a diagram brings it into view

When a page is added, the viewer SHALL switch to it. An update to an existing
page SHALL NOT change which page is in view.

#### Scenario: New page added while viewing another

- **WHEN** a new diagram is served and its page arrives
- **THEN** the viewer switches to the new page

#### Scenario: Background page recompiles

- **WHEN** a page other than the one in view is updated
- **THEN** the viewer stays on the page it was showing

### Requirement: A page can be addressed by URL

The viewer SHALL accept a page identifier in the URL and select that page on
load. An identifier naming no live page SHALL be ignored rather than treated as
an error.

#### Scenario: Loading a page-addressed URL

- **WHEN** the viewer is loaded at a URL naming a live page
- **THEN** that page is the one shown, whichever page was updated most recently

#### Scenario: Unknown page identifier

- **WHEN** the URL names a page that is not served
- **THEN** the viewer loads normally showing an available page, without an error

### Requirement: Diagnostics are reported per page

A compile error SHALL be shown only while its own page is in view, and SHALL
persist there until that diagram compiles successfully. A successful compile of
one diagram SHALL NOT clear another diagram's diagnostics.

#### Scenario: Error on a page not in view

- **WHEN** a diagram fails to compile while another page is in view
- **THEN** no error is shown over the viewed page

#### Scenario: Switching to a broken page

- **WHEN** the viewer switches to a page whose last compile failed
- **THEN** that page's diagnostics are shown

#### Scenario: Another diagram compiles successfully

- **WHEN** one diagram compiles successfully while another remains broken
- **THEN** the broken diagram's diagnostics are still reported for its page

#### Scenario: Broken page keeps its last good render

- **WHEN** a diagram fails to compile
- **THEN** its page still shows the last successfully compiled shapes beneath
  the reported diagnostics

### Requirement: Reconnecting restores every page

A viewer connecting or reconnecting to a server SHALL receive the current state
of every served diagram, not only the most recently updated one.

#### Scenario: Reloading the tab

- **WHEN** the viewer is reloaded while several diagrams are served
- **THEN** every served diagram is present as a page

### Requirement: Canvas edits are attributed to their page

A canvas edit SHALL be reported to the server as an edit to the page it occurred
on, carrying only that page's contents.

#### Scenario: Editing a shape on one page

- **WHEN** a shape is moved on one page of a multi-page document
- **THEN** the server receives that edit attributed to that page only
