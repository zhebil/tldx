import { Doc, Frame, Box, Edge } from "tldsl";

// D23 (B5), trimmed from event-driven.tldsl.jsx down to the one edge that
// exposed it. `t-payments -> dlq` is a vertical-axis skip whose endpoints'
// x-extents overlap "notifications" (a box directly between them, so
// computeCandidate's own `crossed` set finds it and sizes a side's clearance
// band from it) but not "t-orders" (which sits beside `t-payments` in the
// same row - its y-centre is never *between* the endpoints, so `crossed`
// never sees it). t-orders' right edge still sits *inside* the band
// `notifications` already established, though, which the old `gap()`
// heuristic only ever treated as a limiter for a shape sitting entirely
// *outside* that band. The analytic pass picks a side as if t-orders weren't
// there; the real arc, still ramping up its bow near `t-payments`, clips it
// anyway. All the sibling boxes stay, even the ones this edge doesn't touch
// - they're what give "notifications" and "t-orders" their real widths and
// positions; trimming them changes the exact geometry enough that the
// obstacle stops mattering.
//
// arrow-truth (before B5's `clearObstaclesOnEveryRoute`): 1 arrow path
// crossing a non-endpoint shape (t-payments -> dlq crosses t-orders). After:
// 0 - the correction pass re-tests the *actual* rendered arc against every
// shape, not just the ones `crossed`/`gap` found, and moves the edge off the
// side that clips t-orders.
export default function D23() {
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

      <Edge from="t-payments" to="dlq" label="3 failed retries" color="red" font="sans" size="s" />
    </Doc>
  );
}
