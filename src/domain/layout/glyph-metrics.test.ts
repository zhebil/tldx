import { describe, expect, it } from "vitest";

import { FONT_SIZES, FONTS } from "../ir/styles.js";

import { estimatedBoxSize } from "./defaults.js";
import {
  ADVANCE,
  arrowLabelWidth,
  LABEL_FONT_PX,
  lineHeightPx,
  TEXT_SLACK_PX,
  textWidth,
} from "./glyph-metrics.js";

describe("glyph-metrics: (font, size) table coverage (T11)", () => {
  it("has an advance table for every FONTS value and a px size for every FONT_SIZES value", () => {
    // Adding a value to FONTS/FONT_SIZES without measuring it breaks this
    // (and, separately, fails to typecheck - ADVANCE/LABEL_FONT_PX are
    // `Record<StyleFont, ...>`/`Record<StyleFontSize, ...>`).
    expect(Object.keys(ADVANCE).sort()).toEqual([...FONTS].sort());
    expect(Object.keys(LABEL_FONT_PX).sort()).toEqual([...FONT_SIZES].sort());
  });

  it("resolves a real measured width (not a silent unknown-glyph fallback) for every (font, size)", () => {
    for (const font of FONTS) {
      for (const size of FONT_SIZES) {
        const w = textWidth("M", { font, size });
        expect(w).toBeGreaterThan(TEXT_SLACK_PX);
      }
    }
  });
});

describe("glyph-metrics: label fits on one line for every (font, size) (T11)", () => {
  for (const font of FONTS) {
    for (const size of FONT_SIZES) {
      it(`${font}/${size}: "Gateway" stays on one line`, () => {
        const ts = { font, size };
        const size2 = estimatedBoxSize("Gateway", undefined, ts);
        expect(size2.h).toBe(lineHeightPx(ts) + 32);
        expect(size2.w).toBeGreaterThanOrEqual(textWidth("Gateway", ts) + 32);
      });
    }
  }
});

describe("textWidth: default pins today's draw/m behavior (T11)", () => {
  it("is identical with no TextStyle and with the explicit draw/m default", () => {
    for (const s of ["Gateway", "SystemClock", ""]) {
      expect(textWidth(s)).toBe(textWidth(s, { font: "draw", size: "m" }));
    }
  });
});

describe("arrowLabelWidth: uses ARROW_LABEL_FONT_SIZES, not LABEL_FONT_PX (T12)", () => {
  it("differs from textWidth at size m (20px arrow font vs 22px box/note font)", () => {
    expect(arrowLabelWidth("reads", { size: "m" })).not.toBe(textWidth("reads", { size: "m" }));
  });
});
