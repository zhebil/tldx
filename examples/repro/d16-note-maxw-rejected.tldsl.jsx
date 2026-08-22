import { Doc, Frame, Box, Sticky } from "tldsl";

// D16 (regressed by C2, tldsl-npd): this used to demonstrate `maxW` capping
// a non-sticky <Note>'s wrap width to 160px instead of spreading across the
// row. Non-sticky <Note> is retired, and its only surviving attach-capable
// replacement, <Sticky>, ignores `maxW` - a real tldraw sticky is always
// 200px wide. A narrow *attached* annotation is no longer expressible; a
// non-attached one still is, via <Text maxW="160">. `maxW` below is kept to
// show it compiles (still an allowed no-op prop on <Sticky>, D16's original
// finding) but has no visual effect - the sticky renders 200px wide.

export default function NoteMaxW() {
  return (
    <Doc>
      <Frame id="row" name="Topics" layout="row" gap="48">
        <Box id="a" label="orders.v1" />
        <Box id="b" label="payments.v1" />
        <Box id="c" label="shipments.v1" />
      </Frame>
      <Sticky on="a" maxW="160">Checkout saga: orders, payments and shipping compensate back through orders.v1.</Sticky>
    </Doc>
  );
}
