import { Doc, Frame, Box, Edge } from "tldx";

const drivenPorts = [
  { id: "p-orders-repo", label: "OrdersRepo" },
  { id: "p-users-repo", label: "UsersRepo" },
  { id: "p-sessions", label: "SessionStore" },
  { id: "p-hasher", label: "PasswordHasher" },
  { id: "p-payments", label: "Payments" },
  { id: "p-notifications", label: "Notifications" },
  { id: "p-clock", label: "Clock" },
];

const drivenAdapters = [
  { id: "postgres", label: "Postgres" },
  { id: "redis", label: "Redis" },
  { id: "argon2", label: "Argon2" },
  { id: "stripe", label: "Stripe" },
  { id: "ses", label: "AWS SES" },
  { id: "system-clock", label: "SystemClock" },
];

const boundaryEdges = [
  ["p-orders-repo", "postgres"],
  ["p-users-repo", "postgres"],
  ["p-sessions", "redis"],
  ["p-hasher", "argon2"],
  ["p-payments", "stripe"],
  ["p-notifications", "ses"],
  ["p-clock", "system-clock"],
];

export default function Diagram() {
  return (
    <Doc id="hexagonal">
      <Frame id="hex" name="Hexagonal (ports and adapters)" pad="24" layout="row" gap="48">
        <Frame id="driving-adapters" name="Driving adapters" pad="16" layout="col" gap="12">
          <Box id="http" label="HTTP API" />
          <Box id="cli" label="CLI" />
          <Box id="tests" label="Tests" />
        </Frame>
        <Frame id="driving-ports" name="Driving ports" pad="16" layout="col" gap="12">
          <Box id="p-create-order" label="CreateOrder" />
          <Box id="p-list-orders" label="ListOrders" />
          <Box id="p-create-session" label="CreateSession" />
        </Frame>
        <Frame id="core" name="Domain core" pad="16" layout="col" gap="12">
          <Box id="usecases" label="Use cases" />
          <Box id="domain" label="Entities + rules" />
        </Frame>
        <Frame id="driven-ports" name="Driven ports" pad="16" layout="col" gap="12">
          {drivenPorts.map((p) => (
            <Box id={p.id} label={p.label} />
          ))}
        </Frame>
        <Frame id="driven-adapters" name="Driven adapters" pad="16" layout="col" gap="12">
          {drivenAdapters.map((a) => (
            <Box id={a.id} label={a.label} />
          ))}
        </Frame>
      </Frame>

      <Edge id="hx-1" from="http" to="p-create-order" />
      <Edge id="hx-2" from="cli" to="p-create-order" />
      <Edge id="hx-3" from="tests" to="p-list-orders" />
      <Edge id="hx-4" from="http" to="p-create-session" />
      <Edge id="hx-5" from="p-create-order" to="usecases" />
      <Edge id="hx-6" from="p-list-orders" to="usecases" />
      <Edge id="hx-7" from="p-create-session" to="usecases" />
      <Edge id="hx-8" from="usecases" to="domain" />
      <Edge id="hx-9" from="usecases" to="p-orders-repo" />
      <Edge id="hx-10" from="usecases" to="p-users-repo" />
      <Edge id="hx-11" from="usecases" to="p-sessions" />
      <Edge id="hx-12" from="usecases" to="p-hasher" />
      <Edge id="hx-13" from="usecases" to="p-payments" />
      <Edge id="hx-14" from="usecases" to="p-notifications" />
      <Edge id="hx-15" from="usecases" to="p-clock" />
      {boundaryEdges.map(([from, to], i) => (
        <Edge id={`hx-${16 + i}`} from={from} to={to} />
      ))}
    </Doc>
  );
}
