import {
  SCENE_MESSAGE_VERSION,
  type SceneMessage,
} from "../contracts/scene-message.js";

export type SceneMessageHandler = (message: SceneMessage) => void;

export interface SseClientOptions {
  url: string;
  onMessage: SceneMessageHandler;
  onParseError?: (raw: string, error: unknown) => void;
}

export interface SseClient {
  close(): void;
}

/**
 * Browser-side EventSource subscriber. Parses each `data:` event as a
 * `SceneMessage` envelope and forwards it to `onMessage`. Reconnect is
 * handled by EventSource itself.
 */
export function createSseClient(options: SseClientOptions): SseClient {
  const source = new EventSource(options.url);

  source.onmessage = (event: MessageEvent<string>): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch (err) {
      options.onParseError?.(event.data, err);
      return;
    }
    if (!isSceneMessage(parsed)) {
      options.onParseError?.(event.data, new Error("not a SceneMessage"));
      return;
    }
    options.onMessage(parsed);
  };

  return {
    close(): void {
      source.close();
    },
  };
}

export function isSceneMessage(value: unknown): value is SceneMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { v?: unknown; kind?: unknown; payload?: unknown };
  if (v.v !== SCENE_MESSAGE_VERSION) return false;
  if (typeof v.payload !== "object" || v.payload === null) return false;
  return v.kind === "scene" || v.kind === "error" || v.kind === "ping";
}
