import { describe, expect, it } from "vitest";

import type { SceneMessage } from "../contracts/scene-message.js";
import { error } from "../domain/diagnostics/index.js";
import { astBuilders } from "../domain/parser/ast.fixture.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import { FakeExecute } from "./ports/execute.fake.js";
import { CaptureLog } from "./ports/log.fake.js";
import { FakeWatch } from "./ports/watch.fake.js";
import { InMemoryFs } from "./ports/fs.fake.js";
import { InMemoryTransport } from "./ports/transport.fake.js";
import { watchAndServe, type WatchAndServeDeps } from "./watch-and-serve.js";

const AUTH_PATH = "auth.tldx.jsx";
const VALID_SRC = "valid-source";
const ANOTHER_VALID_SRC = "another-valid-source";
const COMPILE_BROKEN_SRC = "compile-broken-source";
const IR_BROKEN_SRC = "ir-broken-source";

const { doc, box, edge, note } = astBuilders(AUTH_PATH);

const VALID_AST = doc({ id: "auth" }, [
  box({ id: "login", label: "Login" }),
  box({ id: "dash", label: "Dashboard" }),
  edge({ from: "login", to: "dash" }),
]);

const ANOTHER_VALID_AST = doc({ id: "auth" }, [
  box({ id: "login", label: "Login" }),
  box({ id: "dash", label: "Dashboard" }),
  note({ id: "readme" }, "ok"),
]);

const IR_BROKEN_AST = doc({ id: "d" }, [
  box({ id: "x" }),
  box({ id: "x" }),
]);

interface Setup {
  deps: WatchAndServeDeps;
  fs: InMemoryFs;
  watch: FakeWatch;
  transport: InMemoryTransport;
  log: CaptureLog;
  execute: FakeExecute;
}

function setup(initial: Record<string, string>, execute: FakeExecute = new FakeExecute()): Setup {
  const fs = new InMemoryFs(initial);
  const watch = new FakeWatch();
  const transport = new InMemoryTransport();
  const log = new CaptureLog();
  const deps: WatchAndServeDeps = {
    fs,
    watch,
    transport,
    log,
    layout: new StubLayout(),
    execute,
  };
  return { deps, fs, watch, transport, log, execute };
}

function isScene(m: SceneMessage): m is Extract<SceneMessage, { kind: "scene" }> {
  return m.kind === "scene";
}
function isError(m: SceneMessage): m is Extract<SceneMessage, { kind: "error" }> {
  return m.kind === "error";
}

