import { Doc, Layers, Frame, Box, Edge } from "tldx";

export default function Diagram() {
  return (
    <Doc id="layers-stack" layout="col" gap="40">
      <Layers id="stack" name="Deployment tiers" gap="48" pad="24" color="grey">
        <Frame id="client-tier" gap="24" pad="16">
          <Box id="client-web" label="Web client" color="grey" fill="semi" />
          <Box id="client-mobile" label="Mobile client" color="grey" fill="semi" />
        </Frame>
        <Frame id="service-tier" name="Service tier" gap="24" pad="16" color="blue">
          <Box id="svc-api" label="API gateway" color="blue" fill="semi" />
          <Box id="svc-auth" label="Auth service" color="blue" fill="semi" />
          <Box id="svc-billing" label="Billing service" color="blue" fill="semi" />
        </Frame>
        <Frame id="data-tier" name="Data tier" gap="24" pad="16" color="green">
          <Box id="data-redis" label="Redis" color="green" fill="semi" />
          <Box id="data-postgres" label="Postgres" color="green" fill="semi" />
        </Frame>
      </Layers>

      <Edge id="e-web-api" from="client-web" to="svc-api" color="grey" />
      <Edge id="e-mobile-api" from="client-mobile" to="svc-api" color="grey" />
      <Edge id="e-api-postgres" from="svc-api" to="data-postgres" color="blue" />
      <Edge id="e-auth-postgres" from="svc-auth" to="data-postgres" color="blue" />
      <Edge id="e-billing-redis" from="svc-billing" to="data-redis" color="blue" />
    </Doc>
  );
}
