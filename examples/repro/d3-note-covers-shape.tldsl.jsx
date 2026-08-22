// D3. The note attached to `left` is parked to its right, where it covers the
// arrow, the arrow's label and `right` entirely. (C2, tldsl-npd: non-sticky
// <Note> is retired - <Sticky> is the only attach-capable annotation left,
// and attach placement is size-agnostic, so it reproduces the same defect.)
import { Doc, Group, Box, Edge, Sticky } from "tldsl";

export default function NoteCoversShape() {
  return (
    <Doc>
      <Group id="pair" layout="row" gap="300">
        <Box id="left" label="TIME_WAIT" />
        <Box id="right" label="CLOSED" />
      </Group>
      <Edge from="left" to="right" label="ACK" />
      <Sticky on="left">TIME_WAIT holds for 2 MSL, so a late duplicate cannot reach a new connection.</Sticky>
    </Doc>
  );
}
