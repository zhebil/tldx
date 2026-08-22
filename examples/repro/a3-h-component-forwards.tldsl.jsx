// A3 control. h="420" passed to a user component that destructures and
// forwards h onto the underlying <Box>, with a sibling and layout="row" so
// the col/grid width-sharing bug (see a3-h-only-child.tldsl.jsx) cannot
// mask the result - Doc defaults to col, same as Frame, so a sole child
// falls into the same trap regardless of whether it came via a component.
// If this box comes out ~420 tall, forwarding-through-a-component works
// fine and the bug is specific to components that drop the prop.
import { Doc, Box } from "tldsl";

function EditorServer({ ns, h }) {
  return <Box id={ns} label={ns} h={h} />;
}

export default function ComponentForwards() {
  return (
    <Doc layout="row">
      <EditorServer ns="ex" h="420" />
      <Box id="plain" label="Plain" />
    </Doc>
  );
}
