import { useEffect, useReducer, useRef, useState, type JSX } from "react";
import { Tldraw, type Editor, type TLPageId, type TLRecord, type TLShapeId } from "tldraw";
import "tldraw/tldraw.css";

import type { Diagnostic } from "../contracts/diagnostic.js";
import { isDocumentRecord, pageIdFor, pageMembers } from "../contracts/page-scope.js";
import type { SceneJSON, TLRecordId } from "../contracts/scene-json.js";

import { createHeartbeat } from "./heartbeat.js";
import { mergePageSlice, orphanPageIds } from "./merge-page.js";
import { createOverlayWriter, type OverlayWriter } from "./overlay-writer.js";
import { createSseClient } from "./sse-client.js";
import {
  applyMessage,
  initialViewerState,
  pageKeyFromHash,
  sceneTitle,
  type ViewerState,
} from "./state.js";

type ViewerPages = ViewerState["pages"];

const EVENTS_URL = "/events";
const TOKEN_URL = "/token";

export function ViewerApp(): JSX.Element {
  const editorRef = useRef<Editor | null>(null);
  const writerRef = useRef<OverlayWriter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  /** Scenes already merged into the store, so a re-render does not re-merge. */
  const mergedRef = useRef<Map<string, SceneJSON>>(new Map());
  const [state, dispatch] = useReducer(applyMessage, initialViewerState);
  const [currentPageKey, setCurrentPageKey] = useState<string | null>(null);

  useEffect(() => {
    const client = createSseClient({
      url: EVENTS_URL,
      onMessage: dispatch,
    });
    return () => {
      client.close();
    };
  }, []);

  useEffect(() => {
    // Keeps `tldx serve`'s idle-TTL reaper from reaping a server someone is
    // actually looking at. `heartbeat.ts` explains the visibility gating.
    const heartbeat = createHeartbeat();
    return () => {
      heartbeat.close();
    };
  }, []);

  useEffect(() => {
    let writer: OverlayWriter | null = null;
    // The write endpoint is gated; a cross-site page cannot read this response,
    // so serving the token to same-origin script is safe.
    void fetch(TOKEN_URL)
      .then((res) => res.json() as Promise<{ token?: string }>)
      .then((body) => body.token ?? "")
      .catch(() => "")
      .then((token) => {
        writer = createOverlayWriter({ token });
        writerRef.current = writer;
      });
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      writer?.close();
      writerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const title = sceneTitle(
      currentPageKey === null ? null : (state.pages[currentPageKey]?.scene ?? null),
    );
    if (title !== null) document.title = `${title} - tldx`;
  }, [state.pages, currentPageKey]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) return;
    setCurrentPageKey(mergePages(editor, state.pages, mergedRef.current, writerRef.current));
  }, [state.pages]);

  function handleMount(editor: Editor): void {
    editorRef.current = editor;
    (window as unknown as { editor?: Editor }).editor = editor;
    setCurrentPageKey(mergePages(editor, state.pages, mergedRef.current, writerRef.current));
    unsubscribeRef.current?.();
    unsubscribeRef.current = editor.store.listen(
      () => {
        // The edit belongs to the page it happened on, and only that page's
        // records travel back - the store holds every served diagram.
        const key = keyOfPage(editor.getCurrentPageId());
        if (key === null) return;
        writerRef.current?.onCanvasChange(key, pageSnapshot(editor, key));
      },
      { source: "user", scope: "document" },
    );
  }

  // Only the page you are looking at gets a banner: a broken diagram you are
  // not viewing must not cover the one you are.
  const diagnostics =
    currentPageKey === null ? [] : (state.pages[currentPageKey]?.diagnostics ?? []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw onMount={handleMount} />
      {diagnostics.length > 0 ? <DiagnosticBanner diagnostics={diagnostics} /> : null}
    </div>
  );
}

/** `page:<key>` back to `<key>`, or null for a page no diagram owns. */
function keyOfPage(pageId: string): string | null {
  const key = pageId.startsWith("page:") ? pageId.slice("page:".length) : null;
  return key === null || key === "" ? null : key;
}

function currentDocumentSnapshot(editor: Editor): SceneJSON {
  return editor.store.getStoreSnapshot("document") as unknown as SceneJSON;
}

