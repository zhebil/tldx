import { Doc, Frame, Group, Box, Edge, Edges } from "tldx";

import { LAYER, SourceFile, Canvas, Sidecar, Stage } from "./lib/vocabulary.jsx";

// How a .tldx.jsx file becomes pixels. The stages match the directories they
// live in, so the picture doubles as a map of src/ - and because <Stage> takes
// its colour from the shared LAYER palette, the middle of the pipeline being
// green is not a styling choice, it is the fact that lower/layout/emit/overlay
// are all pure domain code.
//
// The layout stage is opened up because it is the only one that is six files
// rather than one, and because ELK's opt-in role there is what people get wrong.

export default function Pipeline() {
  return (
    <Doc title="Compile pipeline" layout="col" gap="72">
      <SourceFile id="source" desc="a module whose default export returns a <Doc>" />

      <Stage
        id="execute"
        name="execute"
        dir="infra/execute-jsx"
        desc="esbuild bundles it, a fresh worker runs it"
        layer="infra"
      />

      <Stage
        id="lower"
        name="lower"
        dir="domain/ir/lower.ts"
        desc="AST to IR: ids, props, edge endpoints"
        layer="domain"
      />

      <Group id="layout-row" layout="row" gap="80" align="center">
        <Frame id="layout" name="layout - domain/layout" layout="row" gap="40">
          <Box id="defaults" maxW="150" color="light-green" label={"defaults\nsizes boxes"} />
          <Box
            id="glyph-metrics"
            maxW="150"
            color="light-green"
            label={"glyph-metrics\nmeasures text"}
          />
          <Box id="stack" maxW="150" color="light-green" label={"stack\nrows, cols, grids"} />
          <Box
            id="routing"
            maxW="150"
            color="light-green"
            label={"routing\nbends and fans edges"}
          />
          <Box id="attach" maxW="150" color="light-green" label={"attach\nplaces stickies"} />
          <Box id="occlusion" maxW="150" color="yellow" label={"occlusion\nreports overlaps"} />
        </Frame>

        <Box
          id="elk"
          maxW="260"
          dash="dashed"
          color={LAYER.infra}
          label={"ELK\ninfra/layout-elk\nopt-in, one container at a time"}
        />
      </Group>

      <Stage
        id="emit"
        name="emit"
        dir="domain/emit"
        desc="positioned IR to a tldraw store snapshot"
        layer="domain"
      />

      <Group id="overlay-row" layout="row" gap="80" align="center">
        <Stage
          id="overlay"
          name="overlay"
          dir="domain/overlay"
          desc="applies canvas edits, never re-runs layout"
          layer="domain"
        />
        <Sidecar
          id="sidecar"
          name="x.tldx.overlay.json"
          desc="the canvas edits, if any"
          maxW="240"
        />
      </Group>

      <Stage
        id="transport"
        name="transport"
        dir="infra/transport"
        desc="SSE to the browser"
        layer="infra"
      />

      <Canvas id="viewer" name="viewer" desc="src/viewer, a tldraw canvas" />

      <Edges>{`
        source -> execute -> lower -> layout
        layout -> emit -> overlay -> transport -> viewer
      `}</Edges>

      <Edge from="sidecar" to="overlay" fromSide="left" toSide="right" dash="dashed" size="s" />

      <Edge
        from="layout"
        to="elk"
        fromSide="1,0.35"
        toSide="0,0.35"
        dash="dashed"
        color="grey"
        label="one flat container"
        size="s"
      />
      <Edge
        from="elk"
        to="layout"
        fromSide="0,0.75"
        toSide="1,0.75"
        dash="dashed"
        color="grey"
        label="positions only"
        size="s"
      />
    </Doc>
  );
}
