// D6. In the default `draw` font an arrow label loses the spaces between its
// words: `one two three` renders as `onetwothree`. The same string on a box in
// the same font is spaced correctly, and `font="sans"` on the arrow is fine.
import { Doc, Box, Edge } from "tldsl";

export default function D6() {
  return (
    <Doc layout="col" gap="200">
      <Box id="a" label="one two three" />
      <Box id="b" label="one two three" font="sans" />
      <Edge from="a" to="b" label="one two three" />
    </Doc>
  );
}
