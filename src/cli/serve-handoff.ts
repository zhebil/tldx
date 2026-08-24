/**
 * The client half of the shared-server handoff: when a `tldx serve` finds a
 * server already running for this project, it posts its file there instead of
 * booting a second one, and exits.
 *
 * The token comes from the registry record, which only the user who started the
 * server can read - see `dev-server.ts` for why these endpoints are gated at
 * all.
 */

import { resolve } from "node:path";

import type { ServeRecord } from "../infra/serve-registry/serve-registry.js";

export type HandoffResult = {
  pageKey: string;
  name?: string;
  alreadyServed: boolean;
  hasViewer: boolean;
};

function isHandoffResult(value: unknown): value is HandoffResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.pageKey === "string" &&
    typeof record.alreadyServed === "boolean" &&
    typeof record.hasViewer === "boolean"
  );
}

/** Hand `file` to the server described by `record`. Throws with the server's reason on failure. */
export async function handOff(record: ServeRecord, file: string): Promise<HandoffResult> {
  const response = await fetch(new URL("/diagrams", record.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-tldx-token": record.token },
    body: JSON.stringify({ file: resolve(file) }),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: unknown) => (body as { error?: string } | null)?.error)
      .catch(() => undefined);
    throw new Error(
      detail ?? `server at ${record.url} refused the diagram (HTTP ${String(response.status)})`,
    );
  }

  const body: unknown = await response.json();
  if (!isHandoffResult(body)) {
    throw new Error(`server at ${record.url} returned an unrecognised response`);
  }
  return body;
}
