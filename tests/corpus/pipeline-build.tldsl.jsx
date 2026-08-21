import { Doc, Pipeline, Box } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="pipeline-build" layout="col" gap="40">
      <Pipeline id="build" name="Build pipeline" gap="56" pad="20" color="blue">
        <Box id="checkout" label="Checkout" color="blue" fill="semi" />
        <Box id="install" label="Install deps" color="blue" fill="semi" />
        <Box id="lint" label="Lint" color="blue" fill="semi" />
        <Box id="test" label="Test" color="blue" fill="semi" />
        <Box id="build-img" label="Build image" color="blue" fill="semi" />
        <Box id="publish" label="Publish" color="green" fill="solid" />
      </Pipeline>
    </Doc>
  );
}
