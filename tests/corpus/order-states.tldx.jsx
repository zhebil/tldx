import { Doc, Frame, Box, Edge, Text } from "tldx";

export default function Diagram() {
  return (
    <Doc id="order-states" layout="col" gap="56">
      <Frame
        id="states"
        name="Order state machine"
        layout="auto"
        direction="DOWN"
        gap="96"
        pad="24"
        color="violet"
      >
        <Box id="draft" label="Draft" color="grey" fill="semi" />
        <Box id="submitted" label="Submitted" color="blue" fill="semi" />
        <Box id="awaiting" label="Awaiting payment" color="orange" fill="semi" />
        <Box id="paid" label="Paid" color="green" fill="semi" />
        <Box id="packing" label="Packing" color="blue" fill="semi" />
        <Box id="shipped" label="Shipped" color="blue" fill="semi" />
        <Box id="delivered" label="Delivered" color="green" fill="solid" />
        <Box id="on-hold" label="On hold" color="orange" fill="semi" />
        <Box id="cancelled" label="Cancelled" color="red" fill="semi" />
        <Box id="refunded" label="Refunded" color="red" fill="semi" />

        <Edge id="s-draft-submitted" from="draft" to="submitted" label="submit" />
        <Edge id="s-submitted-awaiting" from="submitted" to="awaiting" label="invoice" />
        <Edge id="s-awaiting-paid" from="awaiting" to="paid" label="captured" color="green" />
        <Edge id="s-paid-packing" from="paid" to="packing" label="pick" />
        <Edge id="s-packing-shipped" from="packing" to="shipped" label="handover" />
        <Edge id="s-shipped-delivered" from="shipped" to="delivered" label="signed" color="green" />

        <Edge id="s-awaiting-hold" from="awaiting" to="on-hold" label="declined" color="orange" />
        <Edge id="s-hold-awaiting" from="on-hold" to="awaiting" label="retry" color="orange" />

        <Edge id="s-hold-cancelled" from="on-hold" to="cancelled" label="expired" color="red" />
        <Edge
          id="s-submitted-cancelled"
          from="submitted"
          to="cancelled"
          label="cancel"
          color="red"
        />
        <Edge id="s-paid-refunded" from="paid" to="refunded" label="refund" color="red" />
        <Edge
          id="s-refunded-draft"
          from="refunded"
          to="draft"
          label="reorder"
          color="grey"
          dash="dashed"
        />
      </Frame>

      <Text id="n-cycle" w="300">
        Two cycles: on hold returns to awaiting payment on a retried card, and a refunded order can
        be reordered back to draft.
      </Text>
    </Doc>
  );
}
