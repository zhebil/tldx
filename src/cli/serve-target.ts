/**
 * Resolve `tldx serve`'s one path argument to the files it serves.
 *
 * A directory serves every `.tldx.jsx` directly inside it, which is the same
 * as running `serve` once per file. One level only: a diagram nested in a
 * subdirectory is not this directory's diagram.
 *
 * Expansion lives here in the CLI rather than behind `FsReadPort` because
 * `projectRootFor` and `pageKeyFor` take a file - hand either a directory and
 * they answer for the wrong thing - so it must happen before any registry
 * call, in the composition root that already reads the real filesystem.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIAGRAM_SUFFIX = ".tldx.jsx";

/** Whether `path` exists and is a directory. Anything else - a file, a missing path, an unreadable one - is false. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The files `tldx serve <path>` should serve, in the order it should serve
 * them.
 *
 * A non-directory passes straight through, missing or not: `serve
 * gone.tldx.jsx` still starts a server whose page carries the compile
 * diagnostic, which is how that typo has always been reported.
 *
 * Throws when `path` is a directory holding no diagram - a `serve` that
 * silently did nothing would read as a broken diagram rather than a wrong
 * argument.
 */
export function resolveServeTargets(path: string): readonly [string, ...string[]] {
  if (!isDirectory(path)) return [path];

  const files = readdirSync(path)
    .filter((name) => name.endsWith(DIAGRAM_SUFFIX))
    // `sort()` compares code units, so the order is the same on every machine;
    // a locale-aware collator would not be. It decides which page the browser
    // tab deep-links to.
    .sort()
    .map((name) => join(path, name))
    // A directory named `foo.tldx.jsx` is not a diagram. Following symlinks
    // here is deliberate: a symlinked diagram is one, a symlinked directory is
    // not.
    .filter((file) => !isDirectory(file));

  const [head, ...rest] = files;
  if (head === undefined) {
    throw new Error(`no ${DIAGRAM_SUFFIX} files in ${path}`);
  }
  return [head, ...rest];
}
