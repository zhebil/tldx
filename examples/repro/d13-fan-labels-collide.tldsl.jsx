import { Doc, Frame, Box, Edge } from "tldsl";

// D13. Four edges spanning the same gap between two rows. Each label is
// stamped at its own arrow's midpoint with no awareness of the other labels,
// so all four land in one 33px band and three of them overlap in a chain:
// "publish OrderPlaced" x:[33,210], "subscribe" x:[174.3,263.2] and
// "publish PaymentCaptured" x:[223.2,446.2]. The gaps here are ordinary - one
// edge that crosses to a non-adjacent target is enough to do it.
export default function D13() {
  return (
    <Doc layout="col" gap="120">
      <Frame id="pub" name="Publishers" layout="row" gap="48">
        <Box id="orders" label="orders-svc" />
        <Box id="payments" label="payments-svc" />
        <Box id="notify" label="notify-svc" />
      </Frame>
      <Frame id="sub" name="Subscribers" layout="row" gap="48">
        <Box id="orders-q" label="orders-q" />
        <Box id="payments-q" label="payments-q" />
        <Box id="notify-q" label="notify-q" />
      </Frame>
      <Edge from="orders" to="orders-q" label="publish OrderPlaced" font="sans" size="s" />
      <Edge from="orders" to="payments-q" label="subscribe" font="sans" size="s" />
      <Edge from="payments" to="payments-q" label="publish PaymentCaptured" font="sans" size="s" />
      <Edge from="notify" to="notify-q" label="subscribe" font="sans" size="s" />
    </Doc>
  );
}
