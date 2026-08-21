# Diagram defects

What broke when tldsl was pointed at diagrams it was not designed around
(Phase 9). Authoring tasks fill this file; fix tasks drain it. An authoring wake
logs what it hit and moves on - it does not fix anything, and it does not
reshape the diagram to avoid the defect.

## Schema

One `###` section per defect, numbered in the order they were found. Numbers are
never reused, even after a defect is fixed.

```
### D<n>. <one-line subject>

- **Diagram:** the file that provoked it, e.g. `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** blocker | wrong | ugly | papercut
- **Attempted:** what the author wrote, in one or two sentences.
- **Happened:** what the tool did instead - the error text, or what the PNG
  showed. Point at the render if there is one.
- **Repro:** `examples/repro/<name>.tldsl.jsx` - the smallest file that shows
  it. A repro that needs a whole realistic diagram is not a repro yet.
- **Status:** open | fixed in T<n> | struck (with the reason)
```

## Severity

Severity describes what the defect does to the **diagram**, not how hard the fix
looks. A one-line fix to something that makes a diagram unreadable is still a
blocker.

- **blocker** - the diagram cannot be expressed at all. No arrangement of
  existing primitives says the thing the subject requires.
- **wrong** - it renders, and what it renders is false: an arrow pointing the
  wrong way, a label on the wrong shape, an ordering the reader will misread.
- **ugly** - it renders and it is true, but it reads badly: overlaps, crossings
  a human would not draw, wasted space, a shape three times the size of its
  neighbours.
- **papercut** - the diagram came out right, but getting there cost the author
  something it should not have: a prop the skill does not mention, a workaround,
  a value that had to be guessed and tuned.

## Entries

None yet.
