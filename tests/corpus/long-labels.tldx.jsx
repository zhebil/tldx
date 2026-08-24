import { Doc, Box, Edge, Text } from "tldx";

export default function Diagram() {
  return (
    <Doc id="long-labels">
      <Box
        id="gateway"
        label="The API gateway receives every inbound request and forwards it to the correct internal service."
      />
      <Box
        id="auth"
        label="The authentication service checks the bearer token and rejects the request if it has expired."
      />
      <Box
        id="rate-limiter"
        label="The rate limiter tracks request counts per client and returns a 429 once the quota is exceeded."
      />
      <Box
        id="router"
        label="The router inspects the request path and dispatches it to the handler registered for that route."
      />
      <Box
        id="orders"
        label="The order service validates the cart contents and calculates tax before creating a pending order."
      />
      <Box
        id="inventory"
        label="The inventory service reserves stock for each line item and releases the hold if payment fails."
      />
      <Box
        id="payments"
        label="The payment service charges the customer's card through the processor and records the outcome."
      />
      <Box
        id="notifier"
        label="The notification service sends a confirmation email once the order has been successfully placed."
      />
      <Box
        id="audit"
        label="The audit log service records every state transition so support staff can reconstruct what happened."
      />
      <Box
        id="reporting"
        label="The reporting service aggregates completed orders nightly and publishes a summary to the dashboard."
      />

      <Edge id="e-gateway-auth" from="gateway" to="auth" />
      <Edge id="e-gateway-rate-limiter" from="gateway" to="rate-limiter" />
      <Edge id="e-auth-router" from="auth" to="router" />
      <Edge id="e-router-orders" from="router" to="orders" />
      <Edge id="e-orders-inventory" from="orders" to="inventory" />
      <Edge id="e-orders-payments" from="orders" to="payments" />
      <Edge id="e-payments-notifier" from="payments" to="notifier" />
      <Edge id="e-orders-audit" from="orders" to="audit" />

      <Text id="note-reporting" maxW="480">
        Reporting reads from the audit log rather than the live order table so that nightly
        aggregation never competes with request traffic for locks. The dashboard is therefore always
        at least one day behind the live state.
      </Text>
      <Text id="note-payments" maxW="480">
        Payment charges are idempotent per order id. A retried charge for the same order returns the
        original result instead of charging the card twice, which matters because the payment
        service itself has no retry budget of its own.
      </Text>
    </Doc>
  );
}
