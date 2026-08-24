/**
 * Factories for the typical wire shapes. Defaults track the tldraw ^3.15 pin.
 *
 * Keep these PURE: no I/O, no randomness, no Date.now. Callers pass ids;
 * id-generation policy is owned by domain/ir.
 */

import type { Diagnostic } from "./diagnostic.js";
import type { SceneJSON, TLRecord, TLStoreSchema } from "./scene-json.js";
import type { SceneMessage } from "./scene-message.js";

/**
 * Tracks `createTLSchema().serialize()` from tldraw ^3.15. If tldraw ticks one
 * of these on a point release, bump in lockstep. An e2e test pins this against
 * the live schema so drift fails CI rather than the viewer.
 */
const DEFAULT_SCHEMA: TLStoreSchema = {
  schemaVersion: 2,
  sequences: {
    "com.tldraw.store": 4,
    "com.tldraw.asset": 1,
    "com.tldraw.camera": 1,
    "com.tldraw.document": 2,
    "com.tldraw.instance": 25,
    "com.tldraw.instance_page_state": 5,
    "com.tldraw.page": 1,
    "com.tldraw.instance_presence": 6,
    "com.tldraw.pointer": 1,
    "com.tldraw.shape": 4,
    "com.tldraw.asset.bookmark": 2,
    "com.tldraw.asset.image": 5,
    "com.tldraw.asset.video": 5,
    "com.tldraw.shape.arrow": 6,
    "com.tldraw.shape.bookmark": 2,
    "com.tldraw.shape.draw": 2,
    "com.tldraw.shape.embed": 4,
    "com.tldraw.shape.frame": 1,
    "com.tldraw.shape.geo": 10,
    "com.tldraw.shape.group": 0,
    "com.tldraw.shape.highlight": 1,
    "com.tldraw.shape.image": 5,
    "com.tldraw.shape.line": 5,
    "com.tldraw.shape.note": 9,
    "com.tldraw.shape.text": 3,
    "com.tldraw.shape.video": 4,
    "com.tldraw.binding.arrow": 1,
  },
};

// ---------------------------------------------------------------- envelope --

export const sceneMessage = {
  scene(payload: SceneJSON): SceneMessage {
    return { v: 1, kind: "scene", payload };
  },
  error(diagnostics: Diagnostic[]): SceneMessage {
    return { v: 1, kind: "error", payload: { diagnostics } };
  },
  ping(): SceneMessage {
    return { v: 1, kind: "ping", payload: {} };
  },
};

// ----------------------------------------------------------------- payload --

/**
 * Build a SceneJSON from a flat list of records, keyed by each record's own
 * `id`. Duplicate ids overwrite silently - callers must pass unique ids.
 */
export function sceneJson(
  records: TLRecord[],
  schema: TLStoreSchema = DEFAULT_SCHEMA,
): SceneJSON {
  const store: Record<string, TLRecord> = {};
  for (const r of records) store[r.id] = r;
  return { store, schema };
}

// ------------------------------------------------------------ record kinds --

export function documentRecord(
  input: { id?: string; gridSize?: number; name?: string } = {},
): TLRecord {
  return {
    id: input.id ?? "document:document",
    typeName: "document",
    gridSize: input.gridSize ?? 10,
    name: input.name ?? "",
    meta: {},
  };
}

export function pageRecord(input: {
  id: string;
  name?: string;
  index?: string;
}): TLRecord {
  return {
    id: input.id,
    typeName: "page",
    name: input.name ?? "tldx",
    index: input.index ?? "a1",
    meta: {},
  };
}

type ShapeBase = {
  id: string;
  x: number;
  y: number;
  parentId?: string;
  index?: string;
  rotation?: number;
  opacity?: number;
  meta?: Record<string, unknown>;
};

type ShapeBaseFields = {
  id: string;
  typeName: "shape";
  x: number;
  y: number;
  rotation: number;
  index: string;
  parentId: string;
  isLocked: boolean;
  opacity: number;
  meta: Record<string, unknown>;
};

function baseShapeFields(input: ShapeBase): ShapeBaseFields {
  return {
    id: input.id,
    typeName: "shape",
    x: input.x,
    y: input.y,
    rotation: input.rotation ?? 0,
    index: input.index ?? "a1",
    parentId: input.parentId ?? "page:main",
    isLocked: false,
    opacity: input.opacity ?? 1,
    meta: input.meta ?? {},
  };
}

export function boxShape(
  input: ShapeBase & {
    w: number;
    h: number;
    text?: string;
    geo?: string;
    color?: string;
    fill?: string;
    dash?: string;
    textAlign?: string;
    verticalAlign?: string;
    labelColor?: string;
    font?: string;
    size?: string;
  },
): TLRecord {
  return {
    ...baseShapeFields(input),
    type: "geo",
    props: {
      w: input.w,
      h: input.h,
      geo: input.geo ?? "rectangle",
      color: input.color ?? "black",
      labelColor: input.labelColor ?? "black",
      fill: input.fill ?? "none",
      dash: input.dash ?? "draw",
      size: input.size ?? "m",
      font: input.font ?? "draw",
      align: input.textAlign ?? "middle",
      verticalAlign: input.verticalAlign ?? "middle",
      url: "",
      growY: 0,
      scale: 1,
      richText: richText(input.text ?? ""),
    },
  } satisfies TLRecord;
}

