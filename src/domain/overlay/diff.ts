/**
 * `diffScenes`: the inverse of `applyOverlay`. Turns a base scene (the last
 * compile the overlay was recorded against) and a current scene (the live
 * canvas, as the browser sees it after the user's edits) into the overlay
 * entries that reproduce `current` from `base`.
 *
 * The load-bearing property, for scenes sharing a schema:
 * `applyOverlay({ v: 1, basedOn: sceneHash(base), entries: diffScenes(base, current) }, base).scene`
 * deep-equals `current`.
 *
 * Props present in `base` but absent in `current` are ignored - tldraw never
 * removes a prop key from a record, only changes its value, so there is no
 * "unset" op to build.
 */

import { richText } from "../../contracts/builders.js";
import { RESTYLE_RECORD_FIELDS } from "../../contracts/overlay.js";
import type { OverlayEntry, OverlayPlacement } from "../../contracts/overlay.js";
import type { SceneJSON, TLRecord, TLRecordId } from "../../contracts/scene-json.js";

export function diffScenes(
  base: SceneJSON,
  current: SceneJSON,
): Record<TLRecordId, OverlayEntry> {
  const entries: Record<TLRecordId, OverlayEntry> = {};

  for (const [id, record] of Object.entries(current.store)) {
    const baseRecord = base.store[id];
    if (baseRecord === undefined) {
      entries[id] = { added: { ...record } };
      continue;
    }
    const entry = diffRecord(baseRecord, record);
    if (entry !== undefined) entries[id] = entry;
  }

  for (const id of Object.keys(base.store)) {
    if (!(id in current.store)) entries[id] = { deleted: true };
  }

  return entries;
}

function diffRecord(base: TLRecord, current: TLRecord): OverlayEntry | undefined {
  const entry: OverlayEntry = {};

  const moved = diffPlacement(base, current);
  if (moved !== undefined) entry.moved = moved;

  const baseProps = (base.props as Record<string, unknown> | undefined) ?? {};
  const currentProps = (current.props as Record<string, unknown> | undefined) ?? {};
  const restyled: Record<string, unknown> = {};

  if ("text" in currentProps) {
    if (!deepEqual(baseProps.text, currentProps.text)) {
      entry.relabelled = currentProps.text as string;
    }
  } else if ("richText" in currentProps) {
    if (!deepEqual(baseProps.richText, currentProps.richText)) {
      const plain = richTextToPlain(currentProps.richText);
      if (deepEqual(richText(plain), currentProps.richText)) {
        entry.relabelled = plain;
      } else {
        restyled.richText = currentProps.richText;
      }
    }
  }

  for (const [key, value] of Object.entries(currentProps)) {
    if (key === "w" || key === "h" || key === "text" || key === "richText") continue;
    if (!deepEqual(baseProps[key], value)) restyled[key] = value;
  }

  for (const field of RESTYLE_RECORD_FIELDS) {
    if (!deepEqual(base[field], current[field])) restyled[field] = current[field];
  }

  if (Object.keys(restyled).length > 0) entry.restyled = restyled;

  return Object.keys(entry).length > 0 ? entry : undefined;
}

function diffPlacement(base: TLRecord, current: TLRecord): OverlayPlacement | undefined {
  const placement: OverlayPlacement = {};
  let changed = false;

  if (!deepEqual(base.x, current.x)) {
    placement.x = current.x as number;
    changed = true;
  }
  if (!deepEqual(base.y, current.y)) {
    placement.y = current.y as number;
    changed = true;
  }
  if (!deepEqual(base.rotation, current.rotation)) {
    placement.rotation = current.rotation as number;
    changed = true;
  }
  if (!deepEqual(base.parentId, current.parentId)) {
    placement.parentId = current.parentId as TLRecordId;
    changed = true;
  }
  // `index` is never recorded. Emit assigns every shape a real index and
  // parents each arrow to the common ancestor of its endpoints, so a real drag
  // never needs a z-order rewrite - every recorded `index` change in the corpus
  // was tldraw's own fractional-index bookkeeping, never user intent. There is
  // no JSX syntax for z-order.

  const baseProps = (base.props as Record<string, unknown> | undefined) ?? {};
  const currentProps = (current.props as Record<string, unknown> | undefined) ?? {};
  if (!deepEqual(baseProps.w, currentProps.w)) {
    placement.w = currentProps.w as number;
    changed = true;
  }
  if (!deepEqual(baseProps.h, currentProps.h)) {
    placement.h = currentProps.h as number;
    changed = true;
  }

  return changed ? placement : undefined;
}

/** Best-effort plain-text extraction: paragraphs joined with `\n`, an empty
 *  paragraph (or one with no plain text nodes) is an empty line. A doc with
 *  richer structure (marks, non-text nodes) still extracts *something* -
 *  callers verify round-trip fidelity by re-encoding and comparing rather
 *  than trusting this blindly. */
export function richTextToPlain(doc: unknown): string {
  const content = isRecord(doc) && Array.isArray(doc.content) ? doc.content : [];
  return content
    .map((paragraph) => {
      const paragraphContent =
        isRecord(paragraph) && Array.isArray(paragraph.content) ? paragraph.content : [];
      return paragraphContent
        .map((node) => (isRecord(node) && typeof node.text === "string" ? node.text : ""))
        .join("");
    })
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => deepEqual(aRecord[key], bRecord[key]))
  );
}
