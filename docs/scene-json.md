# Scene JSON contract (spike)

> Source: this is the output of `tldsl-q9l`. It locks in the wire shape that
> `domain/emit/` produces and `viewer/` consumes. The actual TypeScript pin
> lives in `src/contracts/scene-json.ts` (see `tldsl-5lw`); this doc explains
> *why* the type looks the way it does and where it came from.

## Decision

`SceneJSON` is **a tldraw document store snapshot** - the same shape you get from
`editor.store.getStoreSnapshot('document')` and that `loadSnapshot(store, { document })`
accepts on the viewer side.

```ts
type SceneJSON = {
  store: { [recordId: string]: TLRecord };  // shapes, pages, bindings, the document record
  schema: TLStoreSchema;                     // version metadata, used for migrations
};
```

We do **not** put `session` (camera, selection, current page) on the wire.
Camera + selection are viewer-side concerns; the CLI is the authoritative
producer of *document* state only. If we ever push camera-pinning we'll add
a separate scene-message kind, not pollute SceneJSON.

## tldraw version pin

Pinned to `tldraw@^3.15`. The record shapes (`shape`, `page`, `document`,
`binding`) and the snapshot envelope are stable across the v3 line; tldraw
ships migrations inside `loadSnapshot`, so older snapshots from the same
major load cleanly. Bumping the major is a contracts-version bump (`v: 2`
in the scene-message envelope).

## Record shapes we care about for MVP

The four record kinds the MVP emit will produce. Field-level docs live in
the tldraw source; this is the structural pin only.

### `document` record

Exactly one per snapshot.

```json
{
  "id": "document:document",
  "typeName": "document",
  "gridSize": 10,
  "name": "",
  "meta": {}
}
```

### `page` record

At least one. MVP emits a single `page:main`.

```json
{
  "id": "page:main",
  "typeName": "page",
  "name": "tldsl",
  "index": "a1",
  "meta": {}
}
```

`index` is a fractional index (jaredhecht/fractional-indexing semantics);
ordering of pages is by sorted index, not by object key.

### `shape` record (`<box>` and `<note>` map here)

Common base fields are `TLBaseShape`:

| field      | type          | notes                                                  |
|------------|---------------|--------------------------------------------------------|
| `id`       | `shape:<...>` | branded string, type prefix is mandatory               |
| `typeName` | `"shape"`     | constant                                               |
| `type`     | `string`      | shape kind: `"geo"`, `"note"`, `"arrow"`, ...         |
| `x`        | `number`      | top-left x relative to `parentId`                      |
| `y`        | `number`      | top-left y relative to `parentId`                      |
| `rotation` | `number`      | radians                                                |
| `index`    | `IndexKey`    | fractional index for z-order within parent             |
| `parentId` | `page:...` \| `shape:...` | container; usually the page id          |
| `isLocked` | `boolean`     | viewer-side toggle; CLI emits `false`                  |
| `opacity`  | `number`      | 0..1                                                   |
| `meta`     | `JsonObject`  | host-defined; we stash the source span here            |
| `props`    | `object`      | shape-type-specific (see below)                        |

MVP shape-type → tldraw `type`:

| tldsl       | tldraw `type` | reason                                                 |
|-------------|---------------|--------------------------------------------------------|
| `<box>`     | `"geo"`       | geo with `geo: "rectangle"` is the closest visual fit |
| `<note>`    | `"note"`      | tldraw has a first-class sticky-note shape            |
| `<frame>`   | `"frame"`     | tldraw has a first-class frame container              |
| `<edge>`    | `"arrow"`     | only edge shape we support for MVP                    |

`props` for the four:

- **geo** - `{ w: number; h: number; geo: "rectangle"; color: string; fill: string; richText: TLRichText }`.
  MVP fixes `geo: "rectangle"`, `color: "black"`, `fill: "none"`. Text is
  rendered through `toRichText(...)` at consumer time but on the wire it's
  the serialized rich-text shape.
