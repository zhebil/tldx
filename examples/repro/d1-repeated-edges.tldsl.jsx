// D1. Three ordered messages between the same two participants. All three
// arrows land on one path and the three labels overprint into one smear.
import { Doc, Group, Box, Edge } from "tldsl";

export default function RepeatedEdges() {
  return (
    <Doc>
      <Group id="peers" layout="row" gap="300">
        <Box id="client" label="Client" />
        <Box id="server" label="Server" />
      </Group>
      <Edge from="client" to="server" label="SYN" />
      <Edge from="server" to="client" label="SYN-ACK" />
      <Edge from="client" to="server" label="ACK" />
    </Doc>
  );
}
