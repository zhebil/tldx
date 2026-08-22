import { Doc, Col, Box, Text } from "tldsl";

// D23 (new, found while building C1/tldsl-b8v): <Text> reuses <Box>'s own
// sizing pipeline (domain/layout/defaults.ts, via glyph-metrics.ts), which
// scales off tldraw's LABEL_FONT_PX table ({ s:18, m:22, l:26, xl:32 }) -
// the font sizes tldraw uses for a label drawn INSIDE a geo/note shape. A
// real standalone tldraw `text` shape (what <Text> emits) instead uses
// FONT_SIZES ({ s:18, m:24, l:36, xl:44 }) - a different, larger table,
// worst at size="xl" (32 vs 44px, +37%). Layout under-reserves height for
// a <Text> at a non-default size, so its wrapped lines can spill onto
// whatever sits below it. Render this and look: the heading below visibly
// overlaps the box beneath it. `check` reports no diagnostic - `check`
// only validates the IR, never rendered geometry (same class of gap as
// D15/D22). Fixing this needs a second font-size table in
// glyph-metrics.ts, out of scope for this session (that file is read-only
// for tldsl-b8v/tldsl-npd).

export default function D23() {
  return (
    <Doc>
      <Col id="section" gap="16">
        <Text id="heading" font="sans" size="xl">
          Phase 1 (non collaborative)
        </Text>
        <Box id="a" label="Client" />
        <Box id="b" label="Server" />
      </Col>
    </Doc>
  );
}
