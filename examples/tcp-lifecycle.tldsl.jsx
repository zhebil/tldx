import { Doc, Group, Box, Edge, Note } from "tldsl";

// One entry per instant on the connection. `c` / `s` are the states the two
// peers hold once that entry's segment has been sent; `dir` is which way the
// segment travels.
const STEPS = [
  { id: "open", c: "CLOSED", s: "LISTEN", msg: "passive open", dir: null },
  { id: "syn", c: "SYN_SENT", s: "LISTEN", msg: "SYN seq=x", dir: "cs" },
  { id: "synack", c: "SYN_SENT", s: "SYN_RCVD", msg: "SYN-ACK seq=y ack=x+1", dir: "sc" },
  { id: "ack", c: "ESTABLISHED", s: "SYN_RCVD", msg: "ACK ack=y+1", dir: "cs" },
  { id: "data", c: "ESTABLISHED", s: "ESTABLISHED", msg: "data + ACK", dir: "cs" },
  { id: "fin1", c: "FIN_WAIT_1", s: "ESTABLISHED", msg: "FIN", dir: "cs" },
  { id: "ack1", c: "FIN_WAIT_2", s: "CLOSE_WAIT", msg: "ACK", dir: "sc" },
  { id: "fin2", c: "FIN_WAIT_2", s: "LAST_ACK", msg: "FIN", dir: "sc" },
  { id: "ack2", c: "TIME_WAIT", s: "CLOSED", msg: "ACK", dir: "cs" },
  { id: "done", c: "CLOSED", s: "CLOSED", msg: "2 MSL timeout", dir: null },
];

const tone = (s) =>
  s === "ESTABLISHED" ? "green" : s === "CLOSED" ? "grey" : "light-blue";

const Lane = ({ side, name, state }) => (
  <Group id={`${side}-lane`} layout="col" gap="28">
    <Box id={side} label={name} color="violet" font="sans" />
    {STEPS.map((step) => (
      <Box
        id={`${side}-${step.id}`}
        label={state(step)}
        color={tone(state(step))}
        font="mono"
        size="s"
      />
    ))}
  </Group>
);

// A lifeline: consecutive states on one peer joined by a headless dotted
// connector, so the column reads as one participant over time.
const lifeline = (side) =>
  STEPS.slice(1).map((step, i) => (
    <Edge
      from={`${side}-${STEPS[i].id}`}
      to={`${side}-${step.id}`}
      arrowheadStart="none"
      arrowheadEnd="none"
      dash="dotted"
      color="grey"
    />
  ));

export default function TcpLifecycle() {
  return (
    <Doc layout="col" gap="48">
      <Group id="ladder" layout="row" gap="260" align="start">
        <Lane side="client" name="Client" state={(s) => s.c} />
        <Lane side="server" name="Server" state={(s) => s.s} />
      </Group>

      {lifeline("client")}
      {lifeline("server")}

      {STEPS.filter((step) => step.dir).map((step) =>
        step.dir === "cs" ? (
          <Edge from={`client-${step.id}`} to={`server-${step.id}`} label={step.msg} font="sans" size="s" />
        ) : (
          <Edge from={`server-${step.id}`} to={`client-${step.id}`} label={step.msg} font="sans" size="s" />
        ),
      )}

      <Note on="client-ack2">TIME_WAIT holds for 2 MSL, so a late duplicate cannot reach a new connection.</Note>
    </Doc>
  );
}
