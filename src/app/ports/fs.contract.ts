/**
 * Contract suite for `FsReadPort`, run by both the `InMemoryFs` fake and the
 * real adapter, so a fake that drifts fails.
 *
 * The harness owns the path namespace: the fake can use any keys, the real
 * adapter hands back absolute paths under a temp dir it cleans up in
 * `dispose`.
 */

import { describe, it, expect } from "vitest";

import type { FsReadPort } from "./fs.js";

export interface FsReadHarness {
  port: FsReadPort;
  /** Create a file at `relPath`; returns the absolute path the port will read. */
  writeFile(relPath: string, content: string): Promise<string>;
  /** Resolve a relative path that does NOT exist. */
  pathFor(relPath: string): string;
  dispose(): Promise<void>;
}

export function runFsReadContract(label: string, make: () => Promise<FsReadHarness>): void {
  describe(`FsReadPort contract: ${label}`, () => {
    it("reads UTF-8 content of an existing file", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("hello.tldx", "<doc>\n  <box id=a/>\n</doc>\n");
        expect(await h.port.read(path)).toBe("<doc>\n  <box id=a/>\n</doc>\n");
      } finally {
        await h.dispose();
      }
    });

    it("preserves non-ASCII content round-trip", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("emoji.tldx", "<note>café — naïve</note>");
        expect(await h.port.read(path)).toBe("<note>café — naïve</note>");
      } finally {
        await h.dispose();
      }
    });

    it("throws ENOENT when the file does not exist", async () => {
      const h = await make();
      try {
        const missing = h.pathFor("nope.tldx");
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
        const path = await h.writeFile("doc.tldx", "first");
        expect(await h.port.read(path)).toBe("first");
        await h.writeFile("doc.tldx", "second");
        expect(await h.port.read(path)).toBe("second");
      } finally {
        await h.dispose();
      }
    });
  });
}
