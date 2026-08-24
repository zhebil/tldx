import { Doc, Frame, Box, Text, Sticky } from "tldx";

const TEXT_ALIGNS = ["start", "middle", "end"];
const VERTICAL_ALIGNS = ["start", "middle", "end"];
const LABEL_COLORS = ["red", "blue"];

export default function Diagram() {
  return (
    <Doc layout="col" gap="40">
      <Frame id="boxes" name="Box alignment" layout="grid" cols="3" gap="16" pad="16">
        {TEXT_ALIGNS.flatMap((textAlign, i) =>
          VERTICAL_ALIGNS.map((verticalAlign, j) => (
            <Box
              key={`b-${i}-${j}`}
              id={`b-${i}-${j}`}
              label="Label"
              w="260"
              h="140"
              textAlign={textAlign}
              verticalAlign={verticalAlign}
              labelColor={LABEL_COLORS[(i + j) % LABEL_COLORS.length]}
            />
          )),
        )}
      </Frame>

      {/* <Text> has no verticalAlign/labelColor/h - tldraw's real text shape
          has neither (see contracts/builders.ts#textShape); only textAlign
          and w (wrap budget) carry over from the old Note-alignment grid. */}
      <Frame id="texts" name="Text alignment" layout="row" gap="24" pad="16">
        {TEXT_ALIGNS.map((textAlign, i) => (
          <Text key={`t-${i}`} id={`t-${i}`} w="180" textAlign={textAlign}>
            Text
          </Text>
        ))}
      </Frame>

      <Frame id="stickies" name="Sticky alignment" layout="row" gap="24" pad="16">
        {TEXT_ALIGNS.map((textAlign, i) => (
          <Sticky
            key={`s-${i}`}
            id={`s-${i}`}
            textAlign={textAlign}
            verticalAlign={VERTICAL_ALIGNS[i]}
            labelColor={LABEL_COLORS[i % LABEL_COLORS.length]}
          >
            Sticky
          </Sticky>
        ))}
      </Frame>
    </Doc>
  );
}
