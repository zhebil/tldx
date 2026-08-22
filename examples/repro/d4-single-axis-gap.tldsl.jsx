// D4. A ladder wants wide columns and tight rows. `gap` used to be one number
// for both axes on layout="grid", so a 300px column gap became a 300px row gap
// and ten rows rendered 7,193px tall. Fixed in T48: `rowGap` / `colGap` each
// override `gap` on their own axis. Delete the `rowGap` below to see the defect.
import { Doc, Grid, Box, Edge } from "tldsl";

const STEPS = ["syn", "synack", "ack"];

export default function SingleAxisGap() {
  return (
    <Doc>
      <Grid id="ladder" cols="2" gap="300" rowGap="16">
        {STEPS.flatMap((s) => [
          <Box id={`c-${s}`} label="Client" />,
          <Box id={`s-${s}`} label="Server" />,
        ])}
      </Grid>
      {STEPS.map((s) => <Edge from={`c-${s}`} to={`s-${s}`} label={s} />)}
    </Doc>
  );
}
