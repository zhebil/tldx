// D2. A <Row> with no `name` still draws a border and captions itself "Frame".
import { Doc, Row, Box } from "tldsl";

export default function UnnamedFrameCaption() {
  return (
    <Doc>
      <Row id="lane" gap="48">
        <Box id="a" label="A" />
        <Box id="b" label="B" />
      </Row>
    </Doc>
  );
}
