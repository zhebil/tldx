// A3 control. Same shape as a3-h-only-child.tldsl.jsx (Box with explicit h,
// sole child of a Frame) but the frame is layout="row" instead of the
// default col. Isolates row-vs-col/grid as the actual variable, not child
// count.
import { Doc, Frame, Box } from "tldsl";

export default function OnlyChildRow() {
  return (
    <Doc>
      <Frame id="wrap" layout="row">
        <Box id="solo" label="Solo" h="460" />
      </Frame>
    </Doc>
  );
}
