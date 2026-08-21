# Round-trip: overlay plus absorb

Settles the details left open by the Phase 7 architecture in `docs/plan.md`.
That architecture is not re-argued here. Three layers, one human-invoked step:

1. `x.tldsl.jsx` - the program. Authoritative for everything it declares.
2. `x.tldsl.overlay.json` - the user's canvas edits, keyed by record id.
3. **Render = `apply(overlay, compile(jsx))`.** Pure, total, deterministic.
4. `tldsl absorb <file>` - a model rewrites the JSX so that compiling it alone
   reproduces the current render, then empties the overlay.

Prior art read first: `docs/decisions.md` ADR-13 (last-good scene), ADR-12 (id
rules), ADR-9 (two CLI modes). This doc proposes ADR-14; the ADR entry lands
with T20, not with this doc.

This is a design document. **No code was written for it.** Every section below
is a decision with a reason, and the last section says what is out of scope.

---

## D1. The overlay is a final-state map keyed by record id

**Decision.** One JSON file per diagram, `x.tldsl.overlay.json`, beside the
source. Its `entries` map is keyed by the *tldraw record id as it appears in
the compiled scene store* - `shape:checkout`, `binding:abc123` - and each entry
holds the **final** value of each field the user changed, never a delta and
never a sequence.

```jsonc
{
  "v": 1,
  "basedOn": "a1b2c3d4",
  "entries": {
    "shape:checkout": {
      "moved": { "x": 320, "y": 96, "w": 220, "h": 96, "rotation": 0,
                 "parentId": "shape:web", "index": "a3" }
    },
    "shape:pay":    { "restyled": { "color": "red", "fill": "solid" } },
    "shape:ship":   { "relabelled": "Ship it, eventually" },
    "shape:legacy": { "deleted": true },
    "shape:abc123": { "added": { "id": "shape:abc123", "typeName": "shape",
                                 "type": "geo", "...": "verbatim tldraw record" } }
  }
}
```

An entry may carry several ops at once: a shape that was dragged *and* recoloured
is one entry with `moved` and `restyled`. Ops are fields, not rows.

**Why not an event log.** A log has to be replayed, replay is order-dependent,
and every op has to be defined against a scene that may since have changed
underneath it. A final-state map has none of that: applying it twice gives the
same answer as applying it once, and an entry can be read, hand-edited or
deleted by a human without simulating anything.

**Keyed on the record id, not the author id.** `shape:checkout` already
contains the author's `checkout`, because `emit/` prefixes rather than renames
(`src/domain/emit/emit.ts`). Keying on the record id means `apply` needs no
lookup table and the viewer needs no knowledge of the DSL - it reports the id
tldraw handed it.

### What a canvas gesture maps to

| Gesture | Entry field | Value |
|---|---|---|
| drag a shape | `moved` | full placement: `x`, `y`, `w`, `h`, `rotation`, `parentId`, `index` |
| resize, rotate | `moved` | same field - tldraw writes the same record fields |
| drag a shape into/out of a frame | `moved` | same field; `parentId` changes |
| bring to front / send back | `moved` | same field; `index` changes |
| change colour, fill, dash, label colour, align, font, size | `restyled` | a partial props patch in the **tldsl style vocabulary** |
| edit a label | `relabelled` | plain string |
| delete a shape | `deleted` | `true` |
| draw a new shape or arrow | `added` | the tldraw record, verbatim |

**`moved` carries the whole placement, not just position.** Translate, resize,
rotate and reparent all write the same handful of fields on the same record;
splitting them into four op names would buy nothing and would need reassembling
at apply time. The name is the one the plan gave it.

**`restyled` is expressed in tldsl's own style vocabulary** - the enums in
`src/domain/ir/styles.ts` (`COLORS`, `FILLS`, `DASHES`, `TEXT_ALIGNS`, `FONTS`,
`FONT_SIZES`, `ARROWHEADS`). Those tuples are copies of tldraw's own style
values, so one patch is simultaneously a valid tldraw props patch *and* a valid
set of JSX props. That is what makes restyle nearly mechanical for absorb: it
is a rename from `{ color: "red" }` to `color="red"`, not a translation. A prop
the user changed that is not in that vocabulary is **not** silently dropped -
see D3.

**`relabelled` is a plain string, not tldraw rich text.** Geo and note shapes
carry `props.richText`; arrow labels carry `props.text`. Keeping the overlay in
plain strings means `apply` reuses the same label-writing helper `emit/` uses,
so the rich-text representation stays in exactly one place, and a human reading
the overlay sees `"Ship it"` rather than a document tree. The cost is that
per-run formatting inside a label cannot be represented; nothing in the DSL can
express that either, so nothing is lost that could round-trip anyway.

