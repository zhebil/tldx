/**
 * Best-effort OS default-handler launch for the dev-server URL. The tab opens
 * unfocused where the platform allows it, so `tldx serve` never steals the
 * foreground from the terminal that started it. Failures are swallowed: the
 * CLI already printed the URL. The child is `unref()`d so it never holds the
 * parent open past its own teardown.
 */

import { spawn as nodeSpawn } from "node:child_process";

export interface OpenBrowserOptions {
  /** Override the underlying `spawn`. Test-only; production omits. */
  spawn?: typeof nodeSpawn;
  /** Override `process.platform`. Test-only; lets tests cover branches. */
  platform?: NodeJS.Platform;
}

interface CommandShape {
  cmd: string;
  args: readonly string[];
}

function commandFor(url: string, platform: NodeJS.Platform): CommandShape {
  // `-g` opens without raising the browser above the terminal you launched from.
  if (platform === "darwin") return { cmd: "open", args: ["-g", url] };
  if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] };
  return { cmd: "xdg-open", args: [url] };
}

export function openBrowser(url: string, options: OpenBrowserOptions = {}): void {
  const spawnImpl = options.spawn ?? nodeSpawn;
  const platform = options.platform ?? process.platform;
  const { cmd, args } = commandFor(url, platform);
  try {
    const child = spawnImpl(cmd, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {
      // No handler binary on PATH (e.g. `xdg-open` missing in a minimal
      // container). The URL was already printed; nothing to do.
    });
    child.unref();
  } catch {
    // `spawn` itself can throw synchronously on certain platforms; same
    // best-effort policy applies.
  }
}
