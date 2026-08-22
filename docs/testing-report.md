# tldsl session report

One long session, ~15 diagrams built from scratch across three rounds: a
context-window explainer, a ten-diagram collaborative-editing board reproduced
from screenshots, and an application-lifecycle flowchart. Roughly 60 tool calls,
of which **about 20 were spent fighting the tool rather than drawing**.

This is a report on where those 20 went.

---

## 1. What worked, and should not be regressed

These are the things that made the session possible. Worth pinning down with
tests so they do not rot.

**Nested `<Group>` is genuinely sufficient.** Ten diagrams, zero coordinates
written by hand until the very end. The three-clients-into-Partykit fan-in, the
feature-flag branch, the flowchart's decision column - all decomposed into
`row`/`col` groups with a `gap`. The skill's central claim holds up under real
load. `<Graph>`/`layout="auto"` was never needed once.

**`.map()` over data works exactly as promised.** `CLIENTS.map(i => <ClientEditor
ns={`nf${i}`} />)` plus a `clientEdges(ns)` helper collapsed three near-identical
client lanes into four lines.

**`render --frame <id>` + read the PNG is a good agent loop.** Being able to crop
to one diagram in a 15-diagram page kept each verification cheap. This is the
single most useful thing the CLI does for an agent.

**`check` never gave a false positive.** Every diagnostic it emitted was real and
the source locations were right.

**Four undocumented capabilities that turned out to be load-bearing:**

| Capability | Why it mattered |
|---|---|
| Relative imports (`import { X } from "./diagrams/x.jsx"`) | The whole multi-file split depends on this. Nothing in the skill says it works. |
| `<Edge>` nested *inside* a `<Frame>` | Renders correctly and consumes no layout space. This is what makes a module self-contained - without it every module would have to export a separate edge array. |
| Edge endpoints resolving to a **frame** id | `<Edge from="ds-routine" to="sr" />` points a box at a whole frame. Needed for "this box drives that subsystem". |
| Self-edges (`from === to`) | Render as a tidy circular arrow. Exactly right for flowchart polling loops (`Time up? --No-->` itself). |

All four were discovered by writing a throwaway test file and rendering it. They
should be in the skill doc.

---

## 2. Defects, ranked by how much time they cost

### 2.1 Stale `serve` reuse — worst single time sink

**Symptom.** `render --frame ctx` failed with `unknown --frame id "ctx"` and
listed every *other* id in the file. The id was plainly in the source, `check`
passed, and the source had just been edited.

**Cause.** An orphaned `tldsl serve` process from an earlier run was still
listening. `render` printed `reusing serve on http://127.0.0.1:60278/` and
rendered that server's stale compile. Killing the process fixed it instantly.

**Why it cost so much.** The error message is confident and specific, and it
points at the source. I built a minimal two-frame nested test file, rendered it
(worked), grepped `emit.ts` for `drawsChrome`, read `ir.ts:84`, and checked the
IR lowering path - all to find a bug that did not exist. About 8 tool calls.

**Fixes, cheapest first.**
- `render` and `serve` should print **which file and which content hash** the
  reused server is on: `reusing serve on :60278 (board.tldsl.jsx @ a848f56a)`.
- `render` should compare the source mtime/hash against the reused server's and
  either force a rebuild or refuse.
- `tldsl serve --list` / `tldsl kill` to see and reap orphans.
- The `unknown --frame id` message should say *when* the scene was compiled.

### 2.2 Labels clip silently, with no diagnostic

**Symptom.** A `<Box>` with a nine-line label rendered five lines. The other four
were simply not drawn. `check` reported nothing.

Hit three separate times: the first context-window `DUMB ZONE` box lost both its
heading and its last line; `cv-shared` and `cv-pstate` lost the first and last of
four lines; `sr-each`'s hexagon outline cut through its own text.

**Why this is the most dangerous defect in the tool.** Every other failure mode
is loud. This one produces a diagram that validates, looks plausible, and is
missing content. An agent that follows the skill's advice - "`check` before you
claim it is done" - will confidently ship a wrong diagram. I only caught these
because I was rendering and reading PNGs anyway.

**Fixes.**
- `check` should emit `layout/label-overflow` when the measured label extent
  exceeds the shape's box. The measurement code already exists
  (`labelExtent`, `boxHeightForWidth` in `src/domain/layout/defaults.ts:114`);
  this is a comparison, not new machinery.
