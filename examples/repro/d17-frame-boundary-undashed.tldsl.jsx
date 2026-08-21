import { Doc, Frame, Box } from "tldsl";

// C4 draws a system boundary as a dashed rectangle with its name on it.
// Add dash="dashed" to the <Frame> below and check rejects it:
//   error[ir/unknown-prop]: 'dash' is not supported on '<frame>'
//   (allowed: id, name, direction, layout, gap, pad, cols, align, x, y, w, h, color)
// A <Box dash="dashed"> is fine, which is why the external system next to it
// can be dashed and the boundary around the containers cannot.
// Render this: the boundary is an ordinary solid frame and its name is the
// smallest text on the canvas.

export default function FrameBoundaryUndashed() {
  return (
    <Doc layout="row" gap="96">
      <Frame id="boundary" name="Internet Banking System" layout="row" gap="48">
        <Box id="web-app" label={"Web Application\n[Container: Java, Spring MVC]"} maxW="240" />
        <Box id="api-app" label={"API Application\n[Container: Java, Spring MVC]"} maxW="240" />
      </Frame>
      <Box id="mainframe" label={"Mainframe Banking System\n[Software System]"} maxW="240" dash="dashed" color="grey" />
    </Doc>
  );
}
