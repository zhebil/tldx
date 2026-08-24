/**
 * The per-page replay buffer every `TransportPort` implementation owes its
 * subscribers. Shared by the fake and the SSE adapter so the two cannot drift
 * apart on a rule the contract suite checks in both.
 *
 * Per page: the last scene, and the last error since that scene. Replayed
 * scene-then-error so a page whose latest compile failed still arrives as its
 * last good render with diagnostics over it. Pages replay in the order they
 * were first pushed, which is the order they were served.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

interface PageState {
  scene?: SceneMessage;
  error?: SceneMessage;
}

export interface ReplayCache {
  /** Record `message` under its own page. Pings are keepalives and are not cached. */
  record(message: SceneMessage): void;
  /** Everything a connecting subscriber must be sent, in replay order. */
  replay(): SceneMessage[];
}

export function createReplayCache(): ReplayCache {
  // Map preserves insertion order, which is the order diagrams were served.
  const pages = new Map<string, PageState>();

  return {
    record(message: SceneMessage): void {
      if (message.kind === "ping") return;
      const { pageKey } = message;
      const state = pages.get(pageKey) ?? {};
      if (message.kind === "scene") {
        state.scene = message;
        // A successful compile supersedes whatever was wrong before it.
        delete state.error;
      } else {
        state.error = message;
      }
      pages.set(pageKey, state);
    },

    replay(): SceneMessage[] {
      const out: SceneMessage[] = [];
      for (const state of pages.values()) {
        if (state.scene !== undefined) out.push(state.scene);
        if (state.error !== undefined) out.push(state.error);
      }
      return out;
    },
  };
}
