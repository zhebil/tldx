import { Doc, Frame, Box } from "tldsl";

// D10. Two tiers of a layered stack. Each frame is sized to its own contents
// and centred, so the stack comes out ragged - "Edge" is a third the width of
// "Data" and neither edge of either frame lines up. `align="stretch"` on the
// <Doc> would be the fix; it is rejected with `ir/bad-align`.
export default function D10() {
  return (
    <Doc layout="col" gap="48">
      <Frame id="edge" name="Edge" layout="row" gap="48">
        <Box id="cdn" label="CDN" />
        <Box id="lb" label="Load balancer" />
      </Frame>
      <Frame id="data" name="Data" layout="row" gap="48">
        <Box id="cache" label="Redis" />
        <Box id="dbp" label="Postgres primary" />
        <Box id="dbr" label="Postgres replica" />
        <Box id="obj" label="Object storage" />
      </Frame>
    </Doc>
  );
}
