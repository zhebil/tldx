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
    const fs = new InMemoryFs({ "a.tldx": "alpha", "b.tldx": "beta" });
    expect(await fs.read("a.tldx")).toBe("alpha");
    expect(await fs.read("b.tldx")).toBe("beta");
  });

  it("deleteFile makes subsequent reads throw ENOENT", async () => {
    const fs = new InMemoryFs({ "doc.tldx": "x" });
    fs.deleteFile("doc.tldx");
    expect(fs.has("doc.tldx")).toBe(false);
    await expect(fs.read("doc.tldx")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
