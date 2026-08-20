import { Doc, Box, flow } from "tldsl";

const steps = [
  "Request received",
  "Auth token validated",
  "Rate limit checked",
  "Request body parsed",
  "Schema validated",
  "Idempotency key checked",
  "Business rule applied",
  "Inventory reserved",
  "Order row inserted",
  "Payment charged",
  "Order confirmed",
  "Receipt generated",
  "Notification queued",
  "Response returned",
];

const ids = steps.map((_, i) => `s${i + 1}`);

export default function Diagram() {
  return (
    <Doc id="sequence">
      {steps.map((label, i) => (
        <Box id={ids[i]} label={`${i + 1}. ${label}`} />
      ))}
      {flow(...ids)}
    </Doc>
  );
}
