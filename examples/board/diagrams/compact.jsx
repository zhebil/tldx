import { Frame, Group, Box, Edge, Sticky, flow } from "tldsl";

export const WhenToCompact = () => (
  <Frame id="compact" name="When to /compact" layout="col" gap="56" pad="48" align="center">
    <Box id="c-start" label={"context bar creeping up"} color="grey" />
    <Box id="c-q1" label={"Task done?"} geo="diamond" color="orange" />
    <Group id="c-mid" layout="row" gap="120" align="start">
      <Box id="c-clear" label={"/clear\nfresh window, zero carryover"} color="green" />
      <Group id="c-right" layout="col" gap="56">
        <Box id="c-q2" label={"Above ~70% used?"} geo="diamond" color="orange" />
        <Box id="c-q3" label={"Mid-flow on\none thread?"} geo="diamond" color="orange" />
        <Box id="c-compact" label={"/compact\nwith a focus hint"} color="blue" />
      </Group>
      <Box id="c-keep" label={"keep going\ndon't compact for sport"} color="grey" />
    </Group>
<Edge from="c-start" to="c-q1" />
<Edge from="c-q1" to="c-clear" label="yes" color="green" />
<Edge from="c-q1" to="c-q2" label="no" />
<Edge from="c-q2" to="c-keep" label="no" color="grey" />
<Edge from="c-q2" to="c-q3" label="yes" />
<Edge from="c-q3" to="c-compact" label="yes" color="blue" />
<Edge from="c-q3" to="c-clear" label={"no - unrelated\nnext task"} color="green" dash="dashed" />
<Sticky on="c-compact">Say what to keep: "compact, keep the auth refactor plan and the failing test".</Sticky>
  </Frame>
);
