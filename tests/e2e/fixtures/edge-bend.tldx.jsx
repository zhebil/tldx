/**
 * The four bends issue #30 records as `restyled (bend)` on this project's own
 * docs diagrams, written in JSX instead. The layout is a stand-in - only the
 * numbers matter, and `tests/e2e/edge-bend.test.ts` asserts each reaches the
 * emitted arrow shape untouched by the router.
 */
import { Doc, Group, Box, Edge } from "tldx";

export default function Diagram() {
  return (
    <Doc layout="col" gap="160" pad="120">
      <Group id="layers" layout="row" gap="60">
        <Box id="app-usecases" label="app/usecases" />
        <Box id="domain" label="domain" />
        <Box id="infra-list" label="infra" />
      </Group>

      <Group id="round-trip" layout="row" gap="60">
        <Box id="committed" label="committed" />
        <Box id="source" label="source" />
      </Group>

      <Edge id="e-app-domain" from="app-usecases" to="domain" bend="-43" />
      <Edge id="e-domain-infra" from="domain" to="infra-list" bend="-105" />
      <Edge id="e-infra-domain" from="infra-list" to="domain" bend="47" />
      <Edge id="e-committed-source" from="committed" to="source" bend="-289" />
    </Doc>
  );
}
