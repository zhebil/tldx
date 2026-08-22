// A3 case 1. h="200" on a Box that is one of several children of a row.
// Reported: applied (measured 283x200 in the SVG).
import { Doc, Box } from "tldsl";

export default function MultiChildRow() {
  return (
    <Doc layout="row">
      <Box id="tall" label="Tall" h="200" />
      <Box id="plain" label="Plain" />
    </Doc>
  );
}
