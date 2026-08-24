import { Doc, Box, Edge, Text } from "tldx";

export default function Diagram() {
  return (
    <Doc id="release-pipeline">
      <Box id="commit" label="Commit pushed" />
      <Box id="lint" label="Lint" />
      <Box id="unit" label="Unit tests" />
      <Box id="build" label="Build image" />
      <Box id="scan" label="Security scan" />
      <Box id="integration" label="Integration tests" />
      <Box id="publish" label="Push to registry" />
      <Box id="staging" label="Deploy staging" />
      <Box id="smoke" label="Smoke tests" />
      <Box id="approval" label="Manual approval" />
      <Box id="canary" label="Canary 5%" />
      <Box id="metrics" label="Watch metrics" />
      <Box id="rollout" label="Full rollout" />
      <Box id="rollback" label="Rollback" />
      <Box id="notify" label="Notify Slack" />
      <Box id="archive" label="Archive artifacts" />

      <Edge id="e-commit-lint" from="commit" to="lint" />
      <Edge id="e-commit-unit" from="commit" to="unit" />
      <Edge id="e-lint-build" from="lint" to="build" />
      <Edge id="e-unit-build" from="unit" to="build" />
      <Edge id="e-build-scan" from="build" to="scan" />
      <Edge id="e-build-integration" from="build" to="integration" />
      <Edge id="e-scan-publish" from="scan" to="publish" />
      <Edge id="e-integration-publish" from="integration" to="publish" />
      <Edge id="e-publish-staging" from="publish" to="staging" />
      <Edge id="e-staging-smoke" from="staging" to="smoke" />
      <Edge id="e-smoke-approval" from="smoke" to="approval" />
      <Edge id="e-approval-canary" from="approval" to="canary" />
      <Edge id="e-canary-metrics" from="canary" to="metrics" />
      <Edge id="e-metrics-rollout" from="metrics" to="rollout" />
      <Edge id="e-metrics-rollback" from="metrics" to="rollback" />
      <Edge id="e-rollback-publish" from="rollback" to="publish" />
      <Edge id="e-rollout-notify" from="rollout" to="notify" />
      <Edge id="e-rollout-archive" from="rollout" to="archive" />
      <Edge id="e-scan-notify" from="scan" to="notify" />
      <Edge id="e-smoke-notify" from="smoke" to="notify" />

      <Text id="note-rollback" maxW="420">
        Rollback re-deploys the previously published image rather than
        rebuilding, so it skips every stage up to the registry push.
      </Text>
    </Doc>
  );
}
