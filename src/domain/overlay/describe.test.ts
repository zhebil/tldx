import { describe, expect, it } from "vitest";

import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  pageRecord,
  sceneJson,
} from "../../contracts/builders.js";
import type { SceneJSON } from "../../contracts/scene-json.js";

import { describeRecordId } from "./describe.js";

/** `a -> b`, under the synthetic id an unnamed `<Edge>` compiles to. */
function scene(): SceneJSON {
  return sceneJson([
    documentRecord(),
    pageRecord({ id: "page:main" }),
    boxShape({ id: "shape:app-usecases", x: 0, y: 0, w: 100, h: 50 }),
    boxShape({ id: "shape:domain", x: 0, y: 200, w: 100, h: 50 }),
    arrowShape({ id: "shape:1f4f1641-0", x: 0, y: 0 }),
    arrowBinding({
      id: "binding:1f4f1641-0-start",
      arrowId: "shape:1f4f1641-0",
      shapeId: "shape:app-usecases",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:1f4f1641-0-end",
      arrowId: "shape:1f4f1641-0",
      shapeId: "shape:domain",
      terminal: "end",
    }),
  ]);
}

describe("describeRecordId", () => {
  it("names an arrow by the shapes it joins", () => {
    expect(describeRecordId(scene(), "shape:1f4f1641-0")).toBe("app-usecases -> domain");
  });

  it("names a binding as that arrow's terminal", () => {
    expect(describeRecordId(scene(), "binding:1f4f1641-0-end")).toBe(
      "app-usecases -> domain (end)",
    );
  });

  it("strips the record prefix off a shape the source named", () => {
    expect(describeRecordId(scene(), "shape:domain")).toBe("domain");
  });

  it("leaves an id the scene does not hold alone", () => {
    expect(describeRecordId(scene(), "shape:BOW-SXqWq1hVYVZEp8GUy")).toBe(
      "shape:BOW-SXqWq1hVYVZEp8GUy",
    );
  });

  it("marks a terminal nothing binds rather than dropping the pair", () => {
    const unbound = scene();
    delete unbound.store["binding:1f4f1641-0-start"];
    expect(describeRecordId(unbound, "shape:1f4f1641-0")).toBe("? -> domain");
  });
});
