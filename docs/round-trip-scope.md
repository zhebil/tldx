# What the round-trip is for

Settles F5. `docs/round-trip.md` D1-D5 stand and are not re-argued: the overlay
is a final-state map keyed by record id, `apply` is pure, the overlay wins,
absorb is human-invoked and verifies before it empties anything.

This doc answers four things left open: which canvas edits become source, what
the sidecar is allowed to become, whether z-order is real, and why a move
inside a `<Group>` cannot be written back. It is the input to **F4** (absorb
handles moves) and **F6** (`<Edge>` geometry vocabulary).

It opens with a finding that changes the premise of both.

---

## 0. The field reports counted noise

Session A: "113 canvas edits, `absorb` could express none of them." Session B:
"25 edits, 15 of them z-order reorders." Both numbers are wrong, and they are
wrong the same way. Three real overlay files are checked in; here is what is
actually in them.

| file | entries | entries containing an `index` change | entries that are a real user edit |
|---|---|---|---|
| `board.tldsl.overlay.json` | 97 | 97 | ~0 |
| `examples/kernel.tldsl.overlay.json` | 16 | 16 | 0 |
| `tcp-groups.tldsl.overlay.json` | 25 | 20 | 11 |

`board`'s 97 entries are 91 × `{index, parentId, x, y}` + 5 × `{index,
parentId, x}` + 1 × `{index}`. Every one of them is an arrow. `kernel`'s 16 are
10 × `{index}` and 6 × `{index, parentId, y}`. Neither file records a single
gesture a human made.

**Root cause, in our code, not tldraw's.** Two lines:

- `contracts/builders.ts` defaults `index` to `"a1"` and `domain/emit/emit.ts`
  never passes one. **Every shape in every scene we emit has `index: "a1"`.**
- `emitEdge` emits every arrow with `parentId: PAGE_ID, x: 0, y: 0`,
  regardless of where its endpoints live.

tldraw disagrees with both. `ArrowBindingUtil.reparentArrow` (read it -
`node_modules/tldraw/src/lib/bindings/arrow/ArrowBindingUtil.ts:97`) runs
whenever a bound arrow changes and enforces two invariants: an arrow is
parented to the **common ancestor of its endpoints**, and its index sits
strictly **above its highest bound sibling and below the next non-arrow sibling
above that**. With every sibling at `"a1"` the second invariant is never
satisfiable on arrival, so each arrow gets a fresh index the first time it is
touched. The signature is unmistakable in `tcp-groups`:

```
a1YDP  a1OPx  a1CD0cP  a166awT  a133TkO  a11WrXv
a10C3CH  a1065RY  a1034Li  a100P1q  a1004LCWrp
```

That is `getIndexBetween("a1", <previous arrow's index>)` bisecting downwards,
eleven times. No human clicking "send backward" produces a monotone bisection
sequence. And in `board`, where the endpoints sit inside a named `<Frame>`,
tldraw also reparents the arrow into the frame and rewrites `x`/`y` into
frame-local coordinates - which is why 91 entries carry `parentId, x, y` that
no one typed.

So the honest restatement of the field data is: **`tcp-groups` recorded nine
`bend` adjustments, one endpoint rebind and one node move. Everything else in
all three files is our own emit defect, faithfully recorded.**

Two consequences, and they order the work:

1. **R1 comes before F4 and before anything in §4.** Fix emit to assign real
   indices and to parent arrows the way tldraw will anyway. Details in §7.
2. "Moves are 100% of what people do" is unproven. What the corpus actually
   shows people doing is **bending edges** (9), **rebinding endpoints** (1) and
   **moving nodes** (1). F4's brief inverted the priority.

`AGENTS.md` already says a field report's root cause is a hypothesis. So is its
denominator.

---

## 1. The division of labour: accepted, sharpened

The agent edits JSX for layout and intent; the human adjusts the canvas.
Accepted. The sharpening is that "adjusts the canvas" splits three ways, and
the split is decided per *field*, not per gesture.

| field the differ sees | tier | where it lives | why |
|---|---|---|---|
| `richText` / `text` (label) | **source** | JSX | Names content. Round-trips exactly. Already works. |
| `color fill dash font size textAlign verticalAlign labelColor arrowheadStart arrowheadEnd geo opacity` | **source** | JSX | These are the tldsl style vocabulary verbatim (`domain/ir/styles.ts`). A rename, not a translation. Already works for `added`; F4 extends it to existing shapes. |
| `added` geo/note/arrow shape | **source** | JSX | Already the one thing absorb does. F4 adds arrows (an `added` arrow + its two bindings is one `<Edge>`). |
| `deleted` | **source** | JSX | Deleting the element is exact. |
| a **move that is a permutation** of a flow container's children | **source** | JSX, as reordered children | §2. Recovers intent. |
| a **move that is a uniform shift** of a flow container's tail | **source** | JSX, as `gap` | §2. Recovers intent. |
| any other `x y w h` | **sidecar** | overlay, permanently | Layout's output. Writing it back pins it and freezes the thing the product is for. `--pin` only. |
| `bend elbowMidPoint start end` on an arrow | **sidecar** | overlay, permanently | Edge geometry. §6. |
| `rotation` | **sidecar** | overlay, permanently | The DSL has no rotation and should not grow one for this. |
| `parentId` | **sidecar**, conditionally | see §5 | Real when the user drags into a named `<Frame>`; artifact when tldraw reparents an arrow. |
| `index` | **refused** | not recorded at all | §4. |
| camera, selection, page state | **refused** | not on the wire | Already settled, ADR-13. |

**Three tiers, one rule each.**

- **Source** means absorb may write it into JSX and drop the entry. The bar is
  that the rewrite reproduces the render - absorb already verifies this and
  rolls back on mismatch, so the bar is enforced mechanically, not by taste.
- **Sidecar** means the entry is a permanent, legitimate resting state. D4
  already says a never-absorbed overlay is not a pending migration. This tier
  is what that sentence is for. `absorb` reports these as residual and moves
  on; it does not nag.
- **Refused** means `diffScenes` never writes it. Not written and later
  filtered - **never written**. Filtering downstream leaves the noise in the
  file that agents read, which is the exact failure §0 documents.

**Why not absorb geometry by default.** The DSL already has hard pins (`x` AND
`y` on a child, `domain/layout/stack.ts:226`), so the "no coordinates" pitch is
about the *default*, not about capability. Absorb writing pins on its own is
what would kill it: every session's drift silently becomes source, the layout
engine progressively stops being consulted, and the file ends up as the
hand-computed geometry the product exists to avoid. Keeping geometry in the
sidecar costs the user nothing - it renders identically - and keeps the
decision to freeze a coordinate an explicit one (`absorb --pin <id>`).

---

## 2. Recovering intent from a move

This is the interesting half of F4 and it is worth more than pin support.

A `moved` entry on a child of a container with `layout="row"|"col"|"grid"` is
absorbable as **intent** when the observed positions are reproducible by an
edit to the *program*. Two candidates, tried in this order:

**(a) Reorder.** Permute the container's children, re-run layout, compare to
the applied scene. If some permutation reproduces it, rewrite the child order
in the JSX. Search space is small in practice: only try permutations that move
the dragged child, i.e. n-1 candidates for one dragged child, and give up above
one dragged child per container.

**(b) Gap.** If every child after position *k* in a `row`/`col` shifted by the
same delta along the flow axis and nothing else moved, the edit is a `gap`
change. Solve for the gap, re-run layout, compare.

Both are proposals that absorb **verifies against the render it already
computes** (`app/absorb.ts` recompiles and deep-equals `target`). A candidate
either reproduces the scene or it does not; there is no heuristic to tune and
no "close enough". If neither candidate verifies, the entry stays in the
sidecar and absorb says which shape and why.

**Where it breaks, and this is the important part.** It breaks the moment the
move is not expressible as a program edit - a drag perpendicular to the flow
axis, a drag that lands between two grid cells, any drag inside `layout="free"`.
It also breaks in a way that is worth stating explicitly, because the F4 brief
assumes the opposite:

> **A pin is not a local edit.** `stack.ts` excludes hard-pinned children from
> the flow. Pinning one child of a `row` therefore removes it from the row,
> which re-flows and moves *every sibling*. Absorb's verify step will reject
> that rewrite - correctly - and roll back.

So "absorb the move as `x`/`y`" is not merely distasteful, it usually **does
not work** inside the containers `<Group>` authoring produces. `--pin` is
honest only for children of `layout="free"` containers and for elements already
pinned. Everywhere else, intent recovery or the sidecar. Do not spend F4 on a
pin writer that fails its own verification.

---

## 3. What the sidecar is allowed to become

It is allowed to become **a list of geometry the user tuned**, and nothing else.

The compaction story is that there is nothing to compact. A final-state map is
already the compacted form: one entry per record, latest value wins, applying
it twice equals applying it once (D1). The 97-entry file was not growth, it was
`diffScenes` recording a field that is not an edit. Delete the noise at the
source (§4, §7) and `board` goes from 97 entries to roughly zero, `kernel` to
zero, `tcp-groups` to eleven. **Eleven entries is a file an agent can read.**

Three rules keep it that way, and they are the whole story:

1. **The differ writes only source-tier and sidecar-tier fields.** `index` is
   never written. Nothing is written that a later pass has to filter out.
2. **`absorb` drops unresolvable entries.** Today it carries residual entries
   forward verbatim, so an orphan (a renamed id, an edited unlabelled `<Note>`
   whose content-hash id changed - D2's wrinkle) lives forever. On a successful
   absorb, an entry whose id is absent from the fresh compile is dropped, and
   absorb prints what it dropped. That is the expiry story: expiry is a side
   effect of a successful absorb, not a timer.
3. **`overlay show` gets a summary mode.** `tldsl overlay show --summary`
   prints counts by op kind plus the ids of source-tier entries only. That is
   what a hook or an agent reads; the full listing stays for humans. This is
   cheap - the partition already exists in `app/absorb.ts:partition`.

If a sidecar still exceeds ~30 entries after R1, that is a signal that the
layout is wrong, not that the sidecar needs an algorithm. Say so in the
summary output and stop there. No LRU, no rollup, no per-entry TTL.

---

## 4. Z-order: an artifact. Refused.

**Verdict: not a single recorded z-order change in the corpus is user intent.**
The evidence is §0: 133 of 138 entries across three files carry an `index`
change, they carry it on arrows, and the values form a mechanical bisection
sequence generated by `reparentArrow`. Session B's "15 arrows reordered
alongside edits that never touched z-order" is precisely the signature of a
differ recording a field the renderer owns.

**Decision: `diffScenes` stops recording `index`. No JSX syntax for z-order.**
"This arrow draws above that box" is awkward to express declaratively, it has
no user asking for it, and the one thing it would guard against - shapes
occluding each other - is already a `check` warning (`layout/shape-overlap`,
T41). The correct fix for two overlapping boxes is to stop overlapping them.

**Ordering hazard, do not get this wrong.** Filtering `index` out of the differ
*without* fixing emit creates a live loop. `src/viewer/app.tsx` re-pushes the
server's applied scene whenever it differs from the editor snapshot. If tldraw
rewrites an index and the overlay no longer carries it, the applied scene
permanently differs from the canvas → reload → `reparentArrow` fires again →
new index → PUT → push → reload. **R1 (emit assigns indices tldraw accepts)
must land before or with the differ change.** With R1 in place tldraw's
early-return path is taken, no rewrite happens, and there is nothing to loop on.

Note that tldraw's index generation is jittered (`@tldraw/utils` →
`fractional-indexing-jittered`), so emit cannot predict the exact string
tldraw would produce. It does not need to: `reparentArrow`'s early return is an
*inequality*, so any index strictly between the endpoint's index and the next
non-arrow index above satisfies it.

---

## 5. The move inside a `<Group>`: a bug and a limit, stacked

Both. They are separate and F4 must handle them separately.

**The bug is arithmetic.** `<Group>` - and any unnamed `<Row>`/`<Col>`, i.e.
most of the recommended authoring style - has `drawsChrome === false`
(`domain/ir/ir.ts:84`) and therefore **emits no tldraw shape at all**.
`emitElement` folds the container's origin into `offsetX`/`offsetY` and parents
the children straight to `page:main`. So the overlay records `shape:last_ack`
at page-absolute `(988, 1081)`, while a `x=`/`y=` pin in the JSX is interpreted
relative to its enclosing `<Group id="passive-close">`. Different spaces,
same-looking numbers. Absorb must subtract the sum of the ancestor chrome-free
containers' origins, which it can read straight off the positioned IR it
already has. This is a missing subtraction, not a design gap.

**The limit is §2's.** Getting the number right does not make the write
succeed: `passive-close` is `layout="col"`, so pinning `last_ack` drops it out
of that column, the column re-flows, its siblings move, and absorb's verify
rejects the rewrite. That is not a bug and should not be "fixed".

The field report saw "cannot be written back at all" because both apply at
once, and it attributed the whole failure to the coordinate space. F4 fixes the
arithmetic (it is needed for `--pin` inside `layout="free"` groups and for
diagnostics that quote a coordinate) and routes the common case to §2's intent
recovery, where a drag inside a `col` becomes a reorder or a `gap` - which is
what the user meant anyway.

---

## 6. `bend`: B5 first. Agreed, with one amendment.

**Agreed on the sequencing.** `docs/plan.md` says fix auto-routing (B5) before
shipping hand-geometry, because a `bend=` prop that lands first becomes the
documented way to fix a crossing. The corpus supports it: `tcp-groups`'s nine
recorded bends include values of `-457` and `+401` px against a layout whose
router had already given up. Those are spacing failures, and B5 owns them.
Shipping `bend=` first converts a routing bug report into a user workaround,
permanently.

**The amendment: the sequencing blocks the *syntax*, not the *classification*.**
Today `diffScenes` sweeps every prop it does not recognise into `restyled`, so
`bend`, `elbowMidPoint`, `start` and `end` are recorded as if they were style -
visible in `tcp-groups`, where a rebound arrow's `restyled` contains
`{start: {x, y}, end: {x, y}, bend: -456.99, elbowMidPoint: 0.978}`. That is
wrong regardless of B5, and it will bite F4 the moment F4 starts absorbing
`restyled` into JSX attributes, because it will try to emit `bend="-456.99"` as
a style prop. **Split arrow geometry out of `restyled` into its own sidecar-tier
field now, in F4.** It stays in the sidecar; it just stops being mislabelled.

Two facts F6 must not rediscover:

- **tldraw's `bend` is an absolute px sagitta, not a fraction.** The corpus has
  `-456.99` and `400.59`; `domain/layout/routing.ts` computes `route.bend` in
  the same units. If `<Edge bend>` ever ships, it is px, matching the router,
  so an absorbed value and a hand-written one mean the same thing.
- **Waypoints are not renderable and must not be proposed.** `TLArrowShapeProps`
  is two endpoints plus one scalar (`bend` or `elbowMidPoint`); `TLLineShape`
  has `points` but no arrowhead, no binding, no label. Multi-point edges need a
  custom `ShapeUtil` registered in both `src/viewer/` and `src/infra/render`,
  a widened `src/contracts/scene-json.ts`, its own hit-testing, binding and
  label logic, plus arrowhead rendering tldraw gives us free today. That is a
  phase, not a task, in exchange for a capability nothing in the corpus asked
  for. **Rejected.**

---

## 7. What to build

**R1 - emit assigns indices and arrow parents (new, blocks the rest).**
Not F4's brief, but F4 is meaningless without it.
- Per parent, assign non-arrow shapes `index` in emit order with a gap:
  `"a1"`, `"a3"`, `"a5"`, ...
- Parent each arrow to the common ancestor of its two endpoints, not to
  `page:main`, with `x`/`y` in that parent's space.
- Give each arrow an index strictly between its higher-indexed endpoint and the
  next non-arrow sibling above it - the even slot, `"a4"` for endpoints at
  `"a3"`/`"a5"`. Arrows may share an index; `reparentArrow` checks bounds, not
  uniqueness.
- **Acceptance:** open any corpus diagram in `serve`, drag one box, and the
  written overlay contains exactly one entry.

**F4 - absorb handles moves.**
1. `diffScenes` stops emitting `index` (after R1; §4's hazard).
2. `diffScenes` splits `bend`/`elbowMidPoint`/`start`/`end` out of `restyled`
   into a distinct sidecar-tier field (§6).
3. Absorb gains source-tier handling for `restyled`, `relabelled`, `deleted`
   and `added` arrows on **existing** shapes, not just `added` geo/note (§1).
4. Absorb gains §2's reorder and gap recovery, verified by the existing
   recompile-and-compare step. No proposal ships that does not verify.
5. Absorb converts page-absolute overlay coordinates into container-local ones
   through the chrome-free ancestor chain (§5).
6. `--pin <id>` writes `x`/`y` explicitly, for `layout="free"` and
   already-pinned children. It is the only path that writes a coordinate, it is
   never the default, and it reports honestly when verification rejects it.
7. Absorb drops unresolvable residual entries on success and says so (§3.2).
8. `overlay show --summary` (§3.3).

**F6 - `<Edge>` geometry vocabulary.** Still blocked on B5. When it unblocks:
`bend` in px, no waypoints, absorbed only under an explicit flag, documented as
an escape hatch from a routing failure - and the routing failure gets filed.

---

## Out of scope

- Z-order syntax. §4.
- Waypoints, polylines, custom edge `ShapeUtil`. §6.
- Rotation in the DSL.
- Any sidecar compaction algorithm. §3 - the file was never the problem.
- Absorbing geometry by default, or without verification. §1, §2.
- Re-litigating `docs/round-trip.md` D1-D5.
