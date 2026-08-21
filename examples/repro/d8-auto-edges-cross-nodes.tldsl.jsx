// D8. A `layout="auto"` container reserves no space for edge labels and keeps
// no arrow off the other nodes: the arrows are drawn as direct lines between
// shapes and the label sits at the midpoint, wherever that lands. The same
// edge inside a `<Row>` (see the row in the comment below) widens the gap until
// the label fits.
import { Doc, Graph, Box, Edge } from "tldsl";

export default function D8() {
  return (
    <Doc>
      <Graph id="g">
        <Box id="a" label="A" />
        <Box id="b" label="B" />
        <Box id="c" label="C" />
        <Box id="d" label="D" />
      </Graph>
      <Edge from="a" to="b" />
      <Edge from="b" to="c" />
      <Edge from="c" to="d" />
      <Edge from="a" to="d" label="recv FIN+ACK / ACK" font="sans" />
    </Doc>
  );
}
