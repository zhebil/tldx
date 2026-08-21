import { Doc, Swimlanes, Frame, Box, Edge } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="swimlanes-release" layout="col" gap="40">
      <Swimlanes id="release" name="Release process" gap="40" pad="24" color="grey">
        <Frame id="lane-dev" name="Dev" gap="56" pad="16" color="blue">
          <Box id="commit" label="Commit" color="blue" fill="semi" />
          <Box id="review" label="Review" color="blue" fill="semi" />
          <Box id="merge" label="Merge" color="blue" fill="semi" />
        </Frame>
        <Frame id="lane-ci" name="CI" gap="56" pad="16" color="orange">
          <Box id="build" label="Build" color="orange" fill="semi" />
          <Box id="test" label="Test" color="orange" fill="semi" />
          <Box id="package" label="Package" color="orange" fill="semi" />
        </Frame>
        <Frame id="lane-ops" name="Ops" gap="56" pad="16" color="green">
          <Box id="deploy" label="Deploy" color="green" fill="semi" />
          <Box id="verify" label="Verify" color="green" fill="semi" />
          <Box id="notify" label="Notify" color="green" fill="solid" />
        </Frame>
      </Swimlanes>

      <Edge id="e-commit-review" from="commit" to="review" color="blue" />
      <Edge id="e-review-merge" from="review" to="merge" color="blue" />
      <Edge id="e-merge-build" from="merge" to="build" label="triggers" color="grey" />
      <Edge id="e-build-test" from="build" to="test" color="orange" />
      <Edge id="e-test-package" from="test" to="package" color="orange" />
      <Edge id="e-package-deploy" from="package" to="deploy" label="ships" color="grey" />
      <Edge id="e-deploy-verify" from="deploy" to="verify" color="green" />
      <Edge id="e-verify-notify" from="verify" to="notify" color="green" />
    </Doc>
  );
}
