// D7. `layout="auto"` does not lay the graph out. This is a straight chain
// a -> b -> c -> d with gap="400" and direction="RIGHT"; it renders as a 2x2
// block with 20px between the boxes. Change the gap to 40 and the PNG is
// byte-identical, so neither the topology, the gap nor the direction reaches
// the placement.
import { Doc, Graph, Box, Edge } from "tldsl";

export default function D7() {
  return (
    <Doc>
      <Graph id="g" gap="400" direction="RIGHT">
        <Box id="a" label="A" />
        <Box id="b" label="B" />
        <Box id="c" label="C" />
        <Box id="d" label="D" />
      </Graph>
      <Edge from="a" to="b" />
      <Edge from="b" to="c" />
      <Edge from="c" to="d" />
    </Doc>
  );
}
