// D1 (tldsl-2rr). The compact <Edges> form: one line per edge instead of a
// multi-attribute <Edge> tag per edge, with a chain ("login -> auth ->
// tokens") expanding to as many edges as hops. Props other than the spec
// text (here font/size) are block-level - shared by every edge <Edges>
// produces. The one edge that needs its own color/dash drops back to a
// hand-written <Edge>, the escape hatch this form doesn't try to replace.
import { Doc, Box, Edge, Edges } from "tldsl";

export default function CompactEdges() {
  return (
    <Doc layout="row" gap="80">
      <Box id="user" label="User" />
      <Box id="login" label="Login form" />
      <Box id="auth" label="Auth service" />
      <Box id="tokens" label="Token store" />
      <Box id="denied" label="Access denied" color="red" />

      <Edges font="sans" size="s">{`
        user -> login: enters credentials
        login -> auth -> tokens: verified, session written
      `}</Edges>

      <Edge from="auth" to="denied" label="bad credentials" color="red" dash="dashed" />
    </Doc>
  );
}
