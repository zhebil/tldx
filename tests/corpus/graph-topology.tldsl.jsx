import { Doc, Graph, Box, Edge } from "tldsl";

export default function Diagram() {
  return (
    <Doc id="graph-topology" layout="col" gap="40">
      <Graph id="mesh" name="Service mesh" gap="64" pad="24" color="violet">
        <Box id="gateway" label="Gateway" color="violet" fill="semi" />
        <Box id="auth" label="Auth" color="blue" fill="semi" />
        <Box id="users" label="Users" color="blue" fill="semi" />
        <Box id="orders" label="Orders" color="blue" fill="semi" />
        <Box id="payments" label="Payments" color="green" fill="semi" />
        <Box id="inventory" label="Inventory" color="green" fill="semi" />
        <Box id="notifications" label="Notifications" color="orange" fill="semi" />
        <Box id="search" label="Search" color="orange" fill="semi" />

        <Edge id="e-gateway-auth" from="gateway" to="auth" />
        <Edge id="e-gateway-users" from="gateway" to="users" />
        <Edge id="e-gateway-orders" from="gateway" to="orders" />
        <Edge id="e-users-auth" from="users" to="auth" />
        <Edge id="e-orders-payments" from="orders" to="payments" />
        <Edge id="e-orders-inventory" from="orders" to="inventory" />
        <Edge id="e-orders-notifications" from="orders" to="notifications" />
        <Edge id="e-payments-notifications" from="payments" to="notifications" />
        <Edge id="e-inventory-notifications" from="inventory" to="notifications" />
        <Edge id="e-search-inventory" from="search" to="inventory" />
        <Edge id="e-search-users" from="search" to="users" />
      </Graph>
    </Doc>
  );
}
