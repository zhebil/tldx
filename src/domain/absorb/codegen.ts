/**
 * Records -> JSX text, plus the splice into a `.tldsl.jsx` source file that
 * adds them as children of the root `<Doc>` (docs/round-trip.md D3, D5).
 * Pure: no I/O, never reformats anything it wasn't asked to touch. `app/
 * absorb.ts` calls this after partitioning the overlay into absorbable vs.
 * residual entries, and owns guardrails/writing/verification.
 *
 * A `geo` record becomes `<Box>`; a `note` record becomes `<Sticky>` - the
 * only vocabulary left that `domain/emit/emit.ts` compiles to a `type:
 * "note"` tldraw record (C2, tldsl-npd: the old plain `<Note>`, which
 * emitted a `geo` box pretending to be an annotation, is retired). Emitting
 * anything else here would recompile to the wrong tldraw type and fail
 * absorb's own verification step every time.
 */

import type { TLRecord } from "../../contracts/scene-json.js";
import { NOTE_SIZE } from "../layout/defaults.js";
import { richTextToPlain } from "../overlay/diff.js";

const SHAPE_PREFIX = "shape:";

/** Strips the `shape:` prefix `emit/` adds (never renames, D3) to recover
 *  the author-facing id for a JSX `id` attribute. The ugly id is kept
 *  verbatim - prettifying it would need a second naming scheme to undo. */
function authorId(record: TLRecord): string {
  return record.id.startsWith(SHAPE_PREFIX) ? record.id.slice(SHAPE_PREFIX.length) : record.id;
}

function propsOf(record: TLRecord): Record<string, unknown> {
  return (record.props as Record<string, unknown> | undefined) ?? {};
}

function numAttr(name: string, value: unknown): string | null {
  if (typeof value !== "number") return null;
  return `${name}="${value}"`;
}

/** Plain `attr="value"` unless the string contains a character JSX can't put
 *  in a bare attribute literal, in which case `attr={"..."}` via JSON.stringify. */
const NEEDS_EXPR_QUOTE = /["\\<>{}\n]/;

function strAttr(name: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  return NEEDS_EXPR_QUOTE.test(value) ? `${name}={${JSON.stringify(value)}}` : `${name}="${value}"`;
}

function geoAttrs(record: TLRecord): string[] {
  const props = propsOf(record);
  const attrs = [
    strAttr("id", authorId(record)),
    numAttr("x", record.x),
    numAttr("y", record.y),
    numAttr("w", props.w),
    numAttr("h", props.h),
    strAttr("geo", props.geo),
    strAttr("color", props.color),
    strAttr("fill", props.fill),
    strAttr("dash", props.dash),
    strAttr("size", props.size),
    strAttr("font", props.font),
    strAttr("textAlign", props.align),
    strAttr("verticalAlign", props.verticalAlign),
    strAttr("labelColor", props.labelColor),
  ];
  const label = richTextToPlain(props.richText);
  if (label !== "") attrs.push(strAttr("label", label));
  return attrs.filter((a): a is string => a !== null);
}

function boxJsx(record: TLRecord): string {
  return `<Box ${geoAttrs(record).join(" ")}/>`;
}

/** `<Sticky>`'s `h` is the DSL's only handle on `growY` - tldraw stickies are
 *  always 200 wide (`NOTE_SIZE`) and `emit/` computes
 *  `growY = max(0, h - NOTE_SIZE)` (docs/dsl.md), so `h = NOTE_SIZE + growY`
 *  is the exact inverse (growY is never negative, so the max() never clips). */
function stickyAttrs(record: TLRecord): { attrs: string[]; text: string } {
  const props = propsOf(record);
  const growY = typeof props.growY === "number" ? props.growY : 0;
  const attrs = [
    strAttr("id", authorId(record)),
    numAttr("x", record.x),
    numAttr("y", record.y),
    numAttr("h", NOTE_SIZE + growY),
    strAttr("color", props.color),
    strAttr("size", props.size),
    strAttr("font", props.font),
    strAttr("textAlign", props.align),
    strAttr("verticalAlign", props.verticalAlign),
    strAttr("labelColor", props.labelColor),
  ];
  return { attrs: attrs.filter((a): a is string => a !== null), text: richTextToPlain(props.richText) };
}

function stickyJsx(record: TLRecord): string {
  const { attrs, text } = stickyAttrs(record);
  const open = `<Sticky ${attrs.join(" ")}`;
  // An expression child (not raw JSX text) so JSX's own whitespace
  // collapsing never touches internal newlines in a multi-line label.
  return text === "" ? `${open}/>` : `${open}>{${JSON.stringify(text)}}</Sticky>`;
}

/** One record -> one JSX element string, or null when the record's shape
 *  type has no DSL equivalent (only `geo` and `note` do). */
export function elementJsx(record: TLRecord): string | null {
  if (record.typeName !== "shape") return null;
  if (record.type === "geo") return boxJsx(record);
  if (record.type === "note") return stickyJsx(record);
  return null;
}

type OpenTag = { tagEnd: number; selfClosing: boolean };

/** Scans forward from `<Doc` to the end of its opening tag (`>` or `/>`),
 *  tracking quotes and `{}` expression depth so a `>` inside an attribute
 *  value or expression doesn't end the tag early. Exported for
 *  `domain/absorb/moves.ts`'s reorder/gap splicing, which locates elements
 *  by JSX source span rather than by scanning for `<Doc`. */
export function scanOpenTag(source: string, start: number): OpenTag | null {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && ch === "/" && source[i + 1] === ">") return { tagEnd: i + 2, selfClosing: true };
    if (depth === 0 && ch === ">") return { tagEnd: i + 1, selfClosing: false };
    i += 1;
  }
  return null;
}

function indentOfLineAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^\s*/)?.[0] ?? "";
}

/** 1-based line/column (code points) -> 0-based char offset. Mirrors how
 *  `jsxDEV`'s dev-source (`runtime/components.ts`'s `JsxSource`) numbers a
 *  JSX element's position: it points at the element's own `<`. */
export function offsetAt(source: string, line: number, column: number): number {
  const lines = source.split("\n");
  let offset = 0;
  for (let l = 1; l < line; l++) offset += (lines[l - 1]?.length ?? 0) + 1;
  return offset + (column - 1);
}

/**
 * A JSX element's full source span, starting at `start` (its `<`). Scans the
 * open tag via `scanOpenTag`; a self-closing tag ends there, otherwise scans
 * forward tracking element-nesting depth (any open/close tag, not just this
 * one's name - JSX guarantees proper nesting so a plain depth counter is
 * enough) and `{}` expression children (which may contain nested braces and
 * quoted strings) until the depth returns to 0.
 */
export function scanElement(source: string, start: number): { start: number; end: number } | null {
  const open = scanOpenTag(source, start);
  if (open === null) return null;
  if (open.selfClosing) return { start, end: open.tagEnd };

  let i = open.tagEnd;
  let depth = 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{") {
      const end = skipBraceExpr(source, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === "<") {
      if (source[i + 1] === "/") {
        const gt = source.indexOf(">", i);
        if (gt === -1) return null;
        depth -= 1;
        i = gt + 1;
        if (depth === 0) return { start, end: i };
        continue;
      }
      const childOpen = scanOpenTag(source, i);
      if (childOpen === null) return null;
      if (!childOpen.selfClosing) depth += 1;
      i = childOpen.tagEnd;
      continue;
    }
    i += 1;
  }
  return null;
}

/** `{` at `start` -> index just past its matching `}`, tracking quotes/backticks
 *  and nested braces so a `}` inside a string or a nested object literal
 *  doesn't end the expression early. */
function skipBraceExpr(source: string, start: number): number | null {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return null;
}

/**
 * Rewrites a `row`/`col` container's flowed children into a new order
 * (`domain/absorb/moves.ts`'s reorder rung). `siblingSpans` are the
 * children's JSX spans in *current* source order; `draggedIndex` moves to
 * `toIndex`, keeping every other sibling's relative order. Assumes each
 * sibling starts its own line (the authoring style every corpus fixture
 * uses) - if that's not true the diff still round-trips through a normal
 * JSX formatter, but this function returns `error` rather than guess at
 * where a same-line sibling's block boundary is.
 */
export function spliceReorder(
  source: string,
  siblingSpans: readonly { line: number; column: number }[],
  draggedIndex: number,
  toIndex: number,
): { source: string } | { error: string } {
  const spans = siblingSpans.map((s) => {
    const offset = offsetAt(source, s.line, s.column);
    return scanElement(source, offset);
  });
  if (spans.some((s) => s === null)) {
    return { error: "could not locate a sibling element's source span for reorder" };
  }
  const resolved = spans as { start: number; end: number }[];
  for (let i = 1; i < resolved.length; i++) {
    if (resolved[i]!.start <= resolved[i - 1]!.end) {
      return { error: "sibling elements are not on separate lines - can't reorder safely" };
    }
  }

  const texts = resolved.map((sp) => source.slice(sp.start, sp.end));
  const indent = indentOfLineAt(source, resolved[0]!.start);

  const rest = texts.map((_, i) => i).filter((i) => i !== draggedIndex);
  const newOrder: number[] = [];
  for (const i of rest) {
    if (newOrder.length === toIndex) newOrder.push(draggedIndex);
    newOrder.push(i);
  }
  if (newOrder.length === toIndex) newOrder.push(draggedIndex);

  const blockStart = source.lastIndexOf("\n", resolved[0]!.start - 1) + 1;
  const blockEnd = resolved[resolved.length - 1]!.end;
  const newBlock = newOrder.map((i) => `${indent}${texts[i]}`).join("\n");
  return { source: source.slice(0, blockStart) + newBlock + source.slice(blockEnd) };
}

/**
 * Sets (or adds) a `gap`/`colGap`/`rowGap` attribute on a container's
 * opening tag (`domain/absorb/moves.ts`'s gap rung). `containerSpan` points
 * at the container's own `<` (its IR span).
 */
