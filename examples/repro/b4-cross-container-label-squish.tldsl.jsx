import { Doc, Group, Box, Edge } from "tldsl";

// B4, trimmed from tcp-groups.tldsl.jsx's `listen -> syn_rcvd` /
// `syn_sent -> syn_rcvd` defect. RE-SCOPED from the original report (it
// claimed "recv SYN / SYN,ACK" broke mid-word - it doesn't, it wraps at
// token boundaries); the real defect is the wrap *width* a labelled edge
// gets when it skips across `<Group>`/`<Frame>` boundaries.
//
// `stack.ts`'s `labelClearanceGap` reserves enough gap to keep tldraw from
// squishing a labelled edge's wrap width - but only between two flowed
// siblings *in the same container*. "sent" (nested inside the "pair" row)
// and "rcvd" (a sibling of "pair" in the outer column) were never siblings
// sharing one gap to reserve, so nothing widens the space between them, and
// their short diagonal chord squishes "recv SYN / SYN,ACK" down to 3 lines.
//
// `routing.ts` can't move a box (that's layout's job), but it can still
// grow the edge's own bend post-layout - `growBendForLabelSquish` does
// exactly that, widening the arc's own bounding box until tldraw's
// arrowLabel.ts stops squishing it. Render this file and look: the label
// should read as one line, not three.
export default function B4() {
  return (
    <Doc layout="col" gap="80">
      <Group id="opening" layout="col" gap="90">
        <Box id="closed" label="CLOSED" w="180" h="60" font="mono" size="s" />
        <Group id="pair" layout="row" gap="260">
          <Box id="sent" label="SYN_SENT" w="180" h="60" font="mono" size="s" />
          <Box id="listen" label="LISTEN" w="180" h="60" font="mono" size="s" />
        </Group>
        <Box id="rcvd" label="SYN_RCVD" w="180" h="60" font="mono" size="s" />
      </Group>

      <Edge from="sent" to="rcvd" label="recv SYN / SYN,ACK" font="sans" size="s" />
      <Edge from="listen" to="rcvd" label="recv SYN / SYN,ACK" font="sans" size="s" />
    </Doc>
  );
}
