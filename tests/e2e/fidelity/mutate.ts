/**
 * Builds a synthetic canvas edit for a corpus fixture that exercises all
 * five overlay operation kinds: moved, restyled, relabelled, deleted, added.
 *
 * Deletion mutates the store the way a real tldraw canvas would: removing a
 * shape cascades to any binding that references it (and the arrow on the
 * other end of that binding) and to any shape parented under it, so the
 * mutated scene never contains a dangling reference. Otherwise
 * `applyOverlay`'s own cascade would disagree with the mutated scene.
 */

import { boxShape, richText } from "../../../src/contracts/builders.js";
import type { SceneJSON, TLRecord } from "../../../src/contracts/scene-json.js";

function propsOf(record: TLRecord): Record<string, unknown> {
  return (record.props as Record<string, unknown> | undefined) ?? {};
}

function pick(candidates: readonly TLRecord[], reason: string): TLRecord {
  const found = candidates[0];
  if (found === undefined) throw new Error(reason);
  return found;
}

/** Mirrors `applyOverlay`'s cascade so the hand-built mutated scene is
 *  internally consistent with what `applyOverlay` will produce. */
function cascadeDeleteIds(store: Record<string, TLRecord>, rootId: string): Set<string> {
  const deleted = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of Object.values(store)) {
      if (deleted.has(record.id)) continue;
      if (record.typeName === "binding") {
        const toId = record.toId as string | undefined;
        const fromId = record.fromId as string | undefined;
        if (toId !== undefined && deleted.has(toId)) {
          deleted.add(record.id);
          if (fromId !== undefined) deleted.add(fromId);
          changed = true;
          continue;
        }
        if (fromId !== undefined && deleted.has(fromId)) {
          deleted.add(record.id);
          changed = true;
          continue;
        }
      }
      const parentId = record.parentId as string | undefined;
      if (parentId !== undefined && deleted.has(parentId)) {
        deleted.add(record.id);
        changed = true;
      }
    }
  }
  return deleted;
}

export function buildMutatedScene(name: string, base: SceneJSON): SceneJSON {
  const shapes = Object.values(base.store).filter((r) => r.typeName === "shape");

  const withSize = shapes.filter(
    (r) => typeof propsOf(r).w === "number" && typeof propsOf(r).h === "number",
  );
  const moveTarget = pick(withSize, `${name}: no shape with props.w/h to move+resize`);

  const withColor = shapes.filter(
    (r) => typeof propsOf(r).color === "string" && r.id !== moveTarget.id,
  );
  const restyleTarget = pick(withColor, `${name}: no second shape with props.color to restyle`);

  const withLabel = shapes.filter(
    (r) =>
      (typeof propsOf(r).text === "string" || typeof propsOf(r).richText === "object") &&
      r.id !== moveTarget.id &&
      r.id !== restyleTarget.id,
  );
  const relabelTarget = pick(withLabel, `${name}: no third labellable shape to relabel`);

  const usedIds = new Set([moveTarget.id, restyleTarget.id, relabelTarget.id]);
  const deleteCandidates = shapes
    .filter((r) => !usedIds.has(r.id))
    .map((r) => ({ record: r, cascade: cascadeDeleteIds(base.store, r.id) }))
    .filter(({ cascade }) => ![...cascade].some((id) => usedIds.has(id)))
    .sort((a, b) => b.cascade.size - a.cascade.size);
  const deleteChoice = deleteCandidates[0];
  if (deleteChoice === undefined) {
    throw new Error(`${name}: no fourth shape available to delete without touching the other mutated shapes`);
  }

  const pageRecord = Object.values(base.store).find((r) => r.typeName === "page");
  if (pageRecord === undefined) throw new Error(`${name}: compiled scene has no page record`);

  const store: Record<string, TLRecord> = structuredClone(base.store);

  const moveRec = store[moveTarget.id];
  if (moveRec === undefined) throw new Error(`${name}: move target vanished from the clone`);
  moveRec.x = (moveRec.x as number) + 37;
  moveRec.y = (moveRec.y as number) + 21;
  const moveProps = propsOf(moveRec);
  moveRec.props = {
    ...moveProps,
    w: (moveProps.w as number) + 15,
    h: (moveProps.h as number) + 8,
  };

  const restyleRec = store[restyleTarget.id];
  if (restyleRec === undefined) throw new Error(`${name}: restyle target vanished from the clone`);
  const currentColor = propsOf(restyleRec).color as string;
  const currentOpacity = typeof restyleRec.opacity === "number" ? restyleRec.opacity : 1;
  restyleRec.props = {
    ...propsOf(restyleRec),
    color: currentColor === "red" ? "blue" : "red",
  };
  restyleRec.opacity = currentOpacity === 0.5 ? 0.75 : 0.5;

  const relabelRec = store[relabelTarget.id];
  if (relabelRec === undefined) throw new Error(`${name}: relabel target vanished from the clone`);
  const relabelProps = propsOf(relabelRec);
  relabelRec.props =
    typeof relabelProps.text === "string"
      ? { ...relabelProps, text: "overlay corpus relabel" }
      : { ...relabelProps, richText: richText("overlay corpus relabel") };

  for (const id of deleteChoice.cascade) delete store[id];

  const addedId = `shape:overlay-corpus-added-${name.replace(/[^a-z0-9]/gi, "")}`;
  store[addedId] = boxShape({
    id: addedId,
    x: 800,
    y: 800,
    w: 60,
    h: 30,
    parentId: pageRecord.id,
    text: "overlay corpus added",
  });

  return { store, schema: base.schema };
}
