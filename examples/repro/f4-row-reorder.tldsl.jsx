// F4 (tldsl-d3o). Three same-size boxes in a row. Drag "c" in front of "a"
// (and, for the drag to read as a clean reorder rather than an overlap,
// drag "a" and "b" into their new slots too - a real translate never moves
// a shape you didn't touch, docs/round-trip-scope.md §2/§7). `tldsl absorb`
// should fold that into a reordered <Box> list below, not a set of pinned
// x/y coordinates, and leave the overlay empty.
import { Doc, Box } from "tldsl";

export default function RowReorder() {
  return (
    <Doc layout="row">
      <Box id="a" w="100" h="70" label="A" />
      <Box id="b" w="100" h="70" label="B" />
      <Box id="c" w="100" h="70" label="C" />
    </Doc>
  );
}
