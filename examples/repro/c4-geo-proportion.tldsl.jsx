import { Doc, Frame, Box } from "tldsl";

// C4. Non-rectangular geo shapes should hold a sane aspect ratio when the
// author has not pinned w/h - a diamond/ellipse/hexagon that inherits a
// rectangle's wrap-derived proportions comes out wide and flat instead of
// reading as the shape it claims to be. Three label lengths per geo (short,
// medium, long) plus one pinned box to prove the opt-out.
export default function C4GeoProportion() {
  return (
    <Doc layout="col" gap="48">
      <Frame id="diamonds" name="diamonds" layout="row" gap="48">
        <Box id="dia-short" geo="diamond" label="OK" />
        <Box id="dia-medium" geo="diamond" label="Health gate" />
        <Box id="dia-long" geo="diamond" label="error rate below 1 percent for 10 minutes straight" />
      </Frame>

      <Frame id="ellipses" name="ellipses" layout="row" gap="48">
        <Box id="ell-short" geo="ellipse" label="Go" />
        <Box id="ell-medium" geo="ellipse" label="Payments API" />
        <Box id="ell-long" geo="ellipse" label="A very long service name that should stay readable" />
      </Frame>

      <Frame id="hexagons" name="hexagons" layout="row" gap="48">
        <Box id="hex-short" geo="hexagon" label="Idle" />
        <Box id="hex-medium" geo="hexagon" label="Processing order" />
        <Box id="hex-long" geo="hexagon" label="Waiting for external confirmation from partner bank" />
      </Frame>

      <Frame id="pinned" name="pinned opt-out" layout="row" gap="48">
        <Box id="pinned-w" geo="diamond" label="Pinned" w="400" />
        <Box id="pinned-h" geo="diamond" label="Pinned tall" h="300" />
      </Frame>
    </Doc>
  );
}
