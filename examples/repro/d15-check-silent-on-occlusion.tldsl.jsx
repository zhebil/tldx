import { Doc, Row, Box, Edge, Sticky } from "tldsl";

// D15. `check` only validates the IR, never rendered geometry, so an
// occluding note and a mid-skip label both pass clean while the diagram
// loses content: the note parked on `first` buries `second` and `third`,
// and the "skip" edge's label lands on `second`, the shape it skips over.
export default function D15() {
  return (
    <Doc>
      <Row id="trio" gap="24">
        <Box id="first" label="first" />
        <Box id="second" label="second" />
        <Box id="third" label="third" />
      </Row>
      <Edge from="first" to="third" label="skip" font="sans" size="s" />
      <Sticky on="first">
        This note is deliberately long, long enough that it drifts sideways
        far enough to bury both of its neighbours completely.
      </Sticky>
    </Doc>
  );
}
