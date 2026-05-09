/**
 * Contract suite for `FsReadPort`. Both the colocated `InMemoryFs` fake and
 * the real `infra/fs/` adapter run this same battery of scenarios against
 * their own constructor. If the fake drifts from real-adapter behavior, the
 * scenarios fail. This is the mechanism `docs/testing.md` relies on to keep
 * fakes honest without coupling tests to a specific implementation.
 *
 * The harness is responsible for the path namespace: the fake can use any
 * keys, while the real adapter must hand back absolute paths under a
 * temp directory it cleans up in `dispose`.
 */

import { describe, it, expect } from "vitest";

import type { FsReadPort } from "./fs.js";

export interface FsReadHarness {
  port: FsReadPort;
  /** Create a file at `relPath`; returns the absolute path the port will read. */
  writeFile(relPath: string, content: string): Promise<string>;
  /** Resolve a relative path that does NOT exist (for not-found scenarios). */
  pathFor(relPath: string): string;
  /** Tear down any setup (temp dir, watchers, etc.). */
  dispose(): Promise<void>;
}

export function runFsReadContract(
  label: string,
  make: () => Promise<FsReadHarness>,
): void {
  describe(`FsReadPort contract: ${label}`, () => {
    it("reads UTF-8 content of an existing file", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("hello.tldsl", "<doc>\n  <box id=a/>\n</doc>\n");
        expect(await h.port.read(path)).toBe("<doc>\n  <box id=a/>\n</doc>\n");
      } finally {
        await h.dispose();
      }
    });

    it("preserves non-ASCII content round-trip", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("emoji.tldsl", "<note>café — naïve</note>");
        expect(await h.port.read(path)).toBe("<note>café — naïve</note>");
      } finally {
        await h.dispose();
      }
    });

    it("throws ENOENT when the file does not exist", async () => {
      const h = await make();
      try {
        const missing = h.pathFor("nope.tldsl");
        await expect(h.port.read(missing)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await h.dispose();
      }
    });

    it("returns the latest content after the file is overwritten", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldsl", "first");
        expect(await h.port.read(path)).toBe("first");
        await h.writeFile("doc.tldsl", "second");
        expect(await h.port.read(path)).toBe("second");
      } finally {
        await h.dispose();
      }
    });
  });
}
