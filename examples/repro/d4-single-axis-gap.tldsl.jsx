// D4. A ladder wants wide columns and tight rows. `gap` is one number for both
// axes on layout="grid", and `rowGap` / `colGap` are rejected by
// ir/unknown-prop, so the 300px column gap becomes a 300px row gap too.
import { Doc, Grid, Box, Edge } from "tldsl";

const STEPS = ["syn", "synack", "ack"];

export default function SingleAxisGap() {
  return (
    <Doc>
      <Grid id="ladder" cols="2" gap="300">
        {STEPS.flatMap((s) => [
          <Box id={`c-${s}`} label="Client" />,
          <Box id={`s-${s}`} label="Server" />,
        ])}
      </Grid>
      {STEPS.map((s) => <Edge from={`c-${s}`} to={`s-${s}`} label={s} />)}
    </Doc>
  );
}
