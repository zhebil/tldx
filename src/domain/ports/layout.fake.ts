/**
 * StubLayout: the deterministic fake for `LayoutPort`. Used by every test
 * that needs positioned IR without paying for ELK. The contract test
 * (`layout.contract.ts`) pins the universal guarantees; this implementation
 * additionally guarantees:
 *
 * - children are laid out left-to-right in document order at the top-left of
 *   their container (y = 0 within the container);
 * - frame width/height are computed as the bounding box of children plus
 *   `FRAME_PADDING`;
 * - explicit `x | y | w | h` from the IR are honored verbatim (free
 *   placement / hard pins survive layout).
 *
 * Edges are connectors: they pass through unchanged.
 */

import type {
  IRBox,
  IRBoxPositioned,
  IRDoc,
  IRDocPositioned,
  IRElement,
  IRElementPositioned,
  IRFrame,
  IRFramePositioned,
  IRNote,
  IRNotePositioned,
} from "../ir/index.js";

import type { LayoutPort } from "./layout.js";

const BOX_W = 120;
const BOX_H = 60;
const NOTE_W = 200;
const NOTE_H = 80;
const GAP = 40;
const FRAME_PADDING = 32;

export class StubLayout implements LayoutPort {
  async layout(ir: IRDoc): Promise<IRDocPositioned> {
    return {
      ...ir,
      children: layoutChildren(ir.children),
    };
  }
}

function layoutChildren(
  children: readonly IRElement[],
): IRElementPositioned[] {
  const out: IRElementPositioned[] = [];
  let cursorX = 0;
  for (const child of children) {
    if (child.kind === "edge") {
      out.push(child);
      continue;
    }
    if (child.kind === "doc") {
      // Nested <doc> is rejected at IR-lowering; defend in depth.
      throw new Error("layout: nested <doc> is not permitted");
    }
    const placed = placeAt(child, cursorX, 0);
    out.push(placed);
    cursorX += placed.w + GAP;
  }
  return out;
}

function placeAt(
  el: IRBox | IRNote | IRFrame,
  defaultX: number,
  defaultY: number,
): IRBoxPositioned | IRNotePositioned | IRFramePositioned {
  switch (el.kind) {
    case "box":
      return placeBox(el, defaultX, defaultY);
    case "note":
      return placeNote(el, defaultX, defaultY);
    case "frame":
      return placeFrame(el, defaultX, defaultY);
  }
}

function placeBox(
  box: IRBox,
  defaultX: number,
  defaultY: number,
): IRBoxPositioned {
  return {
    ...box,
    x: box.x ?? defaultX,
    y: box.y ?? defaultY,
    w: box.w ?? BOX_W,
    h: box.h ?? BOX_H,
  };
}

function placeNote(
  note: IRNote,
  defaultX: number,
  defaultY: number,
): IRNotePositioned {
  return {
    ...note,
    x: note.x ?? defaultX,
    y: note.y ?? defaultY,
    w: note.w ?? NOTE_W,
    h: note.h ?? NOTE_H,
  };
}

function placeFrame(
  frame: IRFrame,
  defaultX: number,
  defaultY: number,
): IRFramePositioned {
  const placedChildren = layoutChildren(frame.children);
  const bbox = childBounds(placedChildren);
  return {
    ...frame,
    children: placedChildren,
    x: frame.x ?? defaultX,
    y: frame.y ?? defaultY,
    w: frame.w ?? bbox.w + FRAME_PADDING * 2,
    h: frame.h ?? bbox.h + FRAME_PADDING * 2,
  };
}

function childBounds(
  children: readonly IRElementPositioned[],
): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    const r = c as { x: number; y: number; w: number; h: number };
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  // Empty frames still need a visible footprint.
  return {
    w: Math.max(maxX, BOX_W),
    h: Math.max(maxY, BOX_H),
  };
}

