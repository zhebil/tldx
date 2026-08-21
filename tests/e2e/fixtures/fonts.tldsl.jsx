import { Doc, Frame, Box, Note, Sticky } from "tldsl";

const FONTS = ["draw", "sans", "serif", "mono"];
const FONT_SIZES = ["s", "m", "l", "xl"];

export default function Diagram() {
  return (
    <Doc layout="col" gap="40">
      <Frame id="boxes" name="Font x size" layout="grid" cols="4" gap="16" pad="16">
        {FONTS.flatMap((font, i) =>
          FONT_SIZES.map((size, j) => (
            <Box
              key={`b-${i}-${j}`}
              id={`b-${i}-${j}`}
              label={`${font} ${size} Gateway`}
              font={font}
              size={size}
            />
          )),
        )}
      </Frame>

      <Frame id="notes" name="Note / sticky fonts" layout="row" gap="24" pad="16">
        <Note id="n-serif" font="serif" size="l">
          Serif note, large.
        </Note>
        <Sticky id="s-mono" font="mono" size="s">
          Mono sticky, small.
        </Sticky>
      </Frame>
    </Doc>
  );
}
