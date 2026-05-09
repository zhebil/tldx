import { describe, it, expect } from "vitest";

import { runFsReadContract, type FsReadHarness } from "./fs.contract.js";
import { InMemoryFs } from "./fs.fake.js";

runFsReadContract("InMemoryFs", async (): Promise<FsReadHarness> => {
  const fs = new InMemoryFs();
  return {
    port: fs,
    writeFile: async (relPath, content) => {
      fs.setFile(relPath, content);
      return relPath;
    },
    pathFor: (relPath) => relPath,
    dispose: async () => undefined,
  };
});

describe("InMemoryFs (fake-specific affordances)", () => {
  it("seeds files via the constructor record", async () => {
    const fs = new InMemoryFs({ "a.tldsl": "alpha", "b.tldsl": "beta" });
    expect(await fs.read("a.tldsl")).toBe("alpha");
    expect(await fs.read("b.tldsl")).toBe("beta");
  });

  it("deleteFile makes subsequent reads throw ENOENT", async () => {
    const fs = new InMemoryFs({ "doc.tldsl": "x" });
    fs.deleteFile("doc.tldsl");
    expect(fs.has("doc.tldsl")).toBe(false);
    await expect(fs.read("doc.tldsl")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