- **note** - `{ color: string; size: string; richText: TLRichText }`.
  Note shapes don't carry `w`/`h` - tldraw fits them.
- **frame** - `{ w: number; h: number; name: string }`. Frames host children
  by setting their `parentId` to the frame's id.
- **arrow** - covered in the next section.

### `binding` record (`<edge>` endpoints)

Edges in tldraw are arrow shapes plus *bindings* that anchor each end to a
target shape. Both ends of an arrow that connects two boxes have their own
binding record.

```json
{
  "id": "binding:abc",
  "typeName": "binding",
  "type": "arrow",
  "fromId": "shape:arrow1",
  "toId":   "shape:box1",
  "props": {
    "terminal": "start",
    "normalizedAnchor": { "x": 0.5, "y": 0.5 },
    "isPrecise": false,
    "isExact": false
  },
  "meta": {}
}
```

Two binding records per edge - one with `terminal: "start"`, one with
`terminal: "end"`. Default-center attach (`normalizedAnchor: 0.5,0.5`,
`isPrecise: false`) is the only mode MVP supports.

The arrow shape itself:

```json
{
  "id": "shape:arrow1",
  "typeName": "shape",
  "type": "arrow",
  "x": 0, "y": 0, "rotation": 0,
  "index": "a1", "parentId": "page:main",
  "isLocked": false, "opacity": 1, "meta": {},
  "props": {
    "start": { "x": 0, "y": 0 },
    "end":   { "x": 0, "y": 0 },
    "color": "black"
  }
}
```

`start`/`end` are placeholder coordinates - the bindings drive actual
endpoint resolution.

## `schema` block

Opaque to us in domain code. Producer (`emit/`) emits whatever the current
tldraw runtime hands back from `getStoreSnapshot('document').schema`; the
viewer uses it to drive `loadSnapshot` migrations. We do **not** hand-write
or version this object. It looks like:

```json
{
  "schemaVersion": 2,
  "sequences": {
    "com.tldraw.store": 4,
    "com.tldraw.document": 2,
    "com.tldraw.page": 1,
    "com.tldraw.shape": 4,
    "com.tldraw.shape.geo": 9,
    "com.tldraw.shape.note": 8,
    "com.tldraw.shape.arrow": 5,
    "com.tldraw.shape.frame": 0,
    "com.tldraw.binding.arrow": 1
  }
}
```

The exact version numbers are whatever tldraw ships at our pinned major.
Treating schema as opaque means a tldraw point-release that ticks one of
these numbers does not require a tldsl release - the viewer's bundled
tldraw will migrate on load.

## Constructing reference scenes

The authoritative way to build a SceneJSON for tests is `src/contracts/builders.ts`
(`sceneJson`, `documentRecord`, `pageRecord`, `boxShape`, `noteShape`,
`frameShape`, `arrowShape`, `arrowBinding`, `richText`). Defaults in those
factories are the tldraw-pin defaults documented above; if the pin moves,
update both the factories and this doc in lockstep.

Static JSON fixtures aren't kept under `tests/e2e/fixtures/scene-json/`:
hand-rolled examples drift from the factories and from real tldraw output.
The viewer round-trip test (`tldsl-09k`) constructs scenes with the
builders and calls `loadSnapshot` directly - that's the contract test that
catches drift from real tldraw. Golden e2e fixtures (`<name>.tldsl` →
`<name>.scene.json`) come later from real emit output, not from hand-rolled
shapes.

## What this spike intentionally does *not* settle

- ID-generation strategy for synthetic IDs - that's `tldsl-p69`.
- The wire envelope around SceneJSON (`scene-message.ts`) - that's
  `tldsl-5lw`. `SceneJSON` is the inner payload; the envelope adds versioning
  and the `error`/`ping` kinds.
- Whether emit produces rich-text via `toRichText(...)` (a tldraw runtime
  call) or hand-rolls the rich-text shape. Domain is pure, so emit cannot
  call into tldraw - the rich-text shape will be hand-built. That's an
  emit-task concern (`tldsl-907`).
