---
name: The picture is wrong
about: It compiles clean, but the diagram reads badly - overlap, clipping, an arrow in the wrong place
title: ""
labels: layout
---

`check` passing and the diagram being right are different questions, so this
one needs the picture, not just the error.

## The diagram

```jsx
// paste the .tldx.jsx, trimmed as far as it still shows the problem
```

## What it draws vs. what it should draw

<!-- A `tldx render` export is the fastest way to say this. Drag the image in. -->

## `tldx measure` output

<!-- Optional but usually decisive: it gives every shape's id, size and
     position, which settles "is this box too small" or "are these two
     overlapping" without anyone guessing from pixels. -->

```

```

## Did you work around it by hand?

<!-- If you fixed it on the canvas and `tldx overlay show` lists the edits,
     paste that. What a human had to do by hand is the clearest statement of
     what the layout engine got wrong. -->

## Environment

- `tldx --version`:
