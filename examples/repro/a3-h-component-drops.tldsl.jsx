// A3 case 3. h="420" passed to a user component that reads `ns` but never
// destructures or forwards `h` onto the underlying <Box>. Same row+sibling
// shape as a3-h-component-forwards.tldsl.jsx so the comparison isolates
// forwarding, not layout mode. This is the reported
// <EditorServer ns="ex" h="420" /> shape verbatim - the prop is silently
// swallowed by the component body, not by lowering. There is no prop
// allowlist for a user component, so this is undetectable by tldsl.
import { Doc, Box } from "tldsl";

function EditorServer({ ns }) {
  return <Box id={ns} label={ns} />;
}

export default function ComponentDrops() {
  return (
    <Doc layout="row">
      <EditorServer ns="ex" h="420" />
      <Box id="plain" label="Plain" />
    </Doc>
  );
}
