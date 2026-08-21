import { useEffect, useReducer, useRef } from "react";
import { Tldraw, type Editor, type TLStoreSnapshot } from "tldraw";
import "tldraw/tldraw.css";

import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";

import { createSseClient } from "./sse-client.js";
import { applyMessage, initialViewerState } from "./state.js";

const EVENTS_URL = "/events";

export function ViewerApp(): JSX.Element {
  const editorRef = useRef<Editor | null>(null);
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
    const editor = editorRef.current;
    if (editor === null || state.scene === null) return;
    pushScene(editor, state.scene);
  }, [state.scene]);

  function handleMount(editor: Editor): void {
    editorRef.current = editor;
    (window as unknown as { editor?: Editor }).editor = editor;
    if (state.scene !== null) {
      pushScene(editor, state.scene);
    }
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

function pushScene(editor: Editor, scene: SceneJSON): void {
  editor.loadSnapshot(scene as unknown as TLStoreSnapshot);
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
