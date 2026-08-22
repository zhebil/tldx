import { Doc, Col, Box, Sticky, Text } from "tldsl";

// C1 (tldsl-b8v): exercises <Text> standalone, as a <Col> heading, long
// enough to need wrapping, and next to a <Sticky> for contrast - render this
// and look, per this branch's rule (see AGENTS.md).

export default function C1Text() {
  return (
    <Doc layout="col" gap="48">
      <Text id="standalone">Standalone caption</Text>

      <Col id="section" gap="16">
        <Text id="heading" font="sans">
          Phase 1 (non collaborative)
        </Text>
        <Box id="a" label="Client" />
        <Box id="b" label="Server" />
      </Col>

      <Text id="wrapped" maxW="240">
        This caption is deliberately long enough that it has to wrap onto
        several lines instead of running off the canvas as one unbroken row
        of glyphs.
      </Text>

      <Col id="contrast" gap="16">
        <Text id="plain-caption">A borderless caption, no fill, no border.</Text>
        <Sticky id="a-sticky">A real tldraw sticky note, fixed 200px wide.</Sticky>
      </Col>
    </Doc>
  );
}