**`added` stores the record verbatim.** tldraw already produced a valid record;
copying it is total and lossless, and it is the only op that has to survive
shape types the DSL cannot express. `added` entries may therefore be keyed by
any record id, not only `shape:` - a hand-drawn arrow contributes one `shape:`
record and two `binding:` records, all three as separate `added` entries.

### What `apply` does, in order

`apply(overlay, scene) -> { scene, diagnostics }`, pure, in `domain/`.

1. Start from the compiled store.
2. Merge every `added` record.
3. Apply `moved`, `restyled`, `relabelled` field-wise onto the records they name.
4. Apply `deleted` last, cascading: a deleted shape also removes arrows bound to
   it, those bindings, and any child whose `parentId` was the deleted shape.
   Without the cascade the store is left dangling and tldraw repairs it
   unpredictably at load.
5. Return the store plus a diagnostic per unresolved entry.

**`apply` never re-runs layout.** It is a patch over the finished scene, not an
input to the layout engine. This is the invariant that makes the render
reproducible: `compile` is deterministic, `apply` is a pure function of its two
arguments, so reloading recomputes the same store from the same inputs. It also
means a `restyled` that changes `font` or `size` will leave a box sized by the
old metrics until the user drags it or absorbs. That is accepted: re-running
layout under an overlay would make the overlay an input to the thing it is
patching, and the fixed point is not guaranteed to exist.

**Precedence is field-wise, not record-wise.** A `moved` on a box does not
freeze its label; a later JSX edit to that label still shows through.

---

## D2. Staleness: confirmed, with one wrinkle the plan did not name

