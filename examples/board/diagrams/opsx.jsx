import { Frame, Group, Box, Edge, flow } from "tldsl";

export const OpsxLifecycle = () => (
  <Frame id="opsx" name="opsx lifecycle" layout="row" gap="64" pad="48">
    <Box id="ox-propose" label={"1. Propose\nopsx new <change>"} color="blue" />
    <Box id="ox-spec" label={"2. Spec delta\nwhat changes, why"} color="blue" />
    <Box id="ox-approve" label={"3. Approve"} geo="diamond" color="orange" />
    <Box id="ox-impl" label={"4. Implement\ntick tasks.md"} color="green" />
    <Box id="ox-archive" label={"5. Archive\ndelta folds into spec"} color="grey" />
{flow("ox-propose", "ox-spec", "ox-approve", "ox-impl", "ox-archive")}
<Edge from="ox-approve" to="ox-spec" label="rejected" dash="dashed" color="red" />
  </Frame>
);
