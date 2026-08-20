import { Doc, Frame, Box, Edge } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="deep-nesting">
      <Frame id="l1" name="System" pad="24" layout="col" gap="16">
        <Box id="l1-gateway" label="Gateway" />
        <Box id="l1-config" label="Config" />

        <Frame id="l2" name="Service" pad="20" layout="col" gap="14">
          <Box id="l2-router" label="Router" />
          <Box id="l2-metrics" label="Metrics" />

          <Frame id="l3" name="Module" pad="16" layout="col" gap="12">
            <Box id="l3-handler" label="Handler" />
            <Box id="l3-validator" label="Validator" />

            <Frame id="l4" name="Unit" pad="12" layout="row" gap="10">
              <Box id="l4-parser" label="Parser" />
              <Box id="l4-normalizer" label="Normalizer" />
              <Box id="l4-serializer" label="Serializer" />
            </Frame>
          </Frame>
        </Frame>
      </Frame>

      <Edge id="e-gateway-router" from="l1-gateway" to="l2-router" />
      <Edge id="e-router-handler" from="l2-router" to="l3-handler" />
      <Edge id="e-handler-parser" from="l3-handler" to="l4-parser" />
      <Edge id="e-parser-normalizer" from="l4-parser" to="l4-normalizer" />
      <Edge id="e-normalizer-serializer" from="l4-normalizer" to="l4-serializer" />
      <Edge id="e-serializer-gateway" from="l4-serializer" to="l1-gateway" />
      <Edge id="e-validator-config" from="l3-validator" to="l1-config" />
      <Edge id="e-metrics-config" from="l2-metrics" to="l1-config" />
    </Doc>
  );
}
