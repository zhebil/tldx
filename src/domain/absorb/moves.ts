/**
 * `planMoveCandidates`: the escalation ladder for a `moved` overlay entry
 * (`docs/round-trip-scope.md` §2, §7 F4.4; `bd show tldx-d3o`).
 *
 * Cheapest rung first, returned as an ordered list of candidates for
 * `app/absorb.ts` to try in order (write, recompile, compare to the target
 * scene, keep the first that verifies):
 *
 * 1. **Reorder** - the dragged child is a flowed child of a `row`/`col`
 *    container; one candidate per other slot among its siblings (nearest
 *    slot first).
 * 2. **Gap** - only when the dragged child is the *last* flowed child along
 *    the flow axis (the only geometry a single-shape drag can express as a
 *    uniform gap change, since no sibling after it needs to shift too).
 *
 * If neither applies, the list is a single `unabsorbable` entry naming the
 * element and why. Per docs/round-trip-scope.md §2, a pin inside a
 * `row`/`col` container almost never verifies (pinning drops the child from
 * the flow, which reflows every sibling), so pin is never proposed here -
 * `--pin` (not part of F4) covers `layout="free"` children and
 * already-pinned children.
 *
 * Pure: no source text, no I/O. `domain/absorb/codegen.ts` (`spliceReorder`,
 * `patchGapAttr`) turns a plan into source text.
 */

import type { SourceSpan } from "../../contracts/diagnostic.js";
import type {
  IRBox,
  IRContainer,
  IRDoc,
  IRDocPositioned,
  IRElement,
  IRFrame,
  IRFramePositioned,
  IRNote,
} from "../ir/index.js";

// Mirrors `domain/layout/stack.ts`'s unexported `DEFAULT_GAP` - stack.ts is
// owned by another agent right now, so this is a deliberate small
// duplication rather than adding an export there.
const DEFAULT_GAP = 40;

export type ReorderCandidate = {
  rung: "reorder";
  /** Current flowed-sibling spans, in JSX order. */
  siblingSpans: readonly SourceSpan[];
  /** Index of the dragged child within `siblingSpans`. */
  draggedIndex: number;
  /** The slot this particular candidate moves the dragged child to. */
  toIndex: number;
  /** Scene shape ids (`shape:<id>`) whose x/y must match `target` for this candidate to verify. */
  affectedIds: readonly string[];
};

export type GapCandidate = {
  rung: "gap";
  containerSpan: SourceSpan;
  attr: "gap" | "colGap" | "rowGap";
  value: number;
  affectedIds: readonly string[];
};

export type MoveCandidate = ReorderCandidate | GapCandidate;

export type MovePlan =
  | { candidates: readonly MoveCandidate[] }
  | { candidates: readonly []; reason: string };

type Located = {
  element: IRBox | IRFrame | IRNote;
  parent: IRContainer;
  parentPositioned: IRDocPositioned | IRFramePositioned;
};

function shapeId(irId: string): string {
  return `shape:${irId}`;
}

function stripShapePrefix(id: string): string {
  return id.startsWith("shape:") ? id.slice("shape:".length) : id;
}

function locate(irBase: IRDoc, positionedBase: IRDocPositioned, targetId: string): Located | null {
  function walk(
    node: IRContainer,
    posNode: IRDocPositioned | IRFramePositioned,
  ): Located | null {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as IRElement;
      if (child.kind === "edge" || child.kind === "doc") continue;
      if (child.id === targetId) {
        return { element: child, parent: node, parentPositioned: posNode };
      }
      if (child.kind === "frame") {
        const found = walk(child, posNode.children[i] as IRFramePositioned);
        if (found !== null) return found;
      }
    }
    return null;
  }
  return walk(irBase, positionedBase);
}

/** Same predicate `domain/layout/stack.ts`'s `flowedIndices` uses: everything
 *  that actually flows in a `row`/`col`/`grid` container. */
function isFlowed(el: IRElement): el is IRBox | IRFrame | IRNote {
  if (el.kind === "edge" || el.kind === "doc") return false;
  if (el.kind === "note" && el.on !== undefined) return false;
  return !(el.x !== undefined && el.y !== undefined);
}

function isHardPinned(el: IRBox | IRFrame | IRNote): boolean {
  return el.x !== undefined && el.y !== undefined;
}

