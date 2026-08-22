import { Doc, Box } from "tldsl";

// D22. A box's label can silently clip: `sizeElement` (domain/layout/stack.ts)
// computes a box's natural height from the label's *natural* (unconstrained)
// wrap width, then keeps that height even when the box's final width comes
// from somewhere else - here, an explicit `w`. The label re-wraps onto far
// more lines at the narrower width, but the height was never recomputed for
// it, so tldraw draws the box at its (too-short) computed height and clips
// everything past it. `check` validated the IR and said nothing; the picture
// is missing most of the label.
export default function D22() {
  return (
    <Doc>
      <Box
        id="dumb-zone"
        w="160"
        label="DUMB ZONE do not put smart logic here this box explicitly pins its width so the label wraps onto far more lines than the box's auto-computed height accounts for"
      />
    </Doc>
  );
}
