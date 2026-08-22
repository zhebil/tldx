// A3 control. h={h} passed straight to a top-level <Box> from a local
// variable - no component in between. Same shape as
// a3-h-multichild-row.tldsl.jsx (row, two children, one explicit h) so the
// only variable that changes is literal-vs-identifier. Isolates whether
// lowering itself drops a non-literal numeric attr, independent of user
// component forwarding.
import { Doc, Box } from "tldsl";

export default function VariableTopLevel() {
  const h = 200;
  return (
    <Doc layout="row">
      <Box id="tall" label="Tall" h={h} />
      <Box id="plain" label="Plain" />
    </Doc>
  );
}
