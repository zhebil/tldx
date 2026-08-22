// A3 case 2. h="460" on a Box that is the only child of a frame. Reported:
// ignored, auto-sized to label height.
import { Doc, Frame, Box } from "tldsl";

export default function OnlyChild() {
  return (
    <Doc>
      <Frame id="wrap">
        <Box id="solo" label="Solo" h="460" />
      </Frame>
    </Doc>
  );
}
