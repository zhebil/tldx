import { Doc, Box, Edge } from "tldsl";

// B9. `<Edge from to>` binds centre-to-centre - tldraw's own nearest-point
// heuristic then picks wherever that ray crosses each box's outline, which
// is an authoring decision no router can infer (the motivating report:
// `ds-routine -> sr` entered a frame at top-centre and crossed its own
// title). `fromSide`/`toSide` (8 compass points + `center`, or an "x,y"
// fraction, docs/jsx-pivot.md decision 4 / ADR-6) let the author pin the
// exit/entry face directly, as separate props rather than `id.anchor`
// dotted syntax - the dotted form collides with an id that uses `.` as a
// namespace separator (tldsl-4s1); a prop never does.
//
// Without fromSide/toSide, this edge binds A's bottom-right-ish corner to
// B's top-left-ish corner (tldraw's default nearest-point pick for a
// diagonal pair). With them, it leaves A's right face and arrives at B's
// top face - visibly different, and stable regardless of how A/B move.
export default function B9() {
  return (
    <Doc layout="free">
      <Box id="a" x="0" y="0" w="140" h="70" label="A" />
      <Box id="b" x="260" y="180" w="140" h="70" label="B" />
      <Edge from="a" to="b" label="calls" fromSide="right" toSide="top" />
    </Doc>
  );
}
