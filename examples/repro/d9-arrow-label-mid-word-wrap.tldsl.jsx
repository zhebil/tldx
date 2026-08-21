import { Doc, Row, Box, Edge } from "tldsl";

// D9. One seven-letter word on a horizontal edge between two adjacent boxes.
// It renders as "dequeu" over "e". Leaving `gap` off entirely gives the same
// broken word, and so do gap="120" and gap="144"; it only comes right somewhere
// between 144 and 160. The author has to find that number by rendering.
export default function D9() {
  return (
    <Doc layout="col" gap="80">
      <Row id="async" name="Async" gap="96">
        <Box id="queue" label="Job queue" />
        <Box id="worker" label="Background worker" />
      </Row>
      <Edge from="queue" to="worker" label="dequeue" font="sans" size="s" />
    </Doc>
  );
}