export function noteShape(
  input: ShapeBase & {
    text?: string;
    color?: string;
    size?: string;
    growY?: number;
    textAlign?: string;
    verticalAlign?: string;
    labelColor?: string;
    font?: string;
  },
): TLRecord {
  return {
    ...baseShapeFields(input),
    type: "note",
    props: {
      color: input.color ?? "yellow",
      labelColor: input.labelColor ?? "black",
      size: input.size ?? "m",
      font: input.font ?? "draw",
      fontSizeAdjustment: 0,
      align: input.textAlign ?? "middle",
      verticalAlign: input.verticalAlign ?? "middle",
      growY: input.growY ?? 0,
      url: "",
      scale: 1,
      richText: richText(input.text ?? ""),
    },
  } satisfies TLRecord;
}

/**
 * A borderless, fill-less tldraw `text` shape. Unlike `boxShape`/`noteShape`
 * the wire field is `textAlign` (not `align`) and there is no `h` at all -
 * height is derived from the wrapped content, never sent. `w` is the fixed
 * wrap budget, so `autoSize` is always false.
 */
export function textShape(
  input: ShapeBase & {
    w: number;
    text?: string;
    color?: string;
    textAlign?: string;
    font?: string;
    size?: string;
  },
): TLRecord {
  return {
    ...baseShapeFields(input),
    type: "text",
    props: {
      w: input.w,
      color: input.color ?? "black",
      size: input.size ?? "m",
      font: input.font ?? "draw",
      textAlign: input.textAlign ?? "start",
      autoSize: false,
      scale: 1,
      richText: richText(input.text ?? ""),
    },
  } satisfies TLRecord;
}

export function frameShape(
  input: ShapeBase & {
    w: number;
    h: number;
    name?: string;
    color?: string;
  },
): TLRecord {
  return {
    ...baseShapeFields(input),
    type: "frame",
    props: {
      w: input.w,
      h: input.h,
      name: input.name ?? "",
      color: input.color ?? "black",
    },
  } satisfies TLRecord;
}

export function arrowShape(
  input: ShapeBase & {
    bend?: number;
    color?: string;
    dash?: string;
    arrowheadStart?: string;
    arrowheadEnd?: string;
    text?: string;
    labelColor?: string;
    font?: string;
    size?: string;
    labelPosition?: number;
  },
): TLRecord {
  return {
    ...baseShapeFields(input),
    type: "arrow",
    props: {
      kind: "arc",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      bend: input.bend ?? 0,
      color: input.color ?? "black",
      labelColor: input.labelColor ?? "black",
      size: input.size ?? "m",
      dash: input.dash ?? "draw",
      fill: "none",
      font: input.font ?? "draw",
      arrowheadStart: input.arrowheadStart ?? "none",
      arrowheadEnd: input.arrowheadEnd ?? "arrow",
      text: input.text ?? "",
      labelPosition: input.labelPosition ?? 0.5,
      scale: 1,
      elbowMidPoint: 0.5,
    },
  } satisfies TLRecord;
}

export function arrowBinding(input: {
  id: string;
  arrowId: string;
  shapeId: string;
  terminal: "start" | "end";
  normalizedAnchor?: { x: number; y: number };
  isPrecise?: boolean;
  isExact?: boolean;
  snap?: "center" | "edge-point" | "edge" | "none";
}): TLRecord {
  return {
    id: input.id,
    typeName: "binding",
    type: "arrow",
    fromId: input.arrowId,
    toId: input.shapeId,
    props: {
      terminal: input.terminal,
      normalizedAnchor: input.normalizedAnchor ?? { x: 0.5, y: 0.5 },
      isPrecise: input.isPrecise ?? false,
      isExact: input.isExact ?? false,
      snap: input.snap ?? "none",
    },
    meta: {},
  };
}

// ------------------------------------------------------------- rich text --

export type RichTextDoc = {
  type: "doc";
  content: Array<
    | { type: "paragraph" }
    | { type: "paragraph"; content: Array<{ type: "text"; text: string }> }
  >;
};

/**
 * Minimal ProseMirror-style rich-text doc, the shape tldraw expects on
 * geo/note `props.richText`. Empty string emits an empty paragraph, matching
 * tldraw's `toRichText("")`. Multi-line input splits on `\n` into paragraphs.
 *
 * Hand-rolled because contracts/ and domain/ cannot import tldraw's runtime
 * `toRichText`. An e2e test pins the equivalence so drift surfaces in CI.
 */
export function richText(text: string): RichTextDoc {
  if (text === "") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: text.split("\n").map((line) =>
      line === ""
        ? { type: "paragraph" }
        : {
            type: "paragraph",
            content: [{ type: "text", text: line }],
          },
    ),
  };
}
