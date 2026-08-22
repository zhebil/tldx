import { Doc, Group, Box, Edge } from "tldsl";

// Same machine, no coordinates: semantic grouping only.
// The nesting mirrors how the protocol actually reads - an opening path,
// then the close splitting into an active and a passive branch.
const S = (id, label, color) => (
  <Box id={id} label={label} color={color} w="180" h="60" font="mono" size="s" />
);

const TRANSITIONS = [
  ["closed", "listen", "passive open"],
  ["closed", "syn_sent", "active open / SYN"],
  ["listen", "syn_rcvd", "recv SYN / SYN,ACK"],
  ["listen", "closed", "close"],
  ["listen", "syn_sent", "send SYN"],
  ["syn_sent", "syn_rcvd", "recv SYN / SYN,ACK"],
  ["syn_sent", "established", "recv SYN,ACK / ACK"],
  ["syn_sent", "closed", "close / timeout"],
  ["syn_rcvd", "established", "recv ACK"],
  ["syn_rcvd", "fin_wait_1", "close / FIN"],
  ["established", "fin_wait_1", "close / FIN"],
  ["established", "close_wait", "recv FIN / ACK"],
  ["fin_wait_1", "fin_wait_2", "recv ACK"],
  ["fin_wait_1", "closing", "recv FIN / ACK"],
  ["fin_wait_1", "time_wait", "recv FIN,ACK / ACK"],
  ["fin_wait_2", "time_wait", "recv FIN / ACK"],
  ["closing", "time_wait", "recv ACK"],
  ["close_wait", "last_ack", "close / FIN"],
  ["last_ack", "closed", "recv ACK"],
  ["time_wait", "closed", "2MSL timeout"],
];

const CLOSING = new Set(["fin_wait_1", "fin_wait_2", "closing", "time_wait", "close_wait", "last_ack"]);

export default function TcpGroups() {
  return (
    <Doc layout="col" gap="120">
      <Group id="opening" layout="col" gap="90">
        {S("closed", "CLOSED", "red")}
        <Group id="handshake" layout="row" gap="260">
          {S("syn_sent", "SYN_SENT", "light-blue")}
          {S("listen", "LISTEN", "light-blue")}
        </Group>
        {S("syn_rcvd", "SYN_RCVD", "light-blue")}
        {S("established", "ESTABLISHED", "green")}
      </Group>

      <Group id="teardown" layout="row" gap="300">
        <Group id="active-close" layout="col" gap="90">
          {S("fin_wait_1", "FIN_WAIT_1", "orange")}
          <Group id="fin-branch" layout="row" gap="120">
            {S("fin_wait_2", "FIN_WAIT_2", "orange")}
            {S("closing", "CLOSING", "orange")}
          </Group>
          {S("time_wait", "TIME_WAIT", "yellow")}
        </Group>

        <Group id="passive-close" layout="col" gap="90">
          {S("close_wait", "CLOSE_WAIT", "violet")}
          {S("last_ack", "LAST_ACK", "violet")}
        </Group>
      </Group>

      {TRANSITIONS.map(([from, to, label]) => (
        <Edge
          from={from}
          to={to}
          label={label}
          color={CLOSING.has(from) || CLOSING.has(to) ? "red" : "blue"}
          font="sans"
          size="s"
        />
      ))}
    </Doc>
  );
}
