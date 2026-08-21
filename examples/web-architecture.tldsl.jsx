import { Doc, Frame, Group, Box, Edge, Note } from "tldsl";

// The everyday three-tier web stack: a browser at the top, a CDN and load
// balancer at the edge, three interchangeable app servers, a cache and a
// primary/replica database pair, object storage, and a queue-fed worker.
// The payment gateway is somebody else's - it sits outside the boundary.

export default function WebArchitecture() {
  return (
    <Doc layout="col" gap="80">
      <Group id="clients" layout="row" gap="160">
        <Box id="browser" label="Browser" color="grey" />
        <Box id="payments" label="Payments API" color="light-red" dash="dashed" />
      </Group>

      <Frame id="system" name="acme.com production" layout="col" gap="64">
        <Frame id="edge" name="Edge" layout="row" gap="96">
          <Box id="cdn" label="CDN" color="light-blue" />
          <Box id="lb" label="Load balancer" color="light-blue" />
        </Frame>

        <Frame id="app-tier" name="App tier" layout="row" gap="48">
          <Box id="app-1" label="app-1" />
          <Box id="app-2" label="app-2" />
          <Box id="app-3" label="app-3" />
        </Frame>

        <Frame id="data" name="Data" layout="row" gap="80">
          <Box id="cache" label="Redis" geo="ellipse" color="red" />
          <Box id="db-primary" label="Postgres primary" geo="ellipse" color="blue" />
          <Box id="db-replica" label="Postgres replica" geo="ellipse" color="light-blue" />
          <Box id="objects" label="Object storage" geo="cloud" color="violet" />
        </Frame>

        <Frame id="async" name="Async" layout="row" gap="96">
          <Box id="queue" label="Job queue" color="yellow" />
          <Box id="worker" label="Background worker" color="orange" />
        </Frame>
      </Frame>

      <Edge from="browser" to="cdn" label="GET /" font="sans" size="s" />
      <Edge from="cdn" to="lb" label="cache miss" font="sans" size="s" />
      <Edge from="cdn" to="objects" label="origin pull" font="sans" size="s" dash="dashed" />

      <Edge from="lb" to="app-1" />
      <Edge from="lb" to="app-2" />
      <Edge from="lb" to="app-3" />

      <Edge from="app-tier" to="cache" label="sessions" font="sans" size="s" />
      <Edge from="app-tier" to="db-primary" label="writes" font="sans" size="s" />
      <Edge from="app-tier" to="db-replica" label="reads" font="sans" size="s" />
      <Edge from="app-tier" to="queue" label="enqueue" font="sans" size="s" />

      <Edge from="db-primary" to="db-replica" label="streaming replication" dash="dashed" color="blue" font="sans" size="s" />

      <Edge from="queue" to="worker" label="dequeue" font="sans" size="s" />
      <Edge from="worker" to="db-primary" label="job status" font="sans" size="s" />
      <Edge from="worker" to="objects" label="upload" font="sans" size="s" />
      <Edge from="worker" to="payments" label="charge" color="red" dash="dashed" font="sans" size="s" />

      <Note on="worker">One worker spans three tiers: queue, data, and the external gateway.</Note>
    </Doc>
  );
}
