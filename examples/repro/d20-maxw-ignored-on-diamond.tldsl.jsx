import { Doc, Frame, Box } from "tldsl";

// D20. Inside a row, `maxW` holds on a rectangle and is ignored on a diamond.
// Both rows below carry the same two labels and the same maxW="200". In `same`
// the second box is a rectangle and comes out 188x152. In `diamond` it is a
// diamond and comes out 492x320 - 2.6x the cap - and it drags every sibling in
// the row from 152 to 320 tall.
//
// layout-report on this file:
//   same:     rect 186x152, rect 188x152
//   diamond:  rect 186x320, diamond 492x320

export default function D20() {
  return (
    <Doc layout="col" gap="64">
      <Frame id="same" name="both rectangles" layout="row" gap="64">
        <Box id="a" maxW="200" label={"Deploy to staging\nhelm upgrade, 1 replica"} />
        <Box id="b" maxW="200" label={"Health gate\nerror rate < 1% for 10 min"} />
      </Frame>

      <Frame id="diamond" name="second one is a diamond" layout="row" gap="64">
        <Box id="c" maxW="200" label={"Deploy to staging\nhelm upgrade, 1 replica"} />
        <Box id="d" maxW="200" geo="diamond" label={"Health gate\nerror rate < 1% for 10 min"} />
      </Frame>
    </Doc>
  );
}