- Failing that, grow the box instead of clipping. Silent truncation is never the
  right default.
- The skill's workflow section should be amended: `check` is necessary but not
  sufficient; **render and look** is the only way to catch overflow.

### 2.3 Explicit `w` / `h` behave inconsistently

Three distinct behaviours observed:

1. `h="200"` on a `<Box>` inside a multi-child row - **applied** (measured
   283×200 in the SVG).
2. `h="460"` on a `<Box>` that is the only child of a frame - **ignored**,
   auto-sized to label height.
3. `h={h}` forwarded through a component prop - **always ignored**. `<EditorServer
   ns="ex" h="420" />` produced a ~185px box.

Setting `w` alongside `h` made it reliable in every case tried. The percentage
bars in the context-window diagram only work because they set both.

Case 3 is the clearest bug: a numeric prop that survives as a string literal but
vanishes when passed through a variable. If `numericAttrs`
(`src/domain/ir/lower.ts:326,361,395`) only reads literal attribute values, an
identifier expression is dropped with no error. `label={label}` forwards fine,
which makes the asymmetry surprising.

**Fixes.**
- Make `numericAttrs` evaluate expressions, or emit
  `ir/non-literal-numeric-prop` so it fails loudly instead of silently.
- Document that `h` needs `w`, or make `h` standalone-reliable.

### 2.4 Sibling boxes are equalised to the tallest, and that equalisation clips

`src/domain/layout/stack.ts:404-418` gives every box in a container the max
sibling height. Two consequences:

- **Proportional bars are impossible without `w`/`h`.** The first attempt at the
  context window used line count to convey 5% / 35% / 60%. All three boxes came
  out the same height, so the 5% zone was as tall as the 60% one. Correct
  behaviour for a service map; wrong when the size *is* the data.
- Combined with 2.2, a box whose label is taller than its siblings' gets clipped
  rather than growing.

**Fix.** An opt-out on the container (`equalize="false"` / `sizing="natural"`)
would cover both. The current behaviour should stay the default.

### 2.5 Overlay: render artifacts, and real edits lost on source edit

**Artifacts.** Every `render` writes a `*.tldsl.overlay.json` whose entries are
edge shapes "reparented" into frames. On this file that is 97 entries of pure
noise. The `UserPromptSubmit` hook then reports "97 unabsorbed canvas changes"
on every single turn, for four different files. The signal-to-noise ratio is bad
enough that a genuine 13-entry user edit was indistinguishable from it.

**Real edits lost.** The sequence that destroyed work:

1. User made 113 canvas edits (frame drags, four diamond resizes).
2. `tldsl absorb` reported it could express **none** of them: *"every overlay
   entry is a moved/restyled/relabelled/deleted op"*.
3. I edited the source to fix an unrelated diagram.
4. `serve` recompiled, the scene was re-laid-out, and every overlay entry bound to
   a shape whose geometry had shifted was **silently pruned**. 113 → 97, and all
   the named shapes were gone.

No warning, no backup, no confirmation. The `/tldsl:sync` skill correctly says
"never empty or delete the overlay before `tldsl verify` passes" - but nothing
enforces that against an ordinary source edit, which is the far more likely way
to lose the data.

**Fixes.**
- **`render` should not write an overlay sidecar at all.** It is a read-only
  export. If the sidecar is needed internally, write it somewhere that is not
  mistaken for user intent.
- Distinguish *tool-generated* from *human* overlay entries, and have the hook
  count only the latter.
- **Back up the overlay before a recompile prunes it** (`*.overlay.json.bak`),
  or refuse to prune and report a conflict.
- `absorb` covering only added geo/note shapes is too narrow. *Moves are the most
  common canvas edit by a wide margin* - 113 of 113 here. Absorbing a move as a
  reordered child, an adjusted `gap`, or (as a last resort) a pinned `x`/`y`
  would make the sync loop actually work. As it stands, `absorb` almost always
  returns "nothing I can do" and hands the entire job back manually.

---

## 3. Missing capabilities

**No borderless text shape.** The board needed large `Phase 1 (non
collaborative)` / `Phase 2 (collaborative)` headings. `<Box>` and `<Note>` both
draw an outline; `<Sticky>` is a yellow note. A frame `name` is the only
chrome-free text and it renders small and fixed-size. Titles and free-floating
annotations are common enough to deserve a `<Text>` element.

