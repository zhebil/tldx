import { describe, expect, it } from "vitest";

import { GEOS } from "../ir/styles.js";

import {
  BOX_ASPECT_TARGET,
  boxHeightForWidth,
  estimatedBoxSize,
  estimatedNoteSize,
  fitBoxWidth,
  geoScale,
  labelExtent,
  labelOverflow,
} from "./defaults.js";
import { lineHeightPx, textWidth } from "./glyph-metrics.js";

describe("estimatedBoxSize", () => {
  it("returns the minimum box for empty or undefined labels", () => {
    expect(estimatedBoxSize(undefined)).toEqual({ w: 120, h: 62 });
    expect(estimatedBoxSize("")).toEqual({ w: 120, h: 62 });
  });

  it("keeps a short label at BOX_MIN_W", () => {
    expect(estimatedBoxSize("Redis")).toEqual({ w: 120, h: 62 });
  });

  it("gives labels that used to wrap mid-word enough width to fit on one line", () => {
    for (const label of ["OrdersRepo", "PasswordHasher"]) {
      const size = estimatedBoxSize(label);
      expect(size.w - 32).toBeGreaterThanOrEqual(textWidth(label));
    }
  });

  it("gives Gateway enough width to fit on one line (regression: used to wrap as Gatewa/y)", () => {
    const size = estimatedBoxSize("Gateway");
    expect(size.w - 32).toBeGreaterThanOrEqual(textWidth("Gateway"));
  });

  it("wraps a long sentence onto multiple lines instead of growing past the aspect target", () => {
    const longWord = "A".repeat(25);
    const label = `${longWord} ${longWord} ${longWord}`;
    const single = estimatedBoxSize("A");
    const size = estimatedBoxSize(label);

    expect(size.h).toBeGreaterThan(single.h);
    expect(size.w).toBeLessThanOrEqual(BOX_ASPECT_TARGET * size.h);
  });

  it("returns integers", () => {
    const size = estimatedBoxSize("Some medium length label here");
    expect(Number.isInteger(size.w)).toBe(true);
    expect(Number.isInteger(size.h)).toBe(true);
  });

  it("never splits a long single word, even when it blows the aspect target", () => {
    const word = "A".repeat(40);
    const w = fitBoxWidth(word);
    expect(w).toBeGreaterThanOrEqual(textWidth(word) + 32);
  });

  it("caps width and pushes the label onto more lines when maxW is given", () => {
    const label = "Some medium length label here";
    const unbounded = estimatedBoxSize(label);
    const capped = estimatedBoxSize(label, 120);

    expect(capped.w).toBeLessThan(unbounded.w);
    expect(capped.h).toBeGreaterThan(unbounded.h);
  });

  // geoScale inflates width and height together so a label fits inside a
  // non-rect outline. `fitBoxWidth` respects maxW as a wrap budget, but that
  // inflation is applied after it, so an unchecked scale would blow a
  // diamond's width straight past its cap.
  it("holds maxW on a diamond the same way it holds on a rectangle (regression: diamond used to ignore maxW entirely)", () => {
    const label = "Health gate\nerror rate < 1% for 10 min";
    const diamond = estimatedBoxSize(label, 200, { geo: "diamond" });
    expect(diamond.w).toBeLessThanOrEqual(200);
  });

  it("grows the capped diamond's height instead of shrinking it and spilling the label past the outline", () => {
    const label = "Health gate\nerror rate < 1% for 10 min";
    const cappedDiamond = estimatedBoxSize(label, 200, { geo: "diamond" });
    const cappedRect = estimatedBoxSize(label, 200, { geo: "rectangle" });

    // A 200-wide diamond has less inscribed room than a 200-wide rectangle
    // for the same label, so it must be taller, not shorter, to hold it -
    // shrinking height to hit the cap undoes the inflation that kept the
    // label inside the outline. The ceiling is a sanity bound, not a tuned
    // ratio: a 3-line label in a 200px diamond is genuinely a tall shape.
    expect(cappedDiamond.h).toBeGreaterThan(cappedRect.h);
    expect(cappedDiamond.h).toBeLessThan(600);
  });

  it("stops growing height when no height can hold the label, and lets labelOverflow say so", () => {
    // A triangle's label needs `w > 2 * wl` and an arrow's `w > wl / 0.68`,
    // so at a pinned width neither is ever satisfied by more height. The
    // search used to double h 24 times and return 3,053,453,312.
    const label = "Manual approval release manager signs off";
    for (const geo of ["triangle", "arrow-right"] as const) {
      const { w, h } = estimatedBoxSize(label, 220, { geo });
      expect(w).toBe(220);
      expect(h).toBe(boxHeightForWidth(label, 220));
      expect(labelOverflow(label, w, h, { geo })).toBeDefined();
    }
  });

  it("keeps the label rectangle inside the outline at the capped width, for diamond and ellipse alike", () => {
    const label = "Health gate\nerror rate < 1% for 10 min";
    for (const geo of ["diamond", "ellipse"] as const) {
      const { w, h } = estimatedBoxSize(label, 200, { geo });
      expect(w).toBeLessThanOrEqual(200);
      const { wl, hl } = labelExtent(label, w);
      const a = wl / w;
      const b = hl / h;
      const fits = geo === "diamond" ? a + b <= 1.001 : Math.hypot(a, b) <= 1.001;
      expect(fits).toBe(true);
    }
  });
});

