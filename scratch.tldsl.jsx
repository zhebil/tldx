import { Doc, Frame, Box, Edge, Note, flow } from "tldsl";

export default function Diagram() {
  return (
    <Doc direction="RIGHT">
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
          <Box id="p-orders-repo" label="OrdersRepo" />
          <Box id="p-users-repo" label="UsersRepo" />
          <Box id="p-sessions" label="SessionStore" />
          <Box id="p-hasher" label="PasswordHasher" />
          <Box id="p-payments" label="Payments" />
          <Box id="p-notifications" label="Notifications" />
          <Box id="p-clock" label="Clock" />
        </Frame>
        <Frame id="driven-adapters" name="Driven adapters" pad="16" layout="col" gap="12">
          <Box id="postgres" label="Postgres" />
          <Box id="redis" label="Redis" />
          <Box id="argon2" label="Argon2" />
          <Box id="stripe" label="Stripe" />
          <Box id="ses" label="AWS SES" />
          <Box id="system-clock" label="SystemClock" />
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
      <Edge id="hx-16" from="p-orders-repo" to="postgres" />
      <Edge id="hx-17" from="p-users-repo" to="postgres" />
      <Edge id="hx-18" from="p-sessions" to="redis" />
      <Edge id="hx-19" from="p-hasher" to="argon2" />
      <Edge id="hx-20" from="p-payments" to="stripe" />
      <Edge id="hx-21" from="p-notifications" to="ses" />
      <Edge id="hx-22" from="p-clock" to="system-clock" />

      <Frame id="auth-flow" name="Auth flow (login)" pad="20" layout="col" gap="12">
        <Box id="a1" label="1. Browser  POST /login {email, pwd}" />
        <Box id="a2" label="2. HTTP API  parse + validate" />
        <Box id="a3" label="3. CreateSession use case" />
        <Box id="a4" label="4. UsersRepo.findByEmail" />
        <Box id="a5" label="5. Postgres  SELECT users" />
        <Box id="a6" label="6. PasswordHasher.verify(pwd, hash)" />
        <Box id="a7" label="7. domain: rules (active? locked?)" />
        <Box id="a8" label="8. SessionStore.create(userId)" />
        <Box id="a9" label="9. Redis  SETEX session:{id} TTL=24h" />
        <Box id="a10" label="10. HTTP API  Set-Cookie sid=...; HttpOnly" />
        <Box id="a-fail" label="X. 401 + audit log on bad password" />
      </Frame>

      {flow("a1", "a2", "a3", "a4", "a5")}
      <Edge id="ae-5" from="a3" to="a6" />
      {flow("a6", "a7", "a8", "a9")}
      <Edge id="ae-9" from="a3" to="a10" />
      <Edge id="ae-fail" from="a6" to="a-fail" />

      <Note id="na-1">
        Idempotency: re-POSTing /login with the same creds is fine - SessionStore.create is
        non-idempotent by design (each call mints a new session id).
      </Note>
      <Edge id="ae-na-1" from="na-1" to="a8" />

      <Frame id="pay-flow" name="Payment flow (checkout)" pad="20" layout="col" gap="12">
        <Box id="p1" label="1. Browser  POST /checkout {cart}" />
        <Box id="p2" label="2. HTTP API  authn (cookie  session)" />
        <Box id="p3" label="3. PlaceOrder use case" />
        <Box id="p4" label="4. domain: price + tax + stock check" />
        <Box id="p5" label="5. OrdersRepo.create(status=pending)" />
        <Box id="p6" label="6. Postgres  INSERT orders" />
        <Box id="p7" label="7. Payments.charge(orderId, amount)" />
        <Box id="p8" label="8. Stripe  PaymentIntent (idempotency key)" />
        <Box id="p9" label="9. Response  202 {orderId, clientSecret}" />
        <Box id="p10" label="10. (later) Stripe webhook  POST /webhooks/stripe" />
        <Box id="p11" label="11. verify signature, parse event" />
        <Box id="p12" label="12. MarkPaid use case" />
        <Box id="p13" label="13. OrdersRepo.update(status=paid)" />
        <Box id="p14" label="14. Notifications.send(receipt)" />
        <Box id="p15" label="15. SES  email user" />
        <Box id="p-fail" label="X. charge failed  OrdersRepo.update(status=failed) + retry policy" />
      </Frame>

      {flow("p1", "p2", "p3", "p4", "p5", "p6")}
      <Edge id="pe-6" from="p3" to="p7" />
      <Edge id="pe-7" from="p7" to="p8" />
      <Edge id="pe-8" from="p3" to="p9" />
      {flow("p10", "p11", "p12", "p13", "p14", "p15")}
      <Edge id="pe-fail" from="p7" to="p-fail" />

      <Note id="np-1">
        Two-phase: synchronous up to PaymentIntent (steps 1-9), then async finalisation via
        webhook (steps 10-15). Order rows live in Postgres throughout.
      </Note>
      <Edge id="pe-np-1" from="np-1" to="p10" />
    </Doc>
  );
}
