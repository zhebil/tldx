import { useEffect, useReducer, useRef } from "react";
import { Tldraw, type Editor, type TLStoreSnapshot } from "tldraw";
import "tldraw/tldraw.css";

import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";

import { createHeartbeat } from "./heartbeat.js";
import { createOverlayWriter, type OverlayWriter } from "./overlay-writer.js";
import { createSseClient } from "./sse-client.js";
import { applyMessage, initialViewerState, sceneTitle } from "./state.js";

const EVENTS_URL = "/events";

export function ViewerApp(): JSX.Element {
  const editorRef = useRef<Editor | null>(null);
  const writerRef = useRef<OverlayWriter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [state, dispatch] = useReducer(applyMessage, initialViewerState);

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
    const writer = createOverlayWriter();
    writerRef.current = writer;
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      writer.close();
      writerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const title = sceneTitle(state.scene);
    if (title !== null) document.title = `${title} - tldx`;
  }, [state.scene]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || state.scene === null) return;
    writerRef.current?.noteServerScene(state.scene);
    if (deepEqual(currentDocumentSnapshot(editor), state.scene)) return;
    pushScene(editor, state.scene);
  }, [state.scene]);

  function handleMount(editor: Editor): void {
    editorRef.current = editor;
    (window as unknown as { editor?: Editor }).editor = editor;
    if (state.scene !== null) {
      writerRef.current?.noteServerScene(state.scene);
      pushScene(editor, state.scene);
    }
    unsubscribeRef.current?.();
    unsubscribeRef.current = editor.store.listen(
      () => {
        writerRef.current?.onCanvasChange(currentDocumentSnapshot(editor));
      },
      { source: "user", scope: "document" },
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw onMount={handleMount} />
      {state.diagnostics.length > 0 ? (
        <DiagnosticBanner diagnostics={state.diagnostics} />
      ) : null}
    </div>
  );
}

export function pushScene(editor: Editor, scene: SceneJSON): void {
  editor.store.mergeRemoteChanges(() => {
    editor.loadSnapshot(scene as unknown as TLStoreSnapshot);
  });
}

function currentDocumentSnapshot(editor: Editor): SceneJSON {
  return editor.store.getStoreSnapshot("document") as unknown as SceneJSON;
}

/**
 * The server re-pushes the applied scene after every overlay write. Reloading
 * an identical snapshot would clear selection and flash the canvas mid-edit,
 * so a scene matching the editor's current document is skipped.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
