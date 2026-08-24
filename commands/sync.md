---
description: >-
  Fold a diagram's canvas edits back into its `.tldx.jsx` source, then verify
  the source alone reproduces what the canvas showed. Use after moving,
  restyling or adding shapes in the `tldx serve` viewer.
argument-hint: <file.tldx.jsx>
allowed-tools: Bash(tldx:*), Bash(node:*), Bash(git diff:*), Bash(git status:*), Bash(rm:*), Read, Edit
---

# Sync a diagram's canvas edits into its source

The diagram is `$1`. If that is empty, use the `.tldx.jsx` file this session
has been working on; if there is more than one candidate, ask which.

Everything below is a `tldx` CLI call. `tldx` means the binary on `PATH`; if it
is not installed, use `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/main.js` instead.

## 1. Look at what is pending

```
tldx overlay show $1
```

The overlay is the delta between what the source compiles to and what the canvas
currently shows. If it reports no overlay or an empty one, there is nothing to
sync - say so and stop.

## 2. Fold in what the tool can do on its own

```
tldx absorb $1
```

Absorb handles the deterministic half: hand-added boxes and stickies become
pinned `<Box>` / `<Sticky>` elements in the source. It verifies its own rewrite
before it touches the overlay, so if it reports `verify-failed`, **stop** - the
source and the overlay are untouched, and the right move is to report what
diverged, not to retry.

If it refuses because the file has uncommitted changes, show `git status` for
that file and ask before rerunning with `--force`. Do not pass `--force`
unprompted.

## 3. Rewrite the source for whatever is left

Absorb leaves every entry it cannot generate JSX for. Run `tldx overlay show $1`
again to see them, and express each one in the source yourself:

- **`moved`** - prefer a layout change: reorder the children, switch the
  container's `layout`, adjust `gap`. Pin `x`/`y` only when the move is
  genuinely a hand placement, because a pinned shape leaves flow layout.
- **`restyled`** - the matching style prop on the element.
- **`relabelled`** - the element's label text.
- **`deleted`** - delete the element, and any `<Edge>` that referenced it.
- **added arrows** - an `<Edge from=... to=.../>` between the two shapes.

Edit `$1`, then:

```
tldx verify $1
```

Verify recompiles the source and reports which overlay entries still change the
scene. Repeat edit-and-verify until none do.

## 4. Finish

`tldx verify $1` must exit 0. When it passes while the overlay still has
entries, it says so explicitly: those entries are now no-ops the source already
expresses, and the overlay file it names can be deleted. Delete it, then run
`tldx verify $1` once more to confirm.

Show the result:

```
git diff -- $1
```

Leave it uncommitted. This command produces a diff for review; it does not
commit.

## Rules

- **Never parse the overlay JSON yourself.** To learn what is pending, ask
  `tldx overlay show`. To learn whether the source reproduces the canvas, ask
  `tldx verify`. If you find yourself wanting to compute something about the
  overlay, that is a missing CLI feature - say so instead of computing it.
- **Touch nothing but `$1` and its overlay file.** Not other diagrams, not the
  library, not `src/`.
- **Never reformat.** The diff should read as "these canvas edits moved into the
  source", not as a reformat with the change buried in it.
- **Never empty or delete the overlay before `tldx verify` passes.** That check
  is the only thing standing between a sync and silently losing canvas work.
