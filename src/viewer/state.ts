import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";
import type { SceneMessage } from "../contracts/scene-message.js";

/** One served diagram, as the viewer knows it. */
export interface PageState {
  /** Last successfully compiled scene, or null if it has never compiled. */
  readonly scene: SceneJSON | null;
  /** Diagnostics outstanding for this page; empty once it compiles again. */
  readonly diagnostics: readonly Diagnostic[];
}

export interface ViewerState {
  /** Every page the server has pushed, keyed by page key, in arrival order. */
  readonly pages: Readonly<Record<string, PageState>>;
}

export const initialViewerState: ViewerState = { pages: {} };

const EMPTY_PAGE: PageState = { scene: null, diagnostics: [] };

/**
 * The page record's name, which `emit` sets from the document `title` or the
 * file name. Used for the browser tab; null before the first scene arrives.
 */
export function sceneTitle(scene: SceneJSON | null): string | null {
  if (scene === null) return null;
  for (const record of Object.values(scene.store)) {
    if (record.typeName === "page" && typeof record.name === "string") return record.name;
  }
  return null;
}

/**
 * Messages are per page, so a compile in one diagram never disturbs another -
 * in particular a success in `a` must not clear `b`'s outstanding diagnostics,
 * and a failure in `b` must not take `b`'s last good scene away.
 */
export function applyMessage(state: ViewerState, message: SceneMessage): ViewerState {
  switch (message.kind) {
    case "scene":
      return {
        pages: { ...state.pages, [message.pageKey]: { scene: message.payload, diagnostics: [] } },
      };
    case "error": {
      const previous = state.pages[message.pageKey] ?? EMPTY_PAGE;
      return {
        pages: {
          ...state.pages,
          // Last-good: keep the prior scene; only surface diagnostics.
          [message.pageKey]: { scene: previous.scene, diagnostics: message.payload.diagnostics },
        },
      };
    }
    case "ping":
      return state;
  }
}

/**
 * Page key named by a URL fragment like `#page=3f2a9c11`, or null. `tldx serve`
 * opens the browser at one so the tab lands on the diagram you just served,
 * and `tldx render` uses it to target the page it is exporting.
 */
export function pageKeyFromHash(hash: string): string | null {
  const match = /^#?page=([0-9a-zA-Z_-]+)$/.exec(hash);
  return match?.[1] ?? null;
}
