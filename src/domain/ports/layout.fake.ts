/**
 * StubLayout: the deterministic fake for `LayoutPort`. Used by every test
 * that needs positioned IR without paying for ELK. The contract test
 * (`layout.contract.ts`) pins the universal guarantees; this implementation
 * additionally guarantees:
 *
 * - children are laid out left-to-right in document order at the top-left of
 *   their container, with the first row offset down by `FRAME_PAD_TOP` inside
 *   frames so children clear the tldraw frame title bar;
 * - frame width/height are computed as the bounding box of children plus
 *   asymmetric `FRAME_PAD_INNER`/`FRAME_PAD_TOP` so chrome never overlaps
 *   the first row;
 * - box and note default sizes come from `estimatedBoxSize` /
 *   `estimatedNoteSize` so labels don't clip in the absence of explicit `w`;
 * - explicit `x | y | w | h` from the IR are honored verbatim (free
 *   placement / hard pins survive layout).
 *
 * Direction is ignored: this fake is deterministic and 1D, not a router.
 *
 * Edges are connectors: they pass through unchanged.
 */

import {
  estimatedBoxSize,
  estimatedNoteSize,
  FRAME_PAD_INNER,
  FRAME_PAD_TOP,
} from "../layout/defaults.js";
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

const GAP = 40;

export class StubLayout implements LayoutPort {
  async layout(ir: IRDoc): Promise<IRDocPositioned> {
    return {
      ...ir,
      children: layoutChildren(ir.children, /*originY=*/ 0),
    };
  }
}

function layoutChildren(
  children: readonly IRElement[],
  originY: number,
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
    const placed = placeAt(child, cursorX, originY);
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
  const size = estimatedBoxSize(box.label);
  return {
    ...box,
    x: box.x ?? defaultX,
    y: box.y ?? defaultY,
    w: box.w ?? size.w,
    h: box.h ?? size.h,
  };
}

function placeNote(
  note: IRNote,
  defaultX: number,
  defaultY: number,
): IRNotePositioned {
  const size = estimatedNoteSize();
  return {
    ...note,
    x: note.x ?? defaultX,
    y: note.y ?? defaultY,
    w: note.w ?? size.w,
    h: note.h ?? size.h,
  };
}

function placeFrame(
  frame: IRFrame,
  defaultX: number,
  defaultY: number,
): IRFramePositioned {
  // Children inside a frame start below the chrome so the title bar doesn't
  // sit on top of the first row.
  const placedChildren = layoutChildren(frame.children, FRAME_PAD_TOP);
  const bbox = childBounds(placedChildren);
  return {
    ...frame,
    children: placedChildren,
    x: frame.x ?? defaultX,
    y: frame.y ?? defaultY,
    w: frame.w ?? bbox.w + FRAME_PAD_INNER * 2,
    h: frame.h ?? bbox.h + FRAME_PAD_INNER,
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
    w: Math.max(maxX, FRAME_PAD_INNER * 2),
    h: Math.max(maxY, FRAME_PAD_TOP + FRAME_PAD_INNER),
  };
}
