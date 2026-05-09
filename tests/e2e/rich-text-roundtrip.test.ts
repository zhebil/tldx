/**
 * Drift detector for our hand-rolled `richText()` builder against tldraw's
 * runtime `toRichText`. `contracts/` and `domain/` cannot import tldraw (it
 * pulls DOM/runtime baggage), so the builder hand-constructs the
 * ProseMirror-style {type:'doc', content:[...]} doc that tldraw expects on
 * geo/note `props.richText`. This test imports `toRichText` directly from
 * `@tldraw/tlschema` (no DOM, same surface scene-roundtrip uses) and asserts
 * the two produce structurally equal output across the fixture cases that
 * matter for MVP: empty, single-line, multi-line, blank-line-in-middle,
 * trailing newline.
 */
import { toRichText } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";

import { richText } from "../../src/contracts/builders.js";

const FIXTURES = [
  "",
  "Login",
  "Token store is the only writer of session tokens.",
  "line 1\nline 2",
  "first\n\nthird",
  "trailing\n",
];

describe("richText() matches tldraw's toRichText() output", () => {
  for (const fixture of FIXTURES) {
    it(`equals toRichText(${JSON.stringify(fixture)})`, () => {
      expect(richText(fixture)).toEqual(toRichText(fixture));
    });
  }
});
