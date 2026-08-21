import { Doc, Group, Box } from "tldsl";

// D12. <Group> needs an `id` even though it draws no chrome and nothing may
// point an edge at it. Delete `id="clients"` below and `check` says:
//
//   error[ir/missing-id]: '<frame>' is addressable and requires an explicit 'id'
//
// - a component name that does not appear anywhere in this file. The skill's
// component table marks `id` as required on <Frame> and <Box> only.
export default function D12() {
  return (
    <Doc layout="col" gap="48">
      <Group id="clients" layout="row" gap="160">
        <Box id="browser" label="Browser" />
        <Box id="payments" label="Payments API" dash="dashed" />
      </Group>
    </Doc>
  );
}