/** One page's records, in the shape the overlay endpoint expects. */
function pageSnapshot(editor: Editor, key: string): SceneJSON {
  const document = currentDocumentSnapshot(editor);
  const members = pageMembers(document.store, key);
  const store: Record<TLRecordId, (typeof document.store)[string]> = {};
  for (const id of members) {
    const record = document.store[id];
    if (record !== undefined) store[id] = record;
  }
  return { schema: document.schema, store };
}

/**
 * Bring the store in line with every page the server has pushed, and answer
 * with the page now in view.
 *
 * Only pages whose scene actually changed are touched, so a recompile in one
 * diagram leaves every other page - and its camera and selection - alone. A
 * page arriving for the first time takes the view, since serving a diagram is
 * an explicit request to look at it; a recompile never does.
 */
export function mergePages(
  editor: Editor,
  pages: ViewerPages,
  merged: Map<string, SceneJSON>,
  writer: OverlayWriter | null,
): string | null {
  const arrived: string[] = [];
  const touched: string[] = [];

  editor.store.mergeRemoteChanges(() => {
    for (const [key, page] of Object.entries(pages)) {
      const scene = page.scene;
      if (scene === null || merged.get(key) === scene) continue;
      const isNew = !merged.has(key);
      const { put, remove } = mergePageSlice(
        currentDocumentSnapshot(editor).store,
        scene,
        key,
        isDocumentRecord,
      );
      if (remove.length > 0) editor.store.remove(remove as TLRecordId[] as TLShapeId[]);
      editor.store.put(put as unknown as TLRecord[]);
      merged.set(key, scene);
      touched.push(key);
      if (isNew) arrived.push(key);
    }

    // tldraw boots with an empty "Page 1"; incremental puts never replace it.
    const orphans = orphanPageIds(currentDocumentSnapshot(editor).store, [...merged.keys()]);
    if (orphans.length > 0 && merged.size > 0) {
      editor.store.remove(orphans as TLRecordId[] as TLShapeId[]);
    }
  });

  // Every page the merge touched, so the next change on any of them is
  // compared against what the server sent for *that* page. Noting only the
  // page in view makes tldraw's own post-merge fixups on the others look like
  // user edits, and writes them into their sidecars.
  for (const key of touched) writer?.noteServerScene(key, pageSnapshot(editor, key));

  // `#page=` first: nothing ever writes the hash, so it is there only because
  // someone asked for that page by name - a render, or a shared link - and it
  // must not lose to a diagram that merely arrived in the same merge. Ordered
  // the other way, which page got exported depended on how the server batched
  // its pages, and a tldraw bump was enough to flip it.  With no hash the
  // interactive case is unchanged: a newly arrived page still pops into view.
  const target = deepLinkedKey(merged) ?? arrived.at(-1) ?? keyOfPage(editor.getCurrentPageId());
  if (target !== null && merged.has(target)) {
    editor.setCurrentPage(pageIdFor(target) as TLPageId);
  }
  return target;
}

/**
 * The page named by `#page=` in the URL, if it is one we actually hold. An
 * unknown key is ignored rather than treated as an error - the deep link may
 * name a diagram this server no longer serves.
 */
function deepLinkedKey(merged: Map<string, SceneJSON>): string | null {
  // Guarded so the merge stays callable outside a browser, as its test does.
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const key = pageKeyFromHash(hash);
  return key !== null && merged.has(key) ? key : null;
}

interface BannerProps {
  diagnostics: readonly Diagnostic[];
}

function DiagnosticBanner({ diagnostics }: BannerProps): JSX.Element {
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: "#7a1f1f",
        color: "white",
        font: "13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "8px 12px",
        borderBottom: "1px solid #5a1717",
        maxHeight: "40vh",
        overflowY: "auto",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {diagnostics.length} diagnostic{diagnostics.length === 1 ? "" : "s"}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {diagnostics.map((d, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            <span style={{ opacity: 0.8 }}>[{d.code}]</span>{" "}
            {d.span !== undefined ? (
              <span style={{ opacity: 0.8 }}>
                {d.span.file}:{d.span.line}:{d.span.column}{" "}
              </span>
            ) : null}
            {d.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
