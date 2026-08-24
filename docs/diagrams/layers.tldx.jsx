import { Doc, Frame, Group, Box, Edge, Edges } from "tldx";

import { LAYER } from "./lib/vocabulary.jsx";

// The layer rules, drawn. Black arrows are imports that are allowed; red dotted
// ones are rejected by .oxlintrc.json rather than merely discouraged. Every rule
// here is mechanical - `npm run check` fails on a violation, so this picture is
// the spec, not a convention.
//
// Colours come from the same LAYER palette the pipeline diagram uses, so a box
// that is green here is green there.

export default function Layers() {
  return (
    <Doc title="Layers and dependency rules" layout="col" gap="88">
      <Box
        id="cli"
        maxW="360"
        color={LAYER.cli}
        label={"cli/\ncomposition root - the only place\nreal adapters meet use cases"}
      />

      <Group id="middle" layout="row" gap="200" align="start">
        <Frame id="app" name="app/ - orchestration" layout="col" gap="36">
          <Box
            id="app-usecases"
            maxW="260"
            color={LAYER.app}
            label={"compile-file, watch-and-serve,\nabsorb, verify"}
          />
          <Box
            id="app-ports"
            maxW="240"
            color={LAYER.app}
            dash="dashed"
            label={"app/ports/\ninterface + fake + contract suite"}
          />
        </Frame>

        <Frame id="infra" name="infra/ - adapters" layout="col" gap="36">
          <Box
            id="infra-list"
            maxW="240"
            color={LAYER.infra}
            label={"fs, execute-jsx, layout-elk,\ntransport, devserver, render"}
          />
          <Box
            id="infra-libs"
            maxW="240"
            color="grey"
            label={"chokidar, elkjs, esbuild\npinned to one directory each"}
          />
        </Frame>
      </Group>

      <Box
        id="domain"
        maxW="360"
        color={LAYER.domain}
        label={"domain/\npure logic. no I/O, no clock, no fs"}
      />

      <Box
        id="contracts"
        maxW="360"
        color={LAYER.contracts}
        label={
          "contracts/\nwire types shared by CLI and viewer.\nDepends on nothing inside the project"
        }
      />

      <Group id="leaves" layout="row" gap="200">
        <Box
          id="runtime"
          maxW="260"
          color={LAYER.runtime}
          label={
            'runtime/\nthe "tldx" module authors import.\nA leaf - only its own worker loads it'
          }
        />
        <Box
          id="viewer"
          maxW="260"
          color={LAYER.viewer}
          label={"viewer/\nseparate browser bundle.\ntldraw lives here and nowhere else"}
        />
      </Group>

      <Edges>{`
        cli -> app-usecases
        cli -> infra-list
        app-usecases -> app-ports
        app-usecases -> domain
        infra-list -> app-ports: implements
        infra-list -> domain
        domain -> contracts
        viewer -> contracts
      `}</Edges>

      <Edge
        from="domain"
        to="infra-list"
        fromSide="top-right"
        toSide="bottom"
        color="red"
        dash="dotted"
        size="s"
        label="never"
      />
      <Edge
        from="app-usecases"
        to="infra-list"
        fromSide="right"
        toSide="left"
        color="red"
        dash="dotted"
        size="s"
        label="never - cli/ wires the adapters"
      />

      <Group id="footer" layout="row" gap="64" align="start">
        <Box
          id="legend"
          maxW="420"
          color="red"
          fill="none"
          dash="dotted"
          label="Red = rejected by .oxlintrc.json, so it does not exist in the tree"
        />

        <Box
          id="boundary-test"
          maxW="440"
          color="yellow"
          label="tests/tools/lint-boundaries.test.ts plants one rejected import per layer, so a glob that stops matching cannot stop enforcing silently"
        />
      </Group>
    </Doc>
  );
}
