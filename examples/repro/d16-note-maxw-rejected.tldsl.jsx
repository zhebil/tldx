import { Doc, Frame, Box, Note } from "tldsl";

// D16: the skill documents `maxW` on <Note> and <Sticky>, and `check` rejects
// it on both. Add `maxW="160"` to the note below to get
// `ir/unknown-prop: 'maxW' is not supported on '<note>'`. The allowed set does
// include `w`, so the capability exists under an undocumented name - swap the
// prop for `w="200"` and it compiles, and the note grows tall instead of wide.

export default function NoteMaxW() {
  return (
    <Doc>
      <Frame id="row" name="Topics" layout="row" gap="48">
        <Box id="a" label="orders.v1" />
        <Box id="b" label="payments.v1" />
        <Box id="c" label="shipments.v1" />
      </Frame>
      <Note on="a">Checkout saga: orders, payments and shipping compensate back through orders.v1.</Note>
    </Doc>
  );
}
