import { Doc, Frame, Box, Edge, Note, flow } from "tldsl";

export default function Diagram() {
  return (
    <Doc layout="col" gap="160">
      <Frame id="ingress" name="Ingress" layout="row" gap="40" pad="20">
        <Box id="client" label="Client" />
        <Box id="gateway" label="API gateway" />
        <Box id="auth" label="Auth service" />
      </Frame>

      <Frame id="backend" name="Backend" layout="row" gap="40" pad="20">
        <Box id="orders" label="Orders service" />
        <Box id="payments" label="Payments service" />
        <Box id="db" label="Orders DB" />
      </Frame>

      {flow("client", "gateway", "auth")}
      <Edge id="e-gateway-orders" from="gateway" to="orders" />
      <Edge id="e-orders-payments" from="orders" to="payments" />
      <Edge id="e-orders-db" from="orders" to="db" />

      <Note on="auth">Only the gateway terminates TLS.</Note>
      <Note on="backend">Backend services scale independently of ingress.</Note>
      <Note on="e-gateway-orders">Retries are idempotent here.</Note>
    </Doc>
  );
}
