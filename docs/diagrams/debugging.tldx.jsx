import { Doc, Frame, Group, Box, Edge, Edges } from "tldx";

// The README's diagram. It is a joke, but every part of it is doing a job: the
// blame list is a .map() over a data table, `log -> log` is a self-edge, and
// the whole thing is a real cycle rather than a flowchart that stops.

const BLAME = ["the cache", "node_modules", "the compiler", "the rubber duck"];

const slug = (name) => `blame-${name.replace(/[^a-z]+/gi, "-")}`;

export default function DebuggingLoop() {
  return (
    <Doc title="The debugging loop" layout="row" gap="200" align="start">
      <Group id="spine" layout="col" gap="72">
        <Box id="yesterday" maxW="240" color="light-green" label="it worked yesterday" />
        <Box id="run" maxW="200" label="run it" />
        <Box id="works" maxW="200" geo="diamond" color="yellow" label="does it work?" />
        <Box id="why" maxW="220" geo="diamond" color="orange" label="why does it work?" />
        <Box id="ship" maxW="260" color="green" label={"don't touch anything.\nship it"} />
      </Group>

      {/* Hand-placed: the loop reads better with the console.log level with the
          question it answers, and the blame list parked off to the right. */}
      <Box id="log" x="362" y="404" maxW="240" color="light-blue" label="add a console.log" />

      <Frame id="blame" x="796" y="234" name="things you blame" layout="col" gap="24">
        {BLAME.map((name) => (
          <Box id={slug(name)} maxW="220" color="grey" label={name} />
        ))}
      </Frame>

      <Edges>{`
        yesterday -> run -> works
        works -> why: yes
        why -> ship: nobody knows
      `}</Edges>

      <Edge from="works" to="log" fromSide="right" toSide="left" label="no" />
      <Edge from="log" to="log" label="again" size="s" />
      <Edge from="log" to="blame" fromSide="right" toSide="left" label="still broken" size="s" />
      <Edge from="blame" to="run" fromSide="left" toSide="right" label="try again" size="s" />
      <Edge
        from="ship"
        to="yesterday"
        fromSide="left"
        toSide="left"
        color="green"
        label="the next morning"
      />
    </Doc>
  );
}
