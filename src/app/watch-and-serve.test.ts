import { describe, expect, it } from "vitest";

import type { SceneMessage } from "../contracts/scene-message.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import { FakeExecute } from "./ports/execute.fake.js";
import { CaptureLog } from "./ports/log.fake.js";
import { FakeWatch } from "./ports/watch.fake.js";
import { InMemoryFs } from "./ports/fs.fake.js";
import { InMemoryTransport } from "./ports/transport.fake.js";
import { watchAndServe, type WatchAndServeDeps } from "./watch-and-serve.js";

const VALID_DOC = `<doc id="auth">
  <box id="login" label="Login" />
  <box id="dash" label="Dashboard" />
  <edge from="login" to="dash" />
</doc>`;

const ANOTHER_VALID_DOC = `<doc id="auth">
  <box id="login" label="Login" />
  <box id="dash" label="Dashboard" />
  <note id="readme" label="ok" />
</doc>`;

const PARSE_BROKEN = `<doc id="d"><box id="b"`;

const IR_BROKEN = `<doc id="d"><box id="x" /><box id="x" /></doc>`;

interface Setup {
  deps: WatchAndServeDeps;
  fs: InMemoryFs;
  watch: FakeWatch;
  transport: InMemoryTransport;
  log: CaptureLog;
}

function setup(initial: Record<string, string>): Setup {
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
    execute: new FakeExecute(),
  };
  return { deps, fs, watch, transport, log };
}

function isScene(m: SceneMessage): m is Extract<SceneMessage, { kind: "scene" }> {
  return m.kind === "scene";
}
function isError(m: SceneMessage): m is Extract<SceneMessage, { kind: "error" }> {
  return m.kind === "error";
}

describe("watchAndServe", () => {
  it("pushes a scene message after the initial compile", async () => {
    const { deps, transport } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
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
    const { deps, watch } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    expect(watch.activeSubscribers("auth.tldsl")).toBe(1);
    await handle.close();
    expect(watch.activeSubscribers("auth.tldsl")).toBe(0);
  });

  it("pushes a fresh scene message on every change event", async () => {
    const { deps, fs, watch, transport } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    expect(transport.pushed).toHaveLength(1);

    fs.setFile("auth.tldsl", ANOTHER_VALID_DOC);
    watch.emitChange("auth.tldsl");
    await handle.idle();

    expect(transport.pushed).toHaveLength(2);
    expect(transport.pushed.every(isScene)).toBe(true);

    await handle.close();
  });

  it("on compile error pushes only an error envelope - no scene", async () => {
    const { deps, fs, watch, transport } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    expect(transport.pushed).toHaveLength(1);
    expect(transport.pushed[0]!.kind).toBe("scene");

    fs.setFile("auth.tldsl", PARSE_BROKEN);
    watch.emitChange("auth.tldsl");
    await handle.idle();

    expect(transport.pushed).toHaveLength(2);
    const second = transport.pushed[1]!;
    expect(second.kind).toBe("error");
    expect(second.v).toBe(1);
    if (isError(second)) {
      const codes = second.payload.diagnostics.map((d) => d.code);
      expect(codes.some((c) => c.startsWith("parser/"))).toBe(true);
    }
    // Critically: only one error message was pushed - no scene accompanied it.
    const errorsAfterFirst = transport.pushed
      .slice(1)
      .filter((m) => m.kind === "scene");
    expect(errorsAfterFirst).toHaveLength(0);

    await handle.close();
  });

  it("suppresses null results that have no diagnostics", async () => {
    const { deps, fs, watch, transport, log } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;

    fs.setFile("auth.tldsl", "");
    watch.emitChange("auth.tldsl");
    await handle.idle();

    expect(transport.pushed).toHaveLength(1);
    expect(transport.pushed[0]!.kind).toBe("scene");
    expect(log.byCode("watch/recompile-error")).toHaveLength(0);

    await handle.close();
  });

  it("recovery: a clean compile after an error pushes a fresh scene", async () => {
    const { deps, fs, watch, transport } = setup({
      "auth.tldsl": IR_BROKEN,
    });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;

    // initial compile failed → only an error envelope.
    expect(transport.pushed).toHaveLength(1);
    expect(transport.pushed[0]!.kind).toBe("error");

    fs.setFile("auth.tldsl", VALID_DOC);
    watch.emitChange("auth.tldsl");
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
    const { deps, log } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    expect(log.byCode("watch/recompile-ok")).toHaveLength(1);
    await handle.close();
  });

  it("reports compile errors via the log port (code, not message text)", async () => {
    const { deps, log } = setup({ "auth.tldsl": IR_BROKEN });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    expect(log.byCode("watch/recompile-error")).toHaveLength(1);
    await handle.close();
  });

  it("ignores change events delivered after close()", async () => {
    const { deps, fs, watch, transport } = setup({ "auth.tldsl": VALID_DOC });
    const handle = watchAndServe("auth.tldsl", deps);
    await handle.ready;
    await handle.close();

    fs.setFile("auth.tldsl", ANOTHER_VALID_DOC);
    watch.emitChange("auth.tldsl"); // close already unsubscribed; no-op anyway

    expect(transport.pushed).toHaveLength(1);
  });
});
