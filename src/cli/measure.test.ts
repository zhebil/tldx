import { describe, expect, it } from "vitest";

import { FakeExecute } from "../app/ports/execute.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import type { AbsEdge, AbsShape } from "../domain/layout/occlusion.js";
import { astBuilders } from "../domain/parser/ast.fixture.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import {
  formatEdges,
  formatMeasure,
  narrowToFrame,
  runMeasure,
  type MeasureIo,
} from "./measure.js";

function shape(
  overrides: Partial<AbsShape> & Pick<AbsShape, "id" | "x" | "y" | "w" | "h">,
): AbsShape {
  return { kind: "box", label: overrides.id, parentId: "doc", ancestorFrameIds: [], ...overrides };
}

describe("formatMeasure", () => {
  it("prints id, size and position, columns aligned to the widest entry", () => {
    const shapes = [
      shape({ id: "c1-sys", x: 0, y: 0, w: 90, h: 44 }),
      shape({ id: "c1-smart", x: 90, y: 0, w: 270, h: 44 }),
    ];
    expect(formatMeasure(shapes)).toBe(
      ["c1-sys    90 x 44   @ (0,0)", "c1-smart  270 x 44  @ (90,0)"].join("\n"),
    );
  });

  it("rounds fractional coordinates", () => {
    const shapes = [shape({ id: "a", x: 1.4, y: 2.6, w: 10.5, h: 20.49 })];
    expect(formatMeasure(shapes)).toBe("a  11 x 20  @ (1,3)");
  });

  it("is empty for no shapes", () => {
    expect(formatMeasure([])).toBe("");
  });
});

describe("formatEdges", () => {
  const edge = (overrides: Partial<AbsEdge> & Pick<AbsEdge, "from" | "to">): AbsEdge => ({
    id: `${overrides.from}-${overrides.to}`,
    bend: 0,
    ...overrides,
  });

  it("prints the pair, both terminals and the bend, columns aligned", () => {
    const edges = [
      edge({
        from: "a",
        to: "b",
        start: { side: "right", x: 120, y: 31 },
        end: { side: "left", x: 400, y: 31 },
      }),
      edge({ from: "long-id", to: "c", bend: -24.4 }),
    ];
    expect(formatEdges(edges)).toBe(
      [
        "a -> b        right (120,31) -> left (400,31)  bend 0",
        "long-id -> c  auto -> auto                     bend -24",
      ].join("\n"),
    );
  });

  it("appends the label and its placed box, so a squished label is visible as a tall thin rect", () => {
    const edges = [
      edge({ from: "a", to: "b", label: "deploys", labelBox: { x: 200, y: 10, w: 14, h: 224 } }),
    ];
    expect(formatEdges(edges)).toBe(
      'a -> b  auto -> auto  bend 0  "deploys"  14 x 224  @ (200,10)',
    );
  });

  it("prints a label the router placed no box for without trailing padding", () => {
    expect(formatEdges([edge({ from: "a", to: "a", label: "retry" })])).toBe(
      'a -> a  auto -> auto  bend 0  "retry"',
    );
  });

  it("is empty for no edges", () => {
    expect(formatEdges([])).toBe("");
  });
});

describe("narrowToFrame", () => {
  const shapes = [
    shape({ id: "standalone", x: 0, y: 0, w: 10, h: 10 }),
    shape({ id: "ctx", kind: "frame", x: 100, y: 0, w: 400, h: 100 }),
    shape({ id: "c1-sys", x: 100, y: 0, w: 90, h: 44, parentId: "ctx", ancestorFrameIds: ["ctx"] }),
    shape({
      id: "nested",
      kind: "frame",
      x: 100,
      y: 0,
      w: 90,
      h: 44,
      parentId: "ctx",
      ancestorFrameIds: ["ctx"],
    }),
    shape({
      id: "deep",
      x: 100,
      y: 0,
      w: 10,
      h: 10,
      parentId: "nested",
      ancestorFrameIds: ["ctx", "nested"],
    }),
  ];

  it("keeps the frame itself and every descendant, dropping siblings", () => {
    expect(narrowToFrame(shapes, "ctx").map((s) => s.id)).toEqual([
      "ctx",
      "c1-sys",
      "nested",
      "deep",
    ]);
  });

  it("narrows to a nested frame's own descendants only", () => {
    expect(narrowToFrame(shapes, "nested").map((s) => s.id)).toEqual(["nested", "deep"]);
  });

  it("is empty for an id that isn't in the shape list", () => {
    expect(narrowToFrame(shapes, "nope")).toEqual([]);
  });
});

