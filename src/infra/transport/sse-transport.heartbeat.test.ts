/**
 * The SSE heartbeat schedule. The HTTP request/response are stubbed so the
 * FakeClock is the only timer source: advancing it is the sole way a write
 * can happen between pushes.
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, it, expect } from "vitest";

import { FakeClock } from "../../app/ports/clock.fake.js";

import { createSseTransport } from "./sse-transport.js";

interface FakeReq extends EventEmitter {}

interface FakeRes extends EventEmitter {
  writeHead(status: number, headers?: Record<string, string>): FakeRes;
  write(chunk: string): boolean;
  end(): void;
  writes: string[];
  ended: boolean;
}

function makeReq(): FakeReq {
  return new EventEmitter();
}

function makeRes(): FakeRes {
  const writes: string[] = [];
  let ended = false;
  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    writes,
    get ended() {
      return ended;
    },
    set ended(_v: boolean) {
      // setter exists only so the property is writable; not used in tests.
      ended = _v;
    },
    writeHead(): FakeRes {
      return res;
    },
    write(chunk: string): boolean {
      writes.push(chunk);
      return true;
    },
    end(): void {
      ended = true;
    },
  }) as unknown as FakeRes;
  return res;
}

function connect(
  transport: ReturnType<typeof createSseTransport>,
): { req: FakeReq; res: FakeRes } {
  const req = makeReq();
  const res = makeRes();
  transport.handler(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
  );
  return { req, res };
}

describe("createSseTransport heartbeat", () => {
  it("writes a `: ping` comment after each heartbeat interval", () => {
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const { res } = connect(transport);

    // After connect: only the `: ok\n\n` sentinel write.
    const beforeCount = res.writes.length;
    expect(res.writes[0]).toBe(": ok\n\n");

    clock.advance(15_000);
    expect(res.writes.length).toBe(beforeCount + 1);
    expect(res.writes[res.writes.length - 1]).toBe(": ping\n\n");

    clock.advance(15_000);
    expect(res.writes.length).toBe(beforeCount + 2);
    expect(res.writes[res.writes.length - 1]).toBe(": ping\n\n");
  });

  it("does not fire a heartbeat before the interval elapses", () => {
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const { res } = connect(transport);
    const baseline = res.writes.length;

    clock.advance(14_999);
    expect(res.writes.length).toBe(baseline);
  });

  it("stops heartbeating after the client disconnects", () => {
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const { req, res } = connect(transport);

    clock.advance(15_000);
    const afterFirst = res.writes.length;
    expect(res.writes[afterFirst - 1]).toBe(": ping\n\n");

    req.emit("close");

    clock.advance(60_000);
    expect(res.writes.length).toBe(afterFirst);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("stops heartbeating after the transport closes", async () => {
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const { res } = connect(transport);

    clock.advance(15_000);
    const afterFirst = res.writes.length;

    await transport.close();

    clock.advance(60_000);
    expect(res.writes.length).toBe(afterFirst);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("schedules an independent heartbeat per client", () => {
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const a = connect(transport);
    const b = connect(transport);

    clock.advance(15_000);
    expect(a.res.writes[a.res.writes.length - 1]).toBe(": ping\n\n");
    expect(b.res.writes[b.res.writes.length - 1]).toBe(": ping\n\n");
  });

  it("rejects a non-positive heartbeat interval", () => {
    const clock = new FakeClock();
    expect(() => createSseTransport({ clock, heartbeatMs: 0 })).toThrow();
    expect(() => createSseTransport({ clock, heartbeatMs: -1 })).toThrow();
  });
});
