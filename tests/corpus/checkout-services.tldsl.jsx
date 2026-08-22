import { Doc, Frame, Box, Edge, Sticky } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="checkout-services" layout="col" gap="64">
      <Frame id="edge" name="Edge" layout="row" gap="152" pad="20" color="grey">
        <Box id="browser" label="Browser" color="grey" fill="semi" />
        <Box id="cdn" label="CDN" color="grey" fill="semi" />
        <Box id="gateway" label="API gateway" color="blue" fill="semi" />
      </Frame>

      <Frame id="core" name="Core services" layout="row" gap="152" pad="20" color="blue">
        <Box id="checkout" label="Checkout" color="blue" fill="semi" />
        <Box id="catalog" label="Catalog" color="blue" fill="semi" />
        <Box id="pricing" label="Pricing" color="blue" fill="semi" />
      </Frame>

      <Frame id="data" name="Data" layout="row" gap="40" pad="20" color="green">
        <Box id="postgres" label="Postgres" color="green" fill="semi" />
        <Box id="redis" label="Redis" color="green" fill="semi" />
        <Box id="kafka" label="Kafka" color="green" fill="semi" />
      </Frame>

      <Frame id="payments" name="Payments" layout="row" gap="40" pad="20" color="violet">
        <Box id="payment" label="Payment service" color="violet" fill="semi" />
        <Box id="ledger" label="Ledger" color="violet" fill="semi" />
      </Frame>

      <Edge id="e-browser-cdn" from="browser" to="cdn" label="assets" color="grey" />
      <Edge id="e-cdn-gateway" from="cdn" to="gateway" label="/api" color="grey" />

      <Edge id="e-gateway-checkout" from="gateway" to="checkout" label="POST" color="blue" />
      <Edge id="e-checkout-catalog" from="checkout" to="catalog" label="lookup" color="blue" />
      <Edge id="e-catalog-pricing" from="catalog" to="pricing" label="quote" color="blue" />

      <Edge id="e-checkout-payment" from="checkout" to="payment" color="violet" />
      <Edge id="e-payment-ledger" from="payment" to="ledger" label="posts" color="violet" />

      <Edge id="e-checkout-postgres" from="checkout" to="postgres" label="orders" color="green" />
      <Edge id="e-pricing-redis" from="pricing" to="redis" label="cache" color="green" />
      <Edge id="e-payment-kafka" from="payment" to="kafka" label="events" color="green" />

      <Sticky id="n-idempotency" on="ledger" color="yellow">
        Authorization is keyed by checkout id, so a retry never charges twice.
      </Sticky>
    </Doc>
  );
}
