// D5. An edge from a shape to itself draws no loop; its label is stamped over
// the shape's own label. `check` is clean.
import { Doc, Box, Edge } from "tldsl";

export default function D5() {
  return (
    <Doc>
      <Box id="a" label="ESTABLISHED" />
      <Edge from="a" to="a" label="recv data / ACK" />
    </Doc>
  );
}