describe("watchAndServe", () => {
  it("pushes a scene message after the initial compile", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    const { deps, transport } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;

    expect(transport.pushed).toHaveLength(1);
    const m = transport.pushed[0]!;
    expect(m.v).toBe(1);
    expect(m.kind).toBe("scene");
    if (isScene(m)) {
      const shapeRecords = Object.values(m.payload.store).filter(
        (r) => r.typeName === "shape",
      );
      expect(shapeRecords.length).toBeGreaterThan(0);
    }

    await handle.close();
  });

  it("subscribes to the watched path and unsubscribes on close", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    const { deps, watch } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    expect(watch.activeSubscribers(AUTH_PATH)).toBe(1);
    await handle.close();
    expect(watch.activeSubscribers(AUTH_PATH)).toBe(0);
  });

  it("pushes a fresh scene message on every change event", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    execute.setResult(ANOTHER_VALID_SRC, { ast: ANOTHER_VALID_AST, inputs: [AUTH_PATH] });
    const { deps, fs, watch, transport } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    expect(transport.pushed).toHaveLength(1);

    fs.setFile(AUTH_PATH, ANOTHER_VALID_SRC);
    watch.emitChange(AUTH_PATH);
    await handle.idle();

    expect(transport.pushed).toHaveLength(2);
    expect(transport.pushed.every(isScene)).toBe(true);

    await handle.close();
  });

  it("on compile error pushes only an error envelope - no scene", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    execute.setResult(COMPILE_BROKEN_SRC, {
      diagnostics: [error("runtime/compile", "bad jsx", { file: AUTH_PATH, line: 1, column: 1 })],
    });
    const { deps, fs, watch, transport } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    expect(transport.pushed).toHaveLength(1);
    expect(transport.pushed[0]!.kind).toBe("scene");

    fs.setFile(AUTH_PATH, COMPILE_BROKEN_SRC);
    watch.emitChange(AUTH_PATH);
    await handle.idle();

    expect(transport.pushed).toHaveLength(2);
    const second = transport.pushed[1]!;
    expect(second.kind).toBe("error");
    expect(second.v).toBe(1);
    if (isError(second)) {
      const codes = second.payload.diagnostics.map((d) => d.code);
      expect(codes.some((c) => c.startsWith("runtime/"))).toBe(true);
    }
    // Critically: only one error message was pushed - no scene accompanied it.
    const errorsAfterFirst = transport.pushed
      .slice(1)
      .filter((m) => m.kind === "scene");
    expect(errorsAfterFirst).toHaveLength(0);

    await handle.close();
  });

  it("recovery: a clean compile after an error pushes a fresh scene", async () => {
    const execute = new FakeExecute();
    execute.setResult(IR_BROKEN_SRC, { ast: IR_BROKEN_AST, inputs: [AUTH_PATH] });
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    const { deps, fs, watch, transport } = setup({ [AUTH_PATH]: IR_BROKEN_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;

    // initial compile failed → only an error envelope.
    expect(transport.pushed).toHaveLength(1);
    expect(transport.pushed[0]!.kind).toBe("error");

    fs.setFile(AUTH_PATH, VALID_SRC);
    watch.emitChange(AUTH_PATH);
    await handle.idle();

    expect(transport.pushed).toHaveLength(2);
    const recovery = transport.pushed[1]!;
    expect(recovery.kind).toBe("scene");
    if (isScene(recovery)) {
      const shapeCount = Object.values(recovery.payload.store).filter(
        (r) => r.typeName === "shape",
      ).length;
      expect(shapeCount).toBeGreaterThan(0);
    }

    await handle.close();
  });

  it("reports the initial compile result on the log port", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    const { deps, log } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    expect(log.byCode("watch/recompile-ok")).toHaveLength(1);
    await handle.close();
  });

  it("reports compile errors via the log port (code, not message text)", async () => {
    const execute = new FakeExecute();
    execute.setResult(IR_BROKEN_SRC, { ast: IR_BROKEN_AST, inputs: [AUTH_PATH] });
    const { deps, log } = setup({ [AUTH_PATH]: IR_BROKEN_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    expect(log.byCode("watch/recompile-error")).toHaveLength(1);
    await handle.close();
  });

  it("ignores change events delivered after close()", async () => {
    const execute = new FakeExecute();
    execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
    execute.setResult(ANOTHER_VALID_SRC, { ast: ANOTHER_VALID_AST, inputs: [AUTH_PATH] });
    const { deps, fs, watch, transport } = setup({ [AUTH_PATH]: VALID_SRC }, execute);
    const handle = watchAndServe(AUTH_PATH, deps);
    await handle.ready;
    await handle.close();

    fs.setFile(AUTH_PATH, ANOTHER_VALID_SRC);
    watch.emitChange(AUTH_PATH); // close already unsubscribed; no-op anyway

    expect(transport.pushed).toHaveLength(1);
  });

  describe("putOverlay merge (tldx-j3q)", () => {
    const SRC_WITH_DASH = "src-with-dash";
    const SRC_DASH_REMOVED = "src-dash-removed";
    const AST_WITH_DASH = doc({ id: "auth" }, [
      box({ id: "login", label: "Login" }),
      box({ id: "dash", label: "Dashboard" }),
    ]);
    const AST_DASH_REMOVED = doc({ id: "auth" }, [box({ id: "login", label: "Login" })]);

    it("preserves an overlay entry a source edit invalidates instead of silently dropping it", async () => {
      const execute = new FakeExecute();
      execute.setResult(SRC_WITH_DASH, { ast: AST_WITH_DASH, inputs: [AUTH_PATH] });
      execute.setResult(SRC_DASH_REMOVED, { ast: AST_DASH_REMOVED, inputs: [AUTH_PATH] });
      const fs = new InMemoryFs({ [AUTH_PATH]: SRC_WITH_DASH });
      const watch = new FakeWatch();
      const transport = new InMemoryTransport();
      const log = new CaptureLog();
      const deps: WatchAndServeDeps = {
        fs,
        fsWrite: fs,
        watch,
        transport,
        log,
        layout: new StubLayout(),
        execute,
      };
      const overlayPath = "auth.tldx.overlay.json";

      const handle = watchAndServe(AUTH_PATH, deps);
      await handle.ready;

      // The user drags "dash" on the canvas; the browser PUTs its current
      // snapshot and putOverlay records the edit.
      const initial = transport.pushed[0]!;
      if (!isScene(initial)) throw new Error("expected initial push to be a scene");
      const dashRecord = initial.payload.store["shape:dash"]!;
      await handle.putOverlay({
        schema: initial.payload.schema,
        store: {
          ...initial.payload.store,
          "shape:dash": { ...dashRecord, x: 999, y: 999 },
        },
      });

      const afterDrag = JSON.parse(await fs.read(overlayPath)) as { entries: Record<string, unknown> };
      expect(afterDrag.entries["shape:dash"]).toBeDefined();

      // An unrelated source edit drops "dash" from the diagram entirely -
      // the compiled scene no longer has a record for it at all.
      fs.setFile(AUTH_PATH, SRC_DASH_REMOVED);
      watch.emitChange(AUTH_PATH);
      await handle.idle();

      // A bare recompile never writes the overlay file - it is untouched.
      const afterRecompile = JSON.parse(await fs.read(overlayPath)) as {
        entries: Record<string, unknown>;
      };
      expect(afterRecompile.entries["shape:dash"]).toBeDefined();

      // The browser posts its next snapshot - whatever was last pushed to
      // it, which no longer contains shape:dash since its overlay entry no
      // longer resolves against the fresh compile.
      const pushedAfterRecompile = transport.pushed.at(-1)!;
      if (!isScene(pushedAfterRecompile)) throw new Error("expected a scene push after recompile");
      expect(pushedAfterRecompile.payload.store["shape:dash"]).toBeUndefined();
      await handle.putOverlay(pushedAfterRecompile.payload);

      // Before the fix this overwrite dropped shape:dash for good - a
      // source edit elsewhere silently destroying real canvas work.
      const afterSecondPut = JSON.parse(await fs.read(overlayPath)) as {
        entries: Record<string, unknown>;
      };
      expect(afterSecondPut.entries["shape:dash"]).toBeDefined();
      const preservedLogs = log.byCode("overlay/preserved");
      expect(preservedLogs).toHaveLength(1);
      expect(preservedLogs[0]!.fields).toEqual({ ids: ["shape:dash"] });

      await handle.close();
    });
  });

  describe("putOverlay clears a stale entry (tldx-z2j)", () => {
    it("drops an entry when the snapshot's record matches the compiled base again", async () => {
      const execute = new FakeExecute();
      execute.setResult(VALID_SRC, { ast: VALID_AST, inputs: [AUTH_PATH] });
      const fs = new InMemoryFs({ [AUTH_PATH]: VALID_SRC });
      const watch = new FakeWatch();
      const transport = new InMemoryTransport();
      const log = new CaptureLog();
      const deps: WatchAndServeDeps = {
        fs,
        fsWrite: fs,
        watch,
        transport,
        log,
        layout: new StubLayout(),
        execute,
      };
      const overlayPath = "auth.tldx.overlay.json";

      const handle = watchAndServe(AUTH_PATH, deps);
      await handle.ready;

      const initial = transport.pushed[0]!;
      if (!isScene(initial)) throw new Error("expected initial push to be a scene");
      const dashRecord = initial.payload.store["shape:dash"]!;

      // The user drags "dash"; putOverlay records the moved entry.
      await handle.putOverlay({
        schema: initial.payload.schema,
        store: {
          ...initial.payload.store,
          "shape:dash": { ...dashRecord, x: 999, y: 999 },
        },
      });
      const afterDrag = JSON.parse(await fs.read(overlayPath)) as { entries: Record<string, unknown> };
      expect(afterDrag.entries["shape:dash"]).toBeDefined();

      // Undo: the browser's next snapshot has "dash" back at its compiled
      // (base) position - present in the snapshot, but the diff against
      // `lastCompiled` is now empty for that id.
      await handle.putOverlay({
        schema: initial.payload.schema,
        store: initial.payload.store,
      });

      const afterUndo = JSON.parse(await fs.read(overlayPath)) as { entries: Record<string, unknown> };
      expect(afterUndo.entries["shape:dash"]).toBeUndefined();
      // Not the j3q "invalidated id" path - nothing should be preserved.
      expect(log.byCode("overlay/preserved")).toHaveLength(0);

      await handle.close();
    });
  });

  describe("module graph re-subscription", () => {
    const ENTRY = "a.tldx.jsx";
    const SRC_OK = "ok-source";
    const SRC_BROKEN = "broken-source";

    function makeExecuteOk(): FakeExecute {
      const { doc: entryDoc, box: entryBox } = astBuilders(ENTRY);
      const execute = new FakeExecute();
      execute.setResult(SRC_OK, {
        ast: entryDoc({}, [entryBox({ id: "b" })]),
        inputs: [ENTRY, "parts.tldx.jsx"],
      });
      return execute;
    }

    it("re-subscribes to the module graph after a successful compile", async () => {
      const fs = new InMemoryFs({ [ENTRY]: SRC_OK });
      const watch = new FakeWatch();
      const transport = new InMemoryTransport();
      const deps: WatchAndServeDeps = {
        fs,
        watch,
        transport,
        log: new CaptureLog(),
        layout: new StubLayout(),
        execute: makeExecuteOk(),
      };

      const handle = watchAndServe(ENTRY, deps);
      await handle.ready;

      expect(watch.activeSubscribers("parts.tldx.jsx")).toBe(1);
      expect(transport.pushed).toHaveLength(1);

      watch.emitChange("parts.tldx.jsx");
      await handle.idle();

      expect(transport.pushed).toHaveLength(2);

      await handle.close();
    });

    it("a failed compile keeps the previous watch set", async () => {
      // The WatchPort contract can't express this - the port knows nothing
      // about compiles. This pins watchAndServe's response to compileFile's
      // `inputs: null` arm, the nasty failure mode the plan calls out.
      const fs = new InMemoryFs({ [ENTRY]: SRC_OK });
      const watch = new FakeWatch();
      const transport = new InMemoryTransport();
      const execute = makeExecuteOk();
      execute.setResult(SRC_BROKEN, {
        diagnostics: [error("runtime/threw", "boom", { file: ENTRY, line: 1, column: 1 })],
      });
      const deps: WatchAndServeDeps = {
        fs,
        watch,
        transport,
        log: new CaptureLog(),
        layout: new StubLayout(),
        execute,
      };

      const handle = watchAndServe(ENTRY, deps);
      await handle.ready;
      expect(watch.activeSubscribers("parts.tldx.jsx")).toBe(1);

      fs.setFile(ENTRY, SRC_BROKEN);
      watch.emitChange(ENTRY);
      await handle.idle();

      expect(transport.pushed).toHaveLength(2);
      expect(transport.pushed[1]!.kind).toBe("error");
      expect(watch.activeSubscribers("parts.tldx.jsx")).toBe(1);

      watch.emitChange("parts.tldx.jsx");
      await handle.idle();
      expect(transport.pushed).toHaveLength(3);

      await handle.close();
    });
  });
});