describe("runMeasure", () => {
  const { doc, frame, box, edge } = astBuilders();
  const SRC = "diagram source";
  const PATH = "diagram.tldx.jsx";

  function makeDeps(): { fs: InMemoryFs; execute: FakeExecute; layout: StubLayout } {
    const fs = new InMemoryFs({ [PATH]: SRC });
    const execute = new FakeExecute();
    // Every shape, the frame included, is pinned with explicit x/y/w/h, which
    // StubLayout honours verbatim - so the expected geometry below never
    // depends on its cursor/gap/padding internals.
    execute.setResult(SRC, {
      ast: doc({}, [
        box({ id: "standalone", label: "Standalone", x: 0, y: 0, w: 60, h: 30 }),
        frame({ id: "ctx", x: 100, y: 0, w: 464, h: 100 }, [
          box({ id: "c1-sys", label: "System", x: 0, y: 0, w: 90, h: 44 }),
          box({ id: "c1-smart", label: "Smartphone", x: 130, y: 0, w: 270, h: 44 }),
          edge({ from: "c1-sys", to: "c1-smart", fromSide: "right", toSide: "left" }),
        ]),
        edge({ from: "standalone", to: "c1-sys" }),
      ]),
      inputs: [PATH],
    });
    return { fs, execute, layout: new StubLayout() };
  }

  function makeIo(): MeasureIo & { stdout: string; stderr: string } {
    const buf = { stdout: "", stderr: "" };
    return {
      get stdout() {
        return buf.stdout;
      },
      get stderr() {
        return buf.stderr;
      },
      writeStdout: (chunk) => (buf.stdout += chunk),
      writeStderr: (chunk) => (buf.stderr += chunk),
    };
  }

  it("prints every shape's geometry in document order under a shapes: heading", async () => {
    const io = makeIo();
    const exitCode = await runMeasure({ argv: [PATH], deps: makeDeps(), io });

    expect(exitCode).toBe(0);
    expect(io.stdout).toContain(
      "shapes:\n" +
        formatMeasure([
          shape({ id: "standalone", x: 0, y: 0, w: 60, h: 30 }),
          shape({ id: "ctx", kind: "frame", x: 100, y: 0, w: 464, h: 100 }),
          shape({
            id: "c1-sys",
            x: 100,
            y: 0,
            w: 90,
            h: 44,
            parentId: "ctx",
            ancestorFrameIds: ["ctx"],
          }),
          shape({
            id: "c1-smart",
            x: 230,
            y: 0,
            w: 270,
            h: 44,
            parentId: "ctx",
            ancestorFrameIds: ["ctx"],
          }),
        ]),
    );
    expect(io.stderr).toBe("");
  });

  it("prints every edge's terminals and bend under an edges: heading", async () => {
    const io = makeIo();
    const exitCode = await runMeasure({ argv: [PATH], deps: makeDeps(), io });

    expect(exitCode).toBe(0);
    const edges = io.stdout.split("edges:\n")[1]?.trimEnd().split("\n");
    expect(edges).toEqual([
      "c1-sys -> c1-smart    right (190,22) -> left (230,22)  bend 0",
      "standalone -> c1-sys  right (60,15) -> left (100,15)   bend 0",
    ]);
  });

  it("--frame narrows to that frame's descendants, edges included", async () => {
    const io = makeIo();
    const exitCode = await runMeasure({ argv: [PATH, "--frame", "ctx"], deps: makeDeps(), io });

    expect(exitCode).toBe(0);
    const [shapes, edges] = io.stdout.trim().split("\n\n");
    expect(
      shapes
        ?.split("\n")
        .slice(1)
        .map((l) => l.split(/\s+/)[0]),
    ).toEqual(["ctx", "c1-sys", "c1-smart"]);
    // The edge leaving the frame goes with it; the one inside stays.
    expect(edges?.split("\n").slice(1)).toHaveLength(1);
    expect(io.stdout).not.toContain("standalone");
  });

  it("errors on an unknown --frame id, listing the valid ones", async () => {
    const io = makeIo();
    const exitCode = await runMeasure({ argv: [PATH, "--frame", "nope"], deps: makeDeps(), io });

    expect(exitCode).toBe(1);
    expect(io.stderr).toContain('unknown --frame id "nope"');
    expect(io.stderr).toContain("c1-sys");
  });

  it("errors with usage when the file argument is missing", async () => {
    const io = makeIo();
    const exitCode = await runMeasure({ argv: [], deps: makeDeps(), io });

    expect(exitCode).toBe(1);
    expect(io.stderr).toContain("missing <file> argument");
  });

  it("reports a read failure instead of throwing", async () => {
    const io = makeIo();
    const deps = makeDeps();
    const exitCode = await runMeasure({ argv: ["missing.tldx.jsx"], deps, io });

    expect(exitCode).toBe(1);
    expect(io.stderr).toContain("tldx measure:");
  });
});
