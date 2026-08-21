import { Doc, Frame, Box, Edge } from "tldsl";

// D11. An edge that skips a tier. Its label is stamped at the geometric
// midpoint of the arrow, which is inside the middle tier, so it lands on top of
// "app-3" and the two labels overprint.
export default function D11() {
  return (
    <Doc layout="col" gap="80">
      <Frame id="edge" name="Edge" layout="row" gap="96">
        <Box id="cdn" label="CDN" />
        <Box id="lb" label="Load balancer" />
      </Frame>
      <Frame id="app-tier" name="App tier" layout="row" gap="48">
        <Box id="app-1" label="app-1" />
        <Box id="app-2" label="app-2" />
        <Box id="app-3" label="app-3" />
      </Frame>
      <Frame id="data" name="Data" layout="row" gap="80">
        <Box id="objects" label="Object storage" geo="cloud" />
      </Frame>
      <Edge from="cdn" to="objects" label="origin pull" font="sans" size="s" dash="dashed" />
    </Doc>
  );
}
