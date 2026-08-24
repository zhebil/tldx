/**
 * Real `gitStatus` behind `absorb`'s guardrail: never write to a file with
 * uncommitted changes without saying so. A non-zero exit (not a repo, git
 * missing, path outside any repo) collapses to `"no-repo"`, which absorb
 * treats as "no gitStatus at all" and writes a `.bak` before rewriting.
 */

import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function gitStatus(path: string): Promise<"clean" | "dirty" | "no-repo"> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--", basename(path)], {
      cwd: dirname(path),
    });
    return stdout.trim().length > 0 ? "dirty" : "clean";
  } catch {
    return "no-repo";
  }
}
