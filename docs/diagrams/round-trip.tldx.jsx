import { Doc, Group, Box, Edge, Edges } from "tldx";

import { Canvas, Sidecar, SourceFile } from "./lib/vocabulary.jsx";

// The canvas is editable, so the source and the canvas can disagree. This is
// how they get back into agreement. Colour tracks authorship: blue is written
// by a human or an agent editing code, grey is generated and gitignored, green
// is written by absorb - and nothing else writes any of them.

export default function RoundTrip() {
  return (
    <Doc title="Round trip: source, canvas, overlay" layout="col" gap="80">
      <Group id="top" layout="row" gap="180">
        <SourceFile id="source" desc={"the source of truth.\nYou and the agent write this"} />
        <Canvas id="canvas" name="the canvas" desc={"tldraw in the viewer.\nDrag a shape here"} />
      </Group>

      <Sidecar
        id="overlay"
        name="x.tldx.overlay.json"
        desc="sidecar, gitignored. Written only when a human moves a shape - never by the compiler, never into the source"
      />

      <Box
        id="absorb"
        maxW="340"
        label={"tldx absorb\nrewrites the source with the operations JSX can express exactly"}
      />

      <Group id="gate-row" layout="row" gap="200" align="center">
        <Box
          id="gate"
          maxW="200"
          geo="diamond"
          color="yellow"
          label={"recompiles to\nthe same scene?"}
        />
        <Box
          id="verify"
          maxW="300"
          label={
            "tldx verify\nthe same question, asked on demand: does the source alone reproduce the canvas?"
          }
        />
      </Group>

      <Group id="outcomes" layout="row" gap="160" align="start">
        <Box
          id="committed"
          maxW="280"
          color="green"
          label={"kept\nthe overlay is rewritten last, once the check has passed"}
        />
        <Box
          id="rolled-back"
          maxW="280"
          color="red"
          label={"fail\nsource restored from backup, overlay left untouched"}
        />
      </Group>

      <Sidecar
        id="leftover"
        name="still in the overlay"
        desc="what absorb cannot express is left for a human to write"
      />

      <Edges>{`
        source -> canvas: tldx serve compiles and pushes
        overlay -> absorb
        absorb -> gate
        gate -> committed: pass
        gate -> rolled-back: fail
        committed -> leftover
      `}</Edges>

      <Edge from="canvas" to="overlay" fromSide="bottom" toSide="right" label="drag" />
      <Edge from="gate" to="verify" dash="dotted" color="grey" fromSide="right" toSide="left" />
      <Edge
        from="committed"
        to="source"
        fromSide="left"
        toSide="left"
        color="green"
        label="the loop closes here"
      />
    </Doc>
  );
}
