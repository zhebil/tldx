import { Doc, Frame, Box, Edge, flow } from "tldsl";

// D21. An edge whose endpoints are in different containers is drawn as a
// straight chord between the two shapes, with no regard for what is in
// between. Forwards that is usually survivable, because the chord runs with
// the layout axis. Backwards it is not: the return edge has to cross
// everything the forward path already laid out.
//
// `retry -> a1` runs from the off-ramp row up to the first box of the top row
// and passes straight through `b1` and out through a frame border it does not
// belong to, and its label is stamped on `b1` on the way. There is no routing
// prop, no waypoint syntax and no orthogonal option to ask for anything else.
//
// arrow-truth: 1 arrow path crossing a non-endpoint shape, 1 label overlapping
// a non-endpoint shape. layout-report: 1 edge crossing a frame boundary it
// does not belong to.

export default function D21() {
  return (
    <Doc layout="col" gap="96">
      <Frame id="top" name="first stage row" layout="row" gap="64">
        <Box id="a1" label="Commit" />
        <Box id="a2" label="Build" />
        <Box id="a3" label="Unit tests" />
        <Box id="a4" label="Integration tests" />
        <Box id="a5" label="Package" />
      </Frame>

      <Frame id="bottom" name="second stage row" layout="row" gap="64">
        <Box id="b1" label="Deploy to staging" />
        <Box id="b2" label="Verify" />
        <Box id="b3" label="Deploy to production" />
        <Box id="b4" label="Release" />
      </Frame>

      <Frame id="offramp" name="off-ramps" layout="row" gap="96">
        <Box id="retry" label="Retry" color="red" />
        <Box id="done" label="Done" color="green" />
      </Frame>

      {flow("a1", "a2", "a3", "a4", "a5")}
      {flow("b1", "b2", "b3", "b4")}
      <Edge from="a5" to="b1" label="promote" font="sans" size="s" />
      <Edge from="b2" to="retry" label="failed" font="sans" size="s" color="red" />
      <Edge from="b4" to="done" label="ok" font="sans" size="s" color="green" />
      <Edge from="retry" to="a1" label="fix and re-push" font="sans" size="s" dash="dashed" />
    </Doc>
  );
}
