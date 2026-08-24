import { Doc, Box, Edge } from "tldx";

const bigLeaves = Array.from({ length: 18 }, (_, i) => ({
  id: `leaf-${i + 1}`,
  label: `Worker ${i + 1}`,
}));

const smallLeaves = Array.from({ length: 6 }, (_, i) => ({
  id: `mini-${i + 1}`,
  label: `Task ${i + 1}`,
}));

export default function Diagram() {
  return (
    <Doc id="wide-fanout">
      <Box id="hub" label="Dispatcher" />
      {bigLeaves.map((l) => (
        <Box id={l.id} label={l.label} />
      ))}
      {bigLeaves.map((l) => (
        <Edge id={`e-${l.id}`} from="hub" to={l.id} />
      ))}

      <Box id="mini-hub" label="Scheduler" />
      {smallLeaves.map((l) => (
        <Box id={l.id} label={l.label} />
      ))}
      {smallLeaves.map((l) => (
        <Edge id={`e-${l.id}`} from="mini-hub" to={l.id} />
      ))}

      <Edge id="e-hub-mini-hub" from="hub" to="mini-hub" />
    </Doc>
  );
}
