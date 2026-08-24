import { describe, expect, it } from "vitest";

import { FONT_SIZES, FONTS } from "../ir/styles.js";

import { estimatedBoxSize } from "./defaults.js";
import {
  ADVANCE,
  ARROW_LABEL_FONT_PX,
  arrowLabelWidth,
  fontScale,
  LABEL_FONT_PX,
  lineHeightPx,
  TEXT_FONT_PX,
  TEXT_SLACK_PX,
  textWidth,
} from "./glyph-metrics.js";

describe("glyph-metrics: (font, size) table coverage", () => {
  it("has an advance table for every FONTS value and a px size for every FONT_SIZES value", () => {
    // Adding a value to FONTS/FONT_SIZES without measuring it breaks this
    // (and, separately, fails to typecheck - ADVANCE/LABEL_FONT_PX are
    // `Record<StyleFont, ...>`/`Record<StyleFontSize, ...>`).
    expect(Object.keys(ADVANCE).sort()).toEqual([...FONTS].sort());
    expect(Object.keys(LABEL_FONT_PX).sort()).toEqual([...FONT_SIZES].sort());
    expect(Object.keys(TEXT_FONT_PX).sort()).toEqual([...FONT_SIZES].sort());
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

describe("glyph-metrics: label fits on one line for every (font, size)", () => {
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

describe("textWidth: default pins today's draw/m behavior", () => {
  it("is identical with no TextStyle and with the explicit draw/m default", () => {
    for (const s of ["Gateway", "SystemClock", ""]) {
      expect(textWidth(s)).toBe(textWidth(s, { font: "draw", size: "m" }));
    }
  });
});

describe("arrowLabelWidth: uses ARROW_LABEL_FONT_SIZES, not LABEL_FONT_PX", () => {
  it("differs from textWidth at size m (20px arrow font vs 22px box/note font)", () => {
    expect(arrowLabelWidth("reads", { size: "m" })).not.toBe(textWidth("reads", { size: "m" }));
  });
});

describe("TEXT_FONT_PX: the standalone tldraw `text` shape's own table", () => {
  it("pins the three tables against tldraw's own values, so a future edit can't silently collapse them back into one", () => {
    // LABEL_FONT_PX: label inside a geo/note. TEXT_FONT_PX: standalone
    // `text` shape. ARROW_LABEL_FONT_PX: label on an arrow. All three agree
    // at `s` (18) - tldraw's own tables do too - and diverge from there.
    expect(LABEL_FONT_PX).toEqual({ s: 18, m: 22, l: 26, xl: 32 });
    expect(TEXT_FONT_PX).toEqual({ s: 18, m: 24, l: 36, xl: 44 });
    expect(ARROW_LABEL_FONT_PX).toEqual({ s: 18, m: 20, l: 24, xl: 28 });
    for (const size of ["m", "l", "xl"] as const) {
      expect(TEXT_FONT_PX[size]).not.toBe(LABEL_FONT_PX[size]);
      expect(TEXT_FONT_PX[size]).not.toBe(ARROW_LABEL_FONT_PX[size]);
    }
  });

  it("fontScale/textWidth/lineHeightPx use TEXT_FONT_PX only when ts.standalone is set", () => {
    for (const size of FONT_SIZES) {
      const label = { size };
      const standalone = { size, standalone: true };
      expect(fontScale(standalone)).toBe(TEXT_FONT_PX[size] / LABEL_FONT_PX.m);
      expect(fontScale(label)).toBe(LABEL_FONT_PX[size] / LABEL_FONT_PX.m);
      expect(lineHeightPx(standalone)).toBe(Math.ceil(TEXT_FONT_PX[size] * 1.35));
    }
  });

  it("diverges most at xl (44 vs 32, the D23 repro's overlap case)", () => {
    const wStandalone = textWidth("Phase 1 (non collaborative)", { size: "xl", standalone: true });
    const wLabel = textWidth("Phase 1 (non collaborative)", { size: "xl" });
    expect(wStandalone).toBeGreaterThan(wLabel);
    expect(lineHeightPx({ size: "xl", standalone: true })).toBeGreaterThan(
      lineHeightPx({ size: "xl" }),
    );
  });

  it("is unset by default, so a plain <Box>/<Note> label is unaffected (regression)", () => {
    expect(textWidth("Gateway")).toBe(textWidth("Gateway", { standalone: false }));
    expect(lineHeightPx()).toBe(lineHeightPx({ standalone: false }));
  });
});
