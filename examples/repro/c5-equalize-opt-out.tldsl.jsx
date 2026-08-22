// C5. A `col` gives every flowed box the tallest sibling's height, which is
// right for a service map but wrong when the box height *is* the data: a
// context-window diagram meant to convey 5% / 35% / 60% by height came out
// with three equal boxes, and the only workaround was pinning both `w` and
// `h` on every box. `equalize="false"` opts a container out of the shared
// height (width sharing is untouched, so the column still lines up).
//
// Left column (default, equalize unset): all three boxes come out the same
// height. Right column (`equalize="false"`): height tracks each box's own
// label length, so the three are visibly different.
import { Doc, Col, Box } from "tldsl";

const ZONES = [
  { id: "small", label: "System prompt" },
  {
    id: "mid",
    label:
      "Conversation history: the middle tier, moderate traffic, cache-warm, roughly a third of the context window",
  },
  {
    id: "big",
    label:
      "Retrieved documents: the largest tier, cold-storage archive holding the majority of the context window, spanning several paragraphs of retained material that rarely gets evicted",
  },
];

export default function EqualizeOptOut() {
  return (
    <Doc layout="row" gap="80">
      <Col id="equalized" gap="16">
        {ZONES.map((z) => <Box id={`eq-${z.id}`} label={z.label} />)}
      </Col>
      <Col id="natural" gap="16" equalize={false}>
        {ZONES.map((z) => <Box id={`nat-${z.id}`} label={z.label} />)}
      </Col>
    </Doc>
  );
}
