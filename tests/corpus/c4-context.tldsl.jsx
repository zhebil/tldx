import { Doc, Edge } from "tldsl";
import { Person, System, Container, Boundary } from "./lib/c4.jsx";

export default function Diagram() {
  return (
    <Doc id="c4-context" layout="col" gap="64">
      <Person id="customer" name="Customer" description="places orders online" />

      <Boundary id="ecommerce" name="E-commerce Platform" layout="row">
        <Container id="web-app" name="Web Application" technology="React" />
        <Container id="api" name="API Service" technology="Node.js" />
        <Container id="database" name="Order Database" technology="PostgreSQL" />
      </Boundary>

      <System
        id="payment-gateway"
        name="Payment Gateway"
        description="processes card payments"
        external
      />

      <Edge id="e-customer-web" from="customer" to="web-app" label="browses, orders" color="violet" />
      <Edge id="e-web-api" from="web-app" to="api" label="calls" color="light-blue" />
      <Edge id="e-api-db" from="api" to="database" label="reads" color="light-blue" />
      <Edge id="e-api-payment" from="api" to="payment-gateway" label="charges card" color="grey" />
    </Doc>
  );
}
