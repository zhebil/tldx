import { Doc, Frame, Box, Edge } from "tldsl";

// D14. Antiparallel edges get separated by bowing sideways, but the bow is
// mis-scaled against edge length. Case A: `a` and `b` sit ~400px apart with
// `side` beside the gap; the a<->b bow strays far enough off the straight
// line to sail over `side`. Case B: `c` and `d` are adjacent in one row, so
// their two arcs get almost no separation and sit on top of each other.
export default function D14() {
  return (
    <Doc layout="row" gap="160">
      <Frame id="tall" name="Tall" layout="col" gap="24">
        <Box id="a" label="a" />
        <Frame id="side-wrap" name="Obstacle" layout="col">
          <Box
            id="side"
            label="an intentionally very wide obstacle box sitting right between a and b"
            font="sans"
            size="xl"
          />
        </Frame>
        <Box id="b" label="b" />
      </Frame>
      <Frame id="near" name="Near" layout="row" gap="24">
        <Box id="c" label="c" />
        <Box id="d" label="d" />
      </Frame>
      <Edge from="a" to="b" />
      <Edge from="b" to="a" />
      <Edge from="c" to="d" />
      <Edge from="d" to="c" />
    </Doc>
  );
}
