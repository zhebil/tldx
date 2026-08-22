import { Doc, Frame, Box } from "tldsl";

// D10. Two tiers of a layered stack. Each frame used to be sized to its own
// contents and centred, so the stack came out ragged - "Edge" a third the width
// of "Data", neither edge lining up. Fixed in T48: `align="stretch"` grows every
// flowed child to the container's cross-axis extent. Delete it to see the defect.
export default function D10() {
  return (
    <Doc layout="col" gap="48" align="stretch">
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
