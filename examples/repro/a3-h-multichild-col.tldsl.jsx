// A3 control. Same shape as a3-h-multichild-row.tldsl.jsx (Box with
// explicit h plus a plain sibling) but layout="col" instead of "row".
// Isolates row-vs-col/grid as the actual variable, not child count: if the
// bug is in the col/grid width-sharing pass, h drops here too even with a
// sibling present.
import { Doc, Box } from "tldsl";

export default function MultiChildCol() {
  return (
    <Doc layout="col">
      <Box id="tall" label="Tall" h="200" />
      <Box id="plain" label="Plain" />
    </Doc>
  );
}
