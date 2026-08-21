import { Doc, Frame, Box, Edge, Note, flow } from "tldsl";

const REGIONS = [
  { ns: "use1", name: "us-east-1 (primary)" },
  { ns: "euw1", name: "eu-west-1" },
  { ns: "apse1", name: "ap-southeast-1" },
];

const TIERS = [
  { key: "api", label: "API pods" },
  { key: "worker", label: "Worker pool" },
  { key: "cache", label: "Redis cache" },
  { key: "db", label: "Postgres replica" },
];

// One component, three instances. `ns` keeps ids unique per region.
function Region({ ns, name }) {
  return (
    <Frame id={ns} name={name} layout="col" gap="14" pad="20">
      {TIERS.map((t) => (
        <Box id={`${ns}-${t.key}`} label={t.label} />
      ))}
      {flow(`${ns}-api`, `${ns}-worker`, `${ns}-db`)}
      <Edge id={`${ns}-api-to-cache`} from={`${ns}-api`} to={`${ns}-cache`} />
    </Frame>
  );
}

export default function Diagram() {
  return (
    <Doc id="demo" layout="col" gap="56">
      <Frame id="edge-tier" name="Edge tier" layout="row" gap="40" pad="20">
        <Box id="client" label="Browser" />
        <Box id="cdn" label="CDN (CloudFront)" />
        <Box id="gslb" label="Geo load balancer" />
      </Frame>

      <Frame id="regions" name="Regions" layout="row" gap="40" pad="20">
        {REGIONS.map((r) => (
          <Region ns={r.ns} name={r.name} />
        ))}
      </Frame>

      {flow("client", "cdn", "gslb")}
      {REGIONS.map((r) => (
        <Edge id={`gslb-${r.ns}`} from="gslb" to={`${r.ns}-api`} />
      ))}

      <Note id="n-failover">
        GSLB health-checks each region's API tier. On failure it drains that
        region and shifts traffic to us-east-1, which holds the primary
        Postgres; the other regions run read replicas.
      </Note>
    </Doc>
  );
}
