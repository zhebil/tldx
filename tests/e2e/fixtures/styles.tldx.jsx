import { Doc, Frame, Box, Edge, Text, Sticky } from "tldx";

const COLORS = [
  "black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow",
  "orange", "green", "light-green", "light-red", "red", "white",
];
const FILLS = ["none", "semi", "solid", "pattern", "fill"];
const DASHES = ["draw", "solid", "dashed", "dotted"];
const ARROWHEADS = [
  "arrow", "triangle", "square", "dot", "pipe", "diamond", "inverted", "bar", "none",
];

export default function Diagram() {
  return (
    <Doc layout="col" gap="40">
      <Frame id="palette" name="Palette" color="blue" layout="grid" cols="4" gap="16" pad="16">
        {COLORS.map((color, i) => (
          <Box
            key={color}
            id={`c-${i}`}
            label={color}
            color={color}
            fill={FILLS[i % FILLS.length]}
            dash={DASHES[i % DASHES.length]}
          />
        ))}
      </Frame>

      <Frame id="arrows" name="Arrowheads" layout="row" gap="24" pad="16">
        {ARROWHEADS.map((_, i) => (
          <Box key={`n-${i}`} id={`n-${i}`} label={`${i}`} />
        ))}
      </Frame>

      {ARROWHEADS.map((_, i) => (
        <Edge
          key={`e-${i}`}
          id={`e-${i}`}
          from={`n-${i}`}
          to={`n-${(i + 1) % ARROWHEADS.length}`}
          arrowheadStart={ARROWHEADS[i]}
          arrowheadEnd={ARROWHEADS[(i + 1) % ARROWHEADS.length]}
          color={COLORS[i]}
          dash={DASHES[i % DASHES.length]}
        />
      ))}

      <Text id="n-note" color="light-green">Text color pass-through.</Text>
      <Sticky id="s-note" color="light-red" on="arrows">Sticky color pass-through.</Sticky>
    </Doc>
  );
}
