import { Doc, Frame, Box, Edge } from "tldx";

export default function Diagram() {
  return (
    <Doc layout="col" gap="40">
      <Frame id="pipeline" name="Pipeline" layout="row" gap="24" pad="16">
        <Box id="ingest" label="Ingest" />
        <Box id="validate" label="Validate" />
        <Box id="publish" label="Publish" />
      </Frame>

      <Frame id="downstream" name="Downstream" layout="row" gap="24" pad="16">
        <Box id="retry-queue" label="Retry Queue" />
        <Box id="db" label="DB" />
        <Box id="cache" label="Cache" />
      </Frame>

      <Edge id="e-ingest-validate" from="ingest" to="validate" label="reads" />
      <Edge id="e-validate-publish" from="validate" to="publish" label="on success" />
      <Edge id="e-ingest-publish" from="ingest" to="publish" label="publishes" />
      <Edge id="e-validate-retry" from="validate" to="retry-queue" label="on failure" />
      <Edge id="e-retry-ingest" from="retry-queue" to="ingest" label="retries" />
      <Edge
        id="e-publish-db"
        from="publish"
        to="db"
        label="writes"
        labelColor="red"
        font="mono"
        size="xl"
      />
      <Edge id="e-publish-cache" from="publish" to="cache" label="invalidates" />
    </Doc>
  );
}