export function patchGapAttr(
  source: string,
  containerSpan: { line: number; column: number },
  attr: "gap" | "colGap" | "rowGap",
  value: number,
): { source: string } | { error: string } {
  const start = offsetAt(source, containerSpan.line, containerSpan.column);
  const tag = scanOpenTag(source, start);
  if (tag === null) return { error: "could not find the end of the container's opening tag" };
  const innerEnd = tag.selfClosing ? tag.tagEnd - 2 : tag.tagEnd - 1;
  const inner = source.slice(start, innerEnd);
  const attrRe = new RegExp(`\\b${attr}=(?:"[^"]*"|\\{[^}]*\\})`);
  const formatted = `${attr}="${value}"`;
  const patched = attrRe.test(inner) ? inner.replace(attrRe, formatted) : `${inner.replace(/\s+$/, "")} ${formatted}`;
  return { source: source.slice(0, start) + patched + source.slice(innerEnd) };
}

const TLDSL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']tldsl["']/;

/** `<Box>`/`<Sticky>` are only imports the source needs "touched" for when
 *  absorb actually introduces one it wasn't already using (D5: never touch
 *  an import it didn't need to touch). Adds missing names to the existing
 *  `import { ... } from "tldsl"`; errors rather than guessing if there is
 *  no such import to extend. */
function ensureImports(source: string, records: readonly TLRecord[]): { source: string } | { error: string } {
  const needed: string[] = [];
  if (records.some((r) => r.type === "geo")) needed.push("Box");
  if (records.some((r) => r.type === "note")) needed.push("Sticky");
  if (needed.length === 0) return { source };

  const match = TLDSL_IMPORT.exec(source);
  if (match === null) {
    return { error: 'could not find `import { ... } from "tldsl"` to add the new component(s) to' };
  }
  const existing = match[1]!
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const missing = needed.filter((n) => !existing.includes(n));
  if (missing.length === 0) return { source };

  const newImport = `import { ${[...existing, ...missing].join(", ")} } from "tldsl"`;
  return {
    source: source.slice(0, match.index) + newImport + source.slice(match.index + match[0].length),
  };
}

/**
 * Splices `records` in as children of the root `<Doc>`, immediately before
 * its `</Doc>` (expanding a self-closing `<Doc .../>` first if that's the
 * root form), adding any of `Box`/`Sticky` the existing `"tldsl"` import is
 * missing. Returns an error - never throws, never writes partial output -
 * when the root can't be found unambiguously or a record has no JSX form.
 */
export function absorbAdded(
  source: string,
  records: readonly TLRecord[],
): { source: string } | { error: string } {
  // Nothing to splice - and the splice logic below always rewrites
  // *something* around `</Doc>` (an empty block, a stray blank line) even
  // for an empty list, which would touch a source that has nothing to
  // absorb (D5: never touch what didn't need touching).
  if (records.length === 0) return { source };

  const sorted = [...records].sort((a, b) => {
    const ai = typeof a.index === "string" ? a.index : "";
    const bi = typeof b.index === "string" ? b.index : "";
    if (ai !== bi) return ai < bi ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const elements: string[] = [];
  for (const record of sorted) {
    const jsx = elementJsx(record);
    if (jsx === null) {
      return {
        error: `cannot generate JSX for record "${record.id}" (typeName=${record.typeName}, type=${String(record.type)})`,
      };
    }
    elements.push(jsx);
  }

  const withImports = ensureImports(source, records);
  if ("error" in withImports) return withImports;
  const patched = withImports.source;

  const docMatches = [...patched.matchAll(/<Doc\b/g)];
  if (docMatches.length !== 1) {
    return { error: `expected exactly one <Doc> root element, found ${docMatches.length}` };
  }
  const matchStart = docMatches[0]!.index;
  const tag = scanOpenTag(patched, matchStart);
  if (tag === null) {
    return { error: "could not find the end of the <Doc> opening tag" };
  }

  const rootIndent = indentOfLineAt(patched, matchStart);
  const childIndent = `${rootIndent}  `;
  const elementsBlock = elements.map((el) => `${childIndent}${el}`).join("\n");

  if (tag.selfClosing) {
    const inner = patched.slice(matchStart, tag.tagEnd - 2);
    const openTag = `${inner.trimEnd()}>`;
    const replacement = `${openTag}\n${elementsBlock}\n${rootIndent}</Doc>`;
    return { source: patched.slice(0, matchStart) + replacement + patched.slice(tag.tagEnd) };
  }

  const closeIdx = patched.indexOf("</Doc>", tag.tagEnd);
  if (closeIdx === -1 || patched.indexOf("</Doc>", closeIdx + 1) !== -1) {
    return { error: "could not find a single matching </Doc> closing tag" };
  }
  const closeLineStart = patched.lastIndexOf("\n", closeIdx - 1) + 1;
  const beforeClose = patched.slice(closeLineStart, closeIdx);
  if (/^\s*$/.test(beforeClose)) {
    return { source: patched.slice(0, closeLineStart) + `${elementsBlock}\n` + patched.slice(closeLineStart) };
  }
  return { source: patched.slice(0, closeIdx) + `\n${elementsBlock}\n${rootIndent}` + patched.slice(closeIdx) };
}
