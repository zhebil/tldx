import { Doc, Box, Edge } from "tldsl";

const nodes = Array.from({ length: 24 }, (_, i) => ({
  id: `n${i + 1}`,
  label: `Node ${i + 1}`,
}));

const edges = [
  ["n1", "n2"],
  ["n3", "n4"],
  ["n5", "n6"],
  ["n7", "n8"],
  ["n9", "n10"],
  ["n11", "n12"],
  ["n13", "n14"],
  ["n20", "n21"],
];

export default function Diagram() {
  return (
    <Doc id="sparse-graph" layout="auto">
      {nodes.map((n) => (
        <Box id={n.id} label={n.label} />
      ))}
      {edges.map(([from, to]) => (
        <Edge id={`e-${from}-${to}`} from={from} to={to} />
      ))}
    </Doc>
  );
}