describe("geo-aware sizing", () => {
  const label = "Diamond";

  it("no geo prop is byte-identical to explicit geo=rectangle (regression: today's sizing unchanged)", () => {
    expect(estimatedBoxSize(label, undefined, {})).toEqual(
      estimatedBoxSize(label, undefined, { geo: "rectangle" }),
    );
  });

  it("a diamond box is strictly wider and taller than a rectangle box for the same label", () => {
    const rect = estimatedBoxSize(label, undefined, { geo: "rectangle" });
    const diamond = estimatedBoxSize(label, undefined, { geo: "diamond" });
    expect(diamond.w).toBeGreaterThan(rect.w);
    expect(diamond.h).toBeGreaterThan(rect.h);
  });

  it("the diamond's label rectangle fits inside its rhombus outline (Wl/w + Hl/h <= 1)", () => {
    const size = estimatedBoxSize(label, undefined, { geo: "diamond" });
    const wl = textWidth(label);
    const hl = lineHeightPx();
    expect(wl / size.w + hl / size.h).toBeLessThanOrEqual(1);
  });

  // The containment predicate per outline, restated independently of
  // `defaults.ts`: the label does not scale with the box, so a `k` solved on
  // the rectangle basis alone still spills past a triangle's slopes.
  const fits: Record<string, (a: number, b: number) => boolean> = {
    rect: () => true,
    ellipse: (a, b) => Math.hypot(a, b) <= 1,
    diamond: (a, b) => a + b <= 1,
    triangle: (a, b) => 2 * a + b <= 1,
    arrow: (a, b) => a <= 0.68 && b <= 0.24,
  };
  const model: Record<string, string> = {
    rectangle: "rect",
    "check-box": "rect",
    "x-box": "rect",
    cloud: "rect",
    ellipse: "ellipse",
    oval: "ellipse",
    hexagon: "ellipse",
    octagon: "ellipse",
    pentagon: "ellipse",
    heart: "ellipse",
    diamond: "diamond",
    rhombus: "diamond",
    "rhombus-2": "diamond",
    star: "diamond",
    trapezoid: "diamond",
    "arrow-up": "arrow",
    "arrow-down": "arrow",
    "arrow-left": "arrow",
    "arrow-right": "arrow",
    triangle: "triangle",
  };

  it.each(GEOS)("%s holds its label inside the outline, wrapped or not", (geo) => {
    for (const text of [label, "a much longer label that wraps onto more than one line"]) {
      const { w, h } = estimatedBoxSize(text, undefined, { geo });
      expect(w).toBeGreaterThanOrEqual(120);
      const { wl, hl } = labelExtent(text, w);
      expect(fits[model[geo]!]!(wl / w, hl / h)).toBe(true);
      expect(geoScale(text, undefined, { geo })).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("geo aspect ratio", () => {
  it("a short diamond label reads closer to square than the rectangle aspect target allows", () => {
    const { w, h } = estimatedBoxSize("Health gate", undefined, { geo: "diamond" });
    expect(w / h).toBeLessThan(BOX_ASPECT_TARGET);
    expect(w / h).toBeLessThan(2);
  });

  it("diamond and ellipse pull toward different target ratios for the same label (not one hard-coded ratio for every geo)", () => {
    const diamond = estimatedBoxSize("Payments API", undefined, { geo: "diamond" });
    const ellipse = estimatedBoxSize("Payments API", undefined, { geo: "ellipse" });
    expect(diamond.w / diamond.h).toBeLessThan(ellipse.w / ellipse.h);
  });

  it("still grows, never shrinks, so the label keeps fitting the outline", () => {
    const label = "Payments API";
    for (const geo of ["diamond", "ellipse", "hexagon"] as const) {
      const { w, h } = estimatedBoxSize(label, undefined, { geo });
      expect(labelOverflow(label, w, h, { geo })).toBeUndefined();
    }
  });

  it("a long label still ends up wider than a short one on the same geo (the target is a floor on height, not a ceiling on width)", () => {
    const short = estimatedBoxSize("OK", undefined, { geo: "diamond" });
    const long = estimatedBoxSize("error rate below 1 percent for 10 minutes straight", undefined, {
      geo: "diamond",
    });
    expect(long.w).toBeGreaterThan(short.w);
  });

  it("a rectangle's sizing is unaffected - the aspect target only pulls non-rect geos", () => {
    const label = "Some medium length label here";
    expect(estimatedBoxSize(label)).toEqual(
      estimatedBoxSize(label, undefined, { geo: "rectangle" }),
    );
  });

  it("D20 regression: a maxW-capped diamond's proportions are unchanged by the aspect-ratio fix", () => {
    const label = "Health gate\nerror rate < 1% for 10 min";
    expect(estimatedBoxSize(label, 200, { geo: "diamond" })).toEqual({ w: 200, h: 403 });
  });
});

describe("labelOverflow", () => {
  it("is undefined for a box sized by estimatedBoxSize itself (the box always fits its own natural size)", () => {
    const label = "a much longer label that wraps onto more than one line";
    const { w, h } = estimatedBoxSize(label);
    expect(labelOverflow(label, w, h)).toBeUndefined();
  });

  it("is undefined for an empty or absent label", () => {
    expect(labelOverflow(undefined, 120, 62)).toBeUndefined();
    expect(labelOverflow("", 120, 62)).toBeUndefined();
  });

  it("fires when a label is wrapped to a width narrower than the height was computed for (the explicit-w bug)", () => {
    // estimatedBoxSize(label) picks a natural (wide, few-line) height; a box
    // pinned to a much narrower width re-wraps the same label onto many more
    // lines, and that height is never recomputed for it.
    const label =
      "DUMB ZONE do not put smart logic here this box explicitly pins its width so the label wraps onto far more lines than the box's auto-computed height accounts for";
    const natural = estimatedBoxSize(label);
    const pinnedW = 160;
    const overflow = labelOverflow(label, pinnedW, natural.h);
    expect(overflow).toBeDefined();
    expect(overflow!.neededH).toBeGreaterThan(natural.h);
  });

  it("fires when an explicit h is too short for the label at the box's own width", () => {
    const label = "one two three four five six seven eight nine ten";
    const { w } = estimatedBoxSize(label);
    expect(labelOverflow(label, w, 40)).toBeDefined();
  });

  it("stays consistent with estimatedBoxSize for non-rect geo: the box that size produces never overflows itself", () => {
    for (const geo of ["diamond", "ellipse", "triangle"] as const) {
      const label = "Health gate\nerror rate < 1% for 10 min";
      const { w, h } = estimatedBoxSize(label, undefined, { geo });
      expect(labelOverflow(label, w, h, { geo })).toBeUndefined();
    }
  });
});

describe("textWidth", () => {
  it("over-reserves rather than under-reserves for a wide-glyph string", () => {
    // "WWWW" is close to the widest realistic 4-char run; textWidth must not
    // under-predict what the real renderer draws.
    expect(textWidth("WWWW")).toBeGreaterThan(4 * 20.85);
  });
});

describe("estimatedNoteSize", () => {
  it("is 200x200 for empty or short text", () => {
    expect(estimatedNoteSize(undefined)).toEqual({ w: 200, h: 200 });
    expect(estimatedNoteSize("hi")).toEqual({ w: 200, h: 200 });
  });

  it("grows height with text length, reserving at least the measured requirement", () => {
    const text = "x".repeat(216);
    const size = estimatedNoteSize(text);
    expect(size.w).toBe(200);
    expect(size.h).toBeGreaterThanOrEqual(596);
  });
});
