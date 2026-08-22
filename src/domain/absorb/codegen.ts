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
 *  value or expression doesn't end the tag early. */
function scanOpenTag(source: string, start: number): OpenTag | null {
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
