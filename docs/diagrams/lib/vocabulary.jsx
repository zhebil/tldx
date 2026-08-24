/**
 * The shared vocabulary for the diagrams in docs/. Every entity that appears
 * in more than one picture is defined once, here, so `x.tldx.jsx` is the same
 * blue box in the pipeline and in the round trip, and a pipeline stage is
 * coloured by the layer it lives in.
 *
 * Plain functions over the primitives `"tldx"` exports - no registration, no
 * mechanism. Pass `ns` if you ever place one twice in a document, or the ids
 * collide.
 */
import { Box } from "tldx";

/**
 * One colour per layer, used by both docs/diagrams/layers.tldx.jsx and the
 * stages of docs/diagrams/pipeline.tldx.jsx. Green is pure, orange touches the
 * outside world - which is why the middle of the pipeline is all green.
 */
export const LAYER = {
  cli: "violet",
  app: "light-violet",
  domain: "green",
  infra: "orange",
  contracts: "blue",
  runtime: "black",
  viewer: "light-blue",
};

/** A compiler stage: what it does, and the directory it lives in. */
export function Stage({ id, name, dir, desc, layer, maxW }) {
  return (
    <Box id={id} maxW={maxW ?? "300"} color={LAYER[layer]} label={`${name}\n${dir}\n${desc}`} />
  );
}

/** The `.tldx.jsx` file the author writes. The one source of truth. */
export function SourceFile({ id, desc }) {
  return <Box id={id} maxW="280" color="blue" label={`x.tldx.jsx\n${desc}`} />;
}

/** The tldraw canvas in the viewer - what the author actually looks at. */
export function Canvas({ id, name, desc }) {
  return <Box id={id} maxW="280" color={LAYER.viewer} label={`${name}\n${desc}`} />;
}

/** The overlay sidecar: generated, gitignored, never source. */
export function Sidecar({ id, name, desc, maxW }) {
  return <Box id={id} maxW={maxW ?? "360"} color="grey" dash="dashed" label={`${name}\n${desc}`} />;
}
