import { Doc, Frame, Box, Edge, Note } from "tldsl";

// An event-driven order pipeline. Seven services talk only through the bus:
// four core services that both publish and subscribe, three derived consumers
// that only read, and a dead-letter topic with a redrive path back to the bus.
// The checkout saga runs orders -> payments -> shipping and compensates
// backwards through the same topics it went forward on.

export default function EventDriven() {
  return (
    <Doc layout="col" gap="80">
      <Frame id="core" name="Core services" layout="row" gap="56">
        <Box id="orders" label="Order service" color="blue" />
        <Box id="payments" label="Payment service" color="violet" />
        <Box id="inventory" label="Inventory service" color="green" />
        <Box id="shipping" label="Shipping service" color="orange" />
      </Frame>

      <Frame id="bus" name="Kafka" layout="row" gap="48">
        <Box id="t-orders" label="orders.v1" color="yellow" fill="semi" />
        <Box id="t-payments" label="payments.v1" color="yellow" fill="semi" />
        <Box id="t-inventory" label="inventory.v1" color="yellow" fill="semi" />
        <Box id="t-shipments" label="shipments.v1" color="yellow" fill="semi" />
      </Frame>

      <Frame id="derived" name="Derived consumers" layout="row" gap="72">
        <Box id="notifications" label="Notification service" color="light-blue" />
        <Box id="analytics" label="Analytics sink" geo="cloud" color="light-violet" />
        <Box id="audit" label="Audit log" geo="ellipse" color="grey" />
      </Frame>

      <Frame id="dead-letter" name="Dead letter" layout="row" gap="96">
        <Box id="dlq" label="payments.v1.dlq" color="light-red" fill="semi" />
        <Box id="dlq-monitor" label="DLQ monitor" color="red" />
      </Frame>

      <Edge from="orders" to="t-orders" label="publish OrderPlaced" font="sans" size="s" />
      <Edge from="payments" to="t-payments" label="publish PaymentCaptured" font="sans" size="s" />
      <Edge from="inventory" to="t-inventory" label="publish StockReserved" font="sans" size="s" />
      <Edge from="shipping" to="t-shipments" label="publish ShipmentBooked" font="sans" size="s" />

      <Edge from="t-orders" to="payments" label="subscribe" dash="dashed" font="sans" size="s" />
      <Edge from="t-orders" to="inventory" label="subscribe" dash="dashed" font="sans" size="s" />
      <Edge from="t-payments" to="shipping" label="subscribe" dash="dashed" font="sans" size="s" />
      <Edge from="t-inventory" to="orders" label="subscribe" dash="dashed" font="sans" size="s" />

      <Edge from="t-orders" to="notifications" dash="dashed" />
      <Edge from="t-shipments" to="notifications" dash="dashed" />
      <Edge from="bus" to="analytics" label="all topics" dash="dashed" font="sans" size="s" />
      <Edge from="bus" to="audit" label="all topics" dash="dashed" font="sans" size="s" />

      <Edge from="t-payments" to="dlq" label="3 failed retries" color="red" font="sans" size="s" />
      <Edge from="dlq" to="dlq-monitor" label="alert" color="red" font="sans" size="s" />
      <Edge from="dlq" to="t-payments" label="redrive" color="red" dash="dotted" font="sans" size="s" />

      <Edge from="shipping" to="t-orders" label="ShipmentFailed" color="light-red" dash="dashed" font="sans" size="s" />
      <Edge from="payments" to="t-orders" label="PaymentRefunded" color="light-red" dash="dashed" font="sans" size="s" />

      <Note on="t-orders">Checkout saga: orders, payments and shipping compensate back through orders.v1.</Note>
    </Doc>
  );
}
