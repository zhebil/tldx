import { Doc, Frame, Box, Note, Sticky } from "tldsl";

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

      <Frame id="notes" name="Note alignment" layout="grid" cols="3" gap="16" pad="16">
        {TEXT_ALIGNS.map((textAlign, i) => (
          <Note
            key={`n-${i}`}
            id={`n-${i}`}
            w="260"
            h="140"
            textAlign={textAlign}
            verticalAlign={VERTICAL_ALIGNS[i]}
            labelColor={LABEL_COLORS[i % LABEL_COLORS.length]}
          >
            Note
          </Note>
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