export type MovedPlacement = {
  x?: number;
  y?: number;
  rotation?: number;
  parentId?: string;
  w?: number;
  h?: number;
};

function unabsorbable(reason: string): MovePlan {
  return { candidates: [], reason };
}

/**
 * `baseXY` is the moved shape's `x`/`y` in the *base* compiled scene (the
 * compile the overlay was recorded against) - the caller reads it straight
 * off `base.store[shapeId]`, since this module never sees a `SceneJSON`.
 */
export function planMoveCandidates(
  irBase: IRDoc,
  positionedBase: IRDocPositioned,
  targetShapeId: string,
  placement: MovedPlacement,
  baseXY: { x: number; y: number },
): MovePlan {
  const targetId = stripShapePrefix(targetShapeId);

  if (placement.rotation !== undefined) {
    return unabsorbable('rotation has no JSX equivalent (docs/round-trip-scope.md §1)');
  }
  if (placement.parentId !== undefined) {
    return unabsorbable("shape was reparented into a different container - F4 doesn't absorb cross-container moves");
  }
  if (placement.w !== undefined || placement.h !== undefined) {
    return unabsorbable("resize has no absorbable form yet (F4 is moves only)");
  }
  if (placement.x === undefined && placement.y === undefined) {
    return unabsorbable("moved entry carries no position change");
  }

  const located = locate(irBase, positionedBase, targetId);
  if (located === null) {
    return unabsorbable(`could not locate "${targetShapeId}" in the source IR`);
  }
  const { element, parent, parentPositioned } = located;

  if (isHardPinned(element)) {
    return unabsorbable(`"${targetId}" already has an explicit x/y pin - F4 doesn't rewrite pinned coordinates`);
  }

  const mode = parentPositioned.layout;
  if (mode !== "row" && mode !== "col") {
    return unabsorbable(
      `"${targetId}"'s container uses layout="${mode ?? "free"}" - reorder/gap absorption only covers explicit row/col containers`,
    );
  }

  const siblings = parent.children.filter(isFlowed);
  const spans = siblings.map((s) => s.span);
  const dupSpan = spans.some(
    (s, i) => spans.findIndex((o) => o.line === s.line && o.column === s.column) !== i,
  );
  if (dupSpan) {
    return unabsorbable(
      `"${targetId}"'s siblings are generated (e.g. .map()/.flatMap()) - absorb can't reorder one instance of a loop`,
    );
  }

  const draggedIndex = siblings.findIndex((s) => s.id === targetId);
  if (draggedIndex === -1) {
    return unabsorbable(`"${targetId}" is not a flowed child of its container`);
  }

  const affectedIds = siblings.map((s) => shapeId(s.id));
  const candidates: MoveCandidate[] = [];

  if (siblings.length >= 2) {
    const slots = siblings
      .map((_, i) => i)
      .filter((i) => i !== draggedIndex)
      .sort((a, b) => Math.abs(a - draggedIndex) - Math.abs(b - draggedIndex));
    for (const toIndex of slots) {
      candidates.push({ rung: "reorder", siblingSpans: spans, draggedIndex, toIndex, affectedIds });
    }
  }

  if (siblings.length >= 2 && draggedIndex === siblings.length - 1) {
    const deltaX = placement.x === undefined ? 0 : placement.x - baseXY.x;
    const deltaY = placement.y === undefined ? 0 : placement.y - baseXY.y;
    const axisDelta = mode === "row" ? deltaX : deltaY;
    const attr: "gap" | "colGap" | "rowGap" =
      mode === "row" ? (parent.colGap !== undefined ? "colGap" : "gap") : parent.rowGap !== undefined ? "rowGap" : "gap";
    const currentGap =
      mode === "row" ? parent.colGap ?? parent.gap ?? DEFAULT_GAP : parent.rowGap ?? parent.gap ?? DEFAULT_GAP;
    candidates.push({
      rung: "gap",
      containerSpan: parent.span,
      attr,
      value: currentGap + axisDelta,
      affectedIds,
    });
  }

  if (candidates.length === 0) {
    return unabsorbable(
      `"${targetId}" is the only flowed child of its container - neither a reorder nor a gap change applies`,
    );
  }

  return { candidates };
}
