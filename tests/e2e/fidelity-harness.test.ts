/**
 * Acceptance criterion for T21 (docs/plan.md): "fails loudly when fed a
 * deliberately lossy apply - a harness that has never gone red proves
 * nothing." Each case here wraps the real `applyOverlay` with a specific
 * loss (or, for `identity`, ignores the overlay entirely) and asserts
 * `checkFidelity` reports it - and reports it as an `"apply"`-stage
 * failure specifically, proving the real server/reload leg stayed green
 * and the injected loss is what tripped the harness.
 */

import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Overlay, OverlayEntry } from "../../src/contracts/overlay.js";
import { applyOverlay } from "../../src/domain/overlay/index.js";

import { checkFidelity, type ApplyFn } from "./fidelity/harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, "..", "corpus");
// Large enough (frame nesting, bindings, multiple labellable/colorable
// shapes) that all seven mutations below bite - verified by running this
// file.
const FIXTURE = join(CORPUS_DIR, "checkout-services.tldsl.jsx");

function stripField<K extends keyof OverlayEntry>(overlay: Overlay, field: K): Overlay {
  const entries: Record<string, OverlayEntry> = {};
  for (const [id, entry] of Object.entries(overlay.entries)) {
    const rest = { ...entry };
    delete rest[field];
    entries[id] = rest;
  }
  return { ...overlay, entries };
}

function truncateRelabels(overlay: Overlay): Overlay {
  const entries: Record<string, OverlayEntry> = {};
  for (const [id, entry] of Object.entries(overlay.entries)) {
    entries[id] =
      entry.relabelled !== undefined ? { ...entry, relabelled: entry.relabelled.slice(0, 1) } : entry;
  }
  return { ...overlay, entries };
}

const LOSSY_APPLIES: { name: string; apply: ApplyFn }[] = [
  { name: "identity", apply: (_overlay, scene) => ({ scene, diagnostics: [] }) },
  { name: "drops moved", apply: (overlay, scene) => applyOverlay(stripField(overlay, "moved"), scene) },
  {
    name: "drops restyled",
    apply: (overlay, scene) => applyOverlay(stripField(overlay, "restyled"), scene),
  },
  {
    name: "drops relabelled",
    apply: (overlay, scene) => applyOverlay(stripField(overlay, "relabelled"), scene),
  },
  {
    name: "ignores deleted",
    apply: (overlay, scene) => applyOverlay(stripField(overlay, "deleted"), scene),
  },
  { name: "drops added", apply: (overlay, scene) => applyOverlay(stripField(overlay, "added"), scene) },
  {
    name: "truncates relabels",
    apply: (overlay, scene) => applyOverlay(truncateRelabels(overlay), scene),
  },
];

describe("fidelity harness: goes red on a lossy apply", () => {
  it(
    "positive control: the real applyOverlay round-trips this fixture cleanly",
    async () => {
      expect(await checkFidelity(FIXTURE)).toEqual([]);
    },
    30_000,
  );

  for (const { name, apply } of LOSSY_APPLIES) {
    it(
      `${name}: reported as an apply-stage failure`,
      async () => {
        const failures = await checkFidelity(FIXTURE, apply);
        expect(failures.length).toBeGreaterThan(0);
        expect(failures.every((f) => f.stage === "apply")).toBe(true);

        const joined = failures.map((f) => f.message).join(" ");
        expect(joined).toContain(basename(FIXTURE));
        expect(joined).toMatch(/shape:/);
      },
      30_000,
    );
  }
});
