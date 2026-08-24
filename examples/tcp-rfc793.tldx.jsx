// RFC 793's TCP connection state diagram. CLOSED is drawn twice - once as
// the state a connection starts in, once as the state it ends in - because
// that's how the RFC itself draws it: an "(Start)" box at the top and a
// "(Go back to start)" box at the bottom, joined by nothing but the fact
// that they share a label. Ids stay distinct (`closed_start`/`closed_end`)
// so every edge can say unambiguously which CLOSED it means.
import { Doc, Frame, Group, Box, Text, Edge, Edges } from "tldx";

const S = (id, label, color, fill = "solid") => (
  <Box id={id} label={label} color={color} fill={fill} w="170" h="60" font="sans" size="s" />
);

export default function TcpRfc793() {
  return (
    <Doc id="tcp-rfc793" layout="col" gap="100" align="center" pad="24">
      <Group id="legend" layout="col" gap="4" align="start">
        <Text id="legend-1" color="black" font="sans" size="s">
          dotted = unusual event
        </Text>
        <Text id="legend-2" color="red" font="sans" size="s">
          red = client/receiver path
        </Text>
        <Text id="legend-3" color="blue" font="sans" size="s">
          blue = server/sender path
        </Text>
      </Group>

      <Group id="start-band" layout="row" gap="16" align="center">
        <Text id="n-start" color="black" font="sans" size="s">
          (Start)
        </Text>
        {S("closed_start", "CLOSED", "orange")}
      </Group>

      {S("listen", "LISTEN", "yellow")}

      <Group id="syn-band" layout="row" gap="560">
        {S("syn_received", "SYN RECEIVED", "grey")}
        {S("syn_sent", "SYN SENT", "grey")}
      </Group>

      <Group id="established-band" layout="col" gap="8" align="center">
        <Text id="n-data" color="black" font="sans" size="s">
          Data exchange occurs
        </Text>
        {S("established", "ESTABLISHED", "green")}
      </Group>

      <Group id="close-band" layout="row" gap="80" align="start">
        <Frame id="active-close" name="Active Close" layout="grid" cols="2" gap="110" pad="24">
          {S("fin_wait_1", "FIN WAIT 1", "yellow")}
          {S("closing", "CLOSING", "yellow")}
          {S("fin_wait_2", "FIN WAIT 2", "yellow")}
          {S("time_wait", "TIME WAIT", "yellow")}
        </Frame>

        <Frame id="passive-close" name="Passive Close" layout="col" gap="90" pad="24">
          {S("close_wait", "CLOSE WAIT", "yellow")}
          {S("last_ack", "LAST ACK", "yellow")}
        </Frame>
      </Group>

      <Group id="end-band" layout="row" gap="16" align="center">
        {S("closed_end", "CLOSED", "orange")}
        <Text id="n-end" color="black" font="sans" size="s">
          (Go back to start)
        </Text>
      </Group>

      <Edge
        from="closed_start"
        to="listen"
        label="LISTEN/-"
        color="blue"
        font="sans"
        size="s"
        fromSide="bottom-left"
        toSide="top-left"
      />

      <Edges color="blue" font="sans" size="s">{`
        listen -> syn_received: SYN/SYN+ACK
        syn_received -> established: ACK/-
        established -> close_wait: FIN/ACK
        close_wait -> last_ack: CLOSE/FIN
        last_ack -> closed_end: ACK/-
      `}</Edges>

      <Edges color="red" font="sans" size="s">{`
        closed_start -> syn_sent: CONNECT/SYN
        syn_sent -> established: SYN+ACK/ACK
        established -> fin_wait_1: CLOSE/FIN
        fin_wait_1 -> fin_wait_2: ACK/-
        fin_wait_2 -> time_wait: FIN/ACK
      `}</Edges>

      <Edge
        from="listen"
        to="closed_start"
        label="CLOSE/-"
        color="black"
        font="sans"
        size="s"
        fromSide="top-right"
        toSide="bottom-right"
      />

      <Edges color="black" font="sans" size="s">{`
        syn_sent -> closed_start: CLOSE/-
        time_wait -> closed_end: Timeout
      `}</Edges>

      <Edges color="black" dash="dotted" font="sans" size="s">{`
        syn_received -> listen: RST/-
        listen -> syn_sent: SEND/SYN
        syn_sent -> syn_received: SYN/SYN+ACK
        syn_received -> fin_wait_1: CLOSE/FIN
        fin_wait_1 -> closing: FIN/ACK
        fin_wait_1 -> time_wait: FIN+ACK/ACK
        closing -> time_wait: ACK/-
      `}</Edges>
    </Doc>
  );
}
