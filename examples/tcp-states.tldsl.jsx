import { Doc, Graph, Box, Edge, Edges, Sticky } from "tldsl";

// RFC 793 figure 6, as a graph: eleven states, twenty transitions, each
// labelled `event / action` - the event that fires it and the segment it puts
// on the wire ("-" for none).
const STATES = [
  { id: "closed", label: "CLOSED", tone: "grey" },
  { id: "listen", label: "LISTEN", tone: "light-blue" },
  { id: "syn_sent", label: "SYN_SENT", tone: "light-blue" },
  { id: "syn_rcvd", label: "SYN_RCVD", tone: "light-blue" },
  { id: "established", label: "ESTABLISHED", tone: "green" },
  { id: "fin_wait_1", label: "FIN_WAIT_1", tone: "orange" },
  { id: "fin_wait_2", label: "FIN_WAIT_2", tone: "orange" },
  { id: "closing", label: "CLOSING", tone: "orange" },
  { id: "time_wait", label: "TIME_WAIT", tone: "light-red" },
  { id: "close_wait", label: "CLOSE_WAIT", tone: "violet" },
  { id: "last_ack", label: "LAST_ACK", tone: "violet" },
];

export default function TcpStates() {
  return (
    <Doc layout="col" gap="48">
      <Graph id="machine" direction="DOWN" gap="120">
        {STATES.map((s) => (
          <Box id={s.id} label={s.label} color={s.tone} font="mono" size="s" />
        ))}
      </Graph>

      {/* Opening: every transition on the way from CLOSED to ESTABLISHED,
          none of it touching the closing half of the machine. */}
      <Edges color="blue" font="sans" size="s">{`
        closed -> listen: passive open / -
        closed -> syn_sent: active open / SYN
        listen -> closed: close / -
        listen -> syn_rcvd: recv SYN / SYN+ACK
        syn_sent -> closed: close or timeout / -
        syn_sent -> syn_rcvd: recv SYN / SYN+ACK
        syn_sent -> established: recv SYN+ACK / ACK
        syn_rcvd -> established: recv ACK / -
      `}</Edges>

      {/* Two transitions that don't fit either story cleanly: the escape
          hatch into closing, and the self-loop while data still flows. */}
      <Edge from="syn_rcvd" to="fin_wait_1" label="close / FIN" color="red" font="sans" size="s" />
      <Edge from="established" to="established" label="recv data / ACK" color="blue" font="sans" size="s" />

      {/* Closing: active close (FIN_WAIT_*, CLOSING, TIME_WAIT) and passive
          close (CLOSE_WAIT, LAST_ACK) both converge back on CLOSED. */}
      <Edges color="red" font="sans" size="s">{`
        established -> fin_wait_1: close / FIN
        established -> close_wait: recv FIN / ACK
        fin_wait_1 -> fin_wait_2: recv ACK / -
        fin_wait_1 -> closing: recv FIN / ACK
        fin_wait_1 -> time_wait: recv FIN+ACK / ACK
        fin_wait_2 -> time_wait: recv FIN / ACK
        closing -> time_wait: recv ACK / -
        close_wait -> last_ack: close / FIN
        last_ack -> closed: recv ACK / -
        time_wait -> closed: 2 MSL timeout / -
      `}</Edges>

      <Sticky on="time_wait">2 MSL is the only timed transition.</Sticky>
    </Doc>
  );
}
