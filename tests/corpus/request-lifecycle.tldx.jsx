import { Doc, Frame, Box, Edge, Sticky, flow } from "tldx";

export default function Diagram() {
  return (
    <Doc id="request-lifecycle" layout="row" gap="88">
      <Frame id="main" name="Request lifecycle" layout="col" gap="28" pad="20" color="blue">
        <Box id="receive" label="Request received" color="blue" fill="semi" />
        <Box id="auth" label="Authenticate" color="blue" fill="semi" />
        <Box id="cache" label="Cache lookup" color="blue" fill="semi" />
        <Box id="handler" label="Route handler" color="blue" fill="solid" />
        <Box id="query" label="Query Postgres" color="blue" fill="semi" />
        <Box id="serialize" label="Serialize JSON" color="blue" fill="semi" />
        <Box id="respond" label="200 OK" color="green" fill="semi" />
      </Frame>

      <Frame id="branches" name="Short circuits" layout="col" gap="120" pad="20" color="orange">
        <Box id="reject" label="401 Unauthorized" color="red" fill="semi" />
        <Box id="cached" label="200 from cache" color="green" fill="semi" />
      </Frame>

      {flow("receive", "auth", "cache", "handler", "query", "serialize", "respond")}

      <Edge id="e-auth-reject" from="auth" to="reject" label="no token" color="red" />
      <Edge id="e-cache-cached" from="cache" to="cached" label="hit" color="green" />

      <Sticky id="n-cache" on="cached" color="yellow">
        A cache hit skips the handler and the database entirely.
      </Sticky>
    </Doc>
  );
}