**Decision.** Confirmed as proposed. `basedOn` is a hash of the compiled scene
the overlay was recorded against. `apply` **never refuses to run and never
silently drops an entry**: it applies every entry that resolves, and emits one
diagnostic per entry that does not, naming the id and the op. `basedOn`
mismatching only changes the wording of the diagnostic ("recorded against a
different compile of this file"), never the behaviour.

`apply` is pure and writes nothing, so orphaned entries stay in the file. Only
`absorb` and `reset` ever remove an entry. An orphan is therefore recoverable:
rename the id back in the JSX and it resolves again.

**The hash is computed server-side, not in the browser.** `basedOn` is stamped
by the process that writes the overlay file, from the scene it just compiled.
The viewer may only import `contracts/`, and duplicating a hash function across
the layer boundary to have the browser compute something the server already
knows is exactly the kind of seam that drifts. Reuse `contentHash` from
`src/domain/ir/synthetic-id.ts` (FNV-1a 32-bit) over the store's record ids in
sorted order.

**The wrinkle: synthetic ids are content hashes.** ADR-12 gives anonymous
elements ids of the form `<content-hash>-<n>`. So editing an unlabelled
`<Note>`'s text changes its id, and any overlay entry against it orphans -
correctly, by the letter of the rule, but surprisingly, because the user
perceives one note that they edited rather than a delete plus an add. Nothing
is done about it here beyond making the diagnostic say so; the honest fix is
for the author to give the note an explicit `id`, which is what ADR-12 already
recommends for anything that needs to be addressable. Noted so that whoever
sees the first confusing orphan report does not re-derive it.

---

## D3. Ids for added shapes, and the things next to that question

**Decision.** A canvas-added shape keeps its tldraw id (`shape:abc123`)
verbatim, in the overlay, for as long as it lives in the overlay. The overlay
never renames anything. Renaming is absorb's job, once, when the shape becomes
JSX.

Three further decisions the plan's bullet implies:

- **Collision with a compiled id is an error, not an overwrite.** An author may
  legitimately write `id="abc123"`. If an `added` record's id already exists in
  the compiled store, `apply` skips that add and emits a diagnostic. Compiled
  output is never overwritten by an add - only `moved`/`restyled`/`relabelled`
  may modify a compiled record, and those are edits by construction.
- **Absorb renames references, not just the declaration.** Renaming
  `shape:abc123` to `id="retry-queue"` has to rewrite every `<Edge from/to>`
  that names it, and any `added` binding still in the overlay that points at it.
- **The ugly id is visible to the user and that is fine.** It appears in
  diagnostics and in `tldsl overlay show`. Prettifying it would mean inventing a
  second naming scheme that absorb then has to undo.

---

## D4. Precedence, and the way out

**Decision.** The overlay wins over layout. That is the point of it, and there
is no conflict-resolution policy to design: if the JSX and the overlay disagree
about a field, the overlay's value is rendered, full stop. Because the overlay
can therefore mask a JSX edit indefinitely, the escape hatches are part of the
design rather than a convenience:

- `tldsl overlay show <file>` - list every entry, its ops, and whether it
  currently resolves. Already named as missing in the plan's command table.
- `tldsl reset <file>` - drop the whole overlay.
- `tldsl reset <file> --id <recordId>` - drop one entry.

**`reset` moves the old overlay to `x.tldsl.overlay.json.bak` (overwritten each
time) rather than prompting.** The overlay is the only copy of work the user did
by hand; a prompt is not available to a hook or a script, and an unrecoverable
delete of hand-drawn shapes is a bad default. One backup file is the smallest
thing that makes the command safe to run without thinking.

**A never-absorbed overlay is a resting state, not a pending migration.**
Nothing expires it, nothing nags about it, and `check` does not warn about one.

Two consequences for T20 worth writing down now:

- **The viewer writes the overlay over a plain `PUT /overlay`, not a websocket.**
  The dev server today answers `GET`/`HEAD` and 405s everything else
  (`src/infra/devserver/dev-server.ts`); SSE stays one-way and `TransportPort`
  is unchanged. CONTEXT.md reserved a websocket for round-trip "if it needs
  bidirectional" - it does not. One route is less machinery than a second
  transport.
- **`serve` does not watch the overlay file.** It reads it at start and on each
  recompile. If the watcher also watched it, the viewer's own write would push a
  fresh scene back and stomp the canvas the user is editing, and suppressing
  self-originated writes needs the server to track what it just wrote. Reading
  it at compile time is enough for every path that matters; an external change
  (`reset`, `absorb`) is picked up on the next compile or a browser reload.

**ADR-13 is unaffected.** On compile error there is still no `scene` push and
the viewer keeps the last good render. The overlay lives on disk and is keyed by
id, so a failed compile neither invalidates it nor loses it.

---

## D5. What absorb may not do

Absorb rewrites source with a model in the loop. It is allowed to be imperfect
because it is reviewed - which only holds if the review is actually possible.
The guardrails exist to protect that, and are not negotiable per-invocation
except where a flag is named.

- **Never write to a file with uncommitted changes** without saying so. Default
  is to refuse and print what is dirty; `--force` proceeds. If the file is not
  in a git repository at all, write `x.tldsl.jsx.bak` first and say so on
  stderr - a rewrite with no diff to read is not reviewable.
- **Always leave a reviewable diff.** Never reformat, never reorder or rewrap
  unrelated JSX, never touch imports it did not need to touch, never drop or
  rewrite comments. The diff should be readable as "these shapes moved into the
  source", not as a reformat with the change buried in it.
- **Never touch a file it was not pointed at.** One `.tldsl.jsx` and its
  overlay, nothing else in the tree.
- **Never empty the overlay unless the rewrite verifiably reproduces the
  render.** Absorb runs T21's harness against its own output: compile the
  rewritten JSX with an empty overlay, compare to the pre-absorb applied scene.
  On mismatch it leaves the overlay untouched and reports, rather than
  "absorbing" edits into a file that renders differently. Emptying the overlay
  is the only destructive thing absorb does and it happens last, after the
  check.
- **Never run automatically.** Not on save, not from a `PostToolUse` hook, not
  from `serve`. It is human-invoked, always. Phase 8's rule that "every plugin
  file is either prose or a shell-out" makes this concrete: a hook may *suggest*
  absorb, it may not perform it.

---

## Out of scope

Explicitly not part of this design, and not deferred work that someone should
pick up:

- **Camera, selection, zoom and any other session state.** The wire carries the
  document store only (`contracts/scene-json.ts`); ADR-13 already fixed that.
  Where the user was looking is not a diagram edit.
- **Undo history across sessions.** tldraw's in-session undo is untouched and
  the overlay is not a history.
- **Concurrent or multi-user overlays, and merging two overlay files.** One
  local user, one browser, last write wins.
- **Assets and images.** No record type outside the scene store is representable
  in the overlay.
- **Automatic absorb, and absorb without human review.** See D5.
- **Re-running layout under an overlay.** See D1's invariant; this is a
  deliberate no, not a missing feature.
- **A conflict-resolution policy between JSX and overlay.** The overlay wins.
  There is nothing further to resolve.
- **Overlay-aware `check`.** `tldsl check` keeps validating the program alone.
  Diagnostics about the overlay come from `apply`, via `serve` and
  `overlay show`.
