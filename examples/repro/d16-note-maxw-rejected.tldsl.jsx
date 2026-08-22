import { Doc, Frame, Box, Note } from "tldsl";

// D16 (fixed): the skill documents `maxW` on <Note>, and it now caps a
// non-sticky note's wrap width the same way it caps a <Box>'s - the note
// below stays 160px wide instead of spreading across the whole row.

export default function NoteMaxW() {
  return (
    <Doc>
      <Frame id="row" name="Topics" layout="row" gap="48">
        <Box id="a" label="orders.v1" />
        <Box id="b" label="payments.v1" />
        <Box id="c" label="shipments.v1" />
      </Frame>
      <Note on="a" maxW="160">Checkout saga: orders, payments and shipping compensate back through orders.v1.</Note>
    </Doc>
  );
}
