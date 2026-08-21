/**
 * The overlay file sits beside its source: `x.tldsl.jsx` -> the module,
 * `x.tldsl.overlay.json` -> the canvas edits keyed against it (round-trip.md
 * D1). Pure string work - no `node:path`, since domain/ may not import
 * node built-ins and a suffix swap needs nothing path-aware.
 */

const JSX_SUFFIX = ".jsx";
const OVERLAY_SUFFIX = ".overlay.json";

export function overlayPathFor(sourcePath: string): string {
  const base = sourcePath.endsWith(JSX_SUFFIX)
    ? sourcePath.slice(0, -JSX_SUFFIX.length)
    : sourcePath;
  return `${base}${OVERLAY_SUFFIX}`;
}
