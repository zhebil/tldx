export type {
  IRBox,
  IRBoxPositioned,
  IRContainer,
  IRDoc,
  IRDocPositioned,
  IREdge,
  IRElement,
  IRElementPositioned,
  IRFrame,
  IRFramePositioned,
  IRNote,
  IRNotePositioned,
} from "./ir.js";
export { isContainer } from "./ir.js";
export { lower, type LowerResult } from "./lower.js";
export {
  ARROWHEADS,
  COLORS,
  DASHES,
  FILLS,
  type StyleArrowhead,
  type StyleColor,
  type StyleDash,
  type StyleFill,
} from "./styles.js";
