import { Doc, Box } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="dup">
      <Box id="x" />
      <Box id="x" />
    </Doc>
  );
}