**`<Swimlanes>` cannot express a matrix.** The Phase 2 source diagram is
participant *columns* (Client / Partykit Room / Documents Service) crossed with
phase *bands* (init / editing / cleanup). A box lives in exactly one lane, so
this is inexpressible. I fell back to encoding the bands as edge colour plus a
legend note - which reads fine, but it was a workaround, not a translation.
Cross-cutting bands over a column layout is a standard architecture-diagram
shape.

**No measurement command.** Twice I needed actual geometry: once to prove the
percentage bars were correct (the user believed they were wrong; they were not -
the screenshot was cropped mid-bar), once to work out whether `h` had applied. In
both cases I rendered to SVG and grepped `width="…" height="…"` out of the
markup. That should be a command:

```
tldsl measure board.tldsl.jsx --frame ctx
c1-sys    90 x 44   @ (0,0)
c1-smart 270 x 44   @ (90,0)
```

**No way to influence edge anchoring.** Mostly fine, but `ds-routine → sr`
entered the frame at top-centre and crossed its own title. `<Edge side="left">`
or similar would help. Low priority - the routing is good in the overwhelming
majority of cases.

---

## 4. Skill documentation gaps

The skill file is good - the `<Group>`-first advice is correct and the "what
`check` will reject" list is accurate. Gaps, in priority order:

1. **`w` / `h` / `x` / `y` are not mentioned at all.** They are valid props
   (`lower.ts:326,361,395`). I found them by reading `src/domain/layout/`. For a
   percentage bar or a swimlane-style tall box, size *is* the content. Document
   them, with the `h`-needs-`w` caveat and the "this leaves flow layout" warning.
2. **`check` is presented as sufficient.** "`check` before you claim it is done"
   should be "`check`, then `render` and look - `check` cannot see clipping,
   overlap, or a label that fell out of its box."
3. **Multi-file is undocumented.** Relative imports work; the skill implies one
   file. A short section - "a diagram can be split across files; export
   components returning one element, nest their edges inside" - would have saved
   the trial-and-error test I had to write.
4. **Nested edges, frame-targeted edges, self-edges** - all three work, none are
   documented. Self-edges in particular are the natural way to draw a flowchart
   polling loop.
5. **No warning about stale `serve`.** Add to the workflow section: if `render`
   reports an id that exists in your source, suspect a reused server before you
   suspect the compiler.
6. **The `<Note>` overlap warning is understated.** Attached notes routinely
   landed a long way from their target in wide diagrams (the `nf-pstate`
   throttling note ended up outside the frame). Worth saying they drift, not just
   that they can overlap.

---

## 5. Suggested priority

| # | Change | Why |
|---|---|---|
| 1 | `check` diagnostic for label overflow | Only failure mode that silently ships wrong output |
| 2 | `render` stops writing an overlay sidecar | Kills the artifact noise and the hook spam in one move |
| 3 | Back up / refuse to prune overlay on recompile | Prevents data loss; this session lost real work |
| 4 | Print file + hash when reusing a serve | Biggest single time sink, cheapest possible fix |
| 5 | Fix or reject non-literal numeric props | Silent drop with no error |
| 6 | Document `w`/`h`, imports, nested/frame/self edges | Pure doc work, unblocks a lot |
| 7 | `absorb` handles moves | Makes the sync loop actually usable |
| 8 | `tldsl measure` | Removes the SVG-grep hack |
| 9 | `<Text>` element | Titles are unavoidable on a board |
| 10 | Container opt-out from height equalisation | Unblocks proportional/lane diagrams |

---

## 6. Session artifacts

```
board.tldsl.jsx                  entry, composition only
diagrams/shared.jsx              constants + 5 reusable components
diagrams/opsx.jsx                opsx lifecycle
diagrams/context-window.jsx      three proportional context-window bars + legend
diagrams/compact.jsx             when-to-/compact decision flow
diagrams/collab-phases.jsx       Phase 1, Phase 2
diagrams/collab-board.jsx        8 collaboration diagrams
diagrams/app-lifecycle.jsx       application startup + main loop flowchart
```

15 diagrams, 336 lines of source at the point of the split, no hand-written
coordinates except four deliberate size pins where the size carries meaning.
