import { Frame, Group, Box, Edge, Note, flow } from "tldsl";
import { SAVE_TO_DB, YDOC, CLIENTS, EditorServer, Translation, Provider, ClientEditor, clientEdges } from "./shared.jsx";

export const CollabBoard = () => (
  <Group id="board" layout="row" gap="110" align="start">
    <Frame id="ex" name="Existing flow" layout="row" gap="260" align="center">
      <Group id="ex-clients" layout="col" gap="40">
        {CLIENTS.map((i) => (
          <Frame id={`ex-c${i}`} name="Client" layout="col" pad="28">
            <Box id={`ex-u${i}`} label="User" color="grey" />
          </Frame>
        ))}
      </Group>
      <EditorServer ns="ex" />
    </Frame>
    <Group id="board-mid" layout="col" gap="90" align="start">
      <Frame id="nf" name="Collaborative editing (New flow)" layout="row" gap="180" align="center">
        <Group id="nf-clients" layout="col" gap="44">
          {CLIENTS.map((i) => (
            <ClientEditor ns={`nf${i}`} state={YDOC} />
          ))}
        </Group>
        <Provider ns="nf" label={YDOC} />
        <Translation ns="nf" />
        <EditorServer ns="nf" />
      </Frame>
      <Frame id="pv" name={'"Preview" flow'} layout="row" gap="200" align="center">
        <Frame id="pv-client" name="Client" layout="col" pad="28">
          <Box id="pv-user" label="Client" color="grey" h="380" />
        </Frame>
        <Frame id="pv-srv" name="Editor Server" layout="col" gap="70" pad="28">
          <Box id="pv-sync" label="Data Sync Flow" color="blue" />
          <Box id="pv-getdb" label="Get data from DB" color="blue" />
          <Box id="pv-update" label={"Update document -\nadd comment in text content"} color="blue" />
        </Frame>
        <Frame id="pv-prov" name="Collaboration provider" layout="col" pad="28">
          <Box id="pv-yjs" label="Y.js doc" color="orange" h="300" />
        </Frame>
      </Frame>
      <Group id="board-sync" layout="row" gap="90" align="start">
        <Frame id="ds" name="Data Sync Flow" layout="row" gap="180" align="center">
          <Group id="ds-src" layout="col" gap="90">
            <Box id="ds-prov" label={"Collaboration provider\n(Partykit)"} color="orange" />
            <Box id="ds-client" label="Client" color="grey" />
          </Group>
          <Box id="ds-routine" label="Sync data routine" color="violet" />
          <Box id="ds-db" label="DB" geo="ellipse" color="blue" fill="semi" />
        </Frame>
        <Frame id="sr" name="Sync Data Routine" layout="row" gap="200" align="center">
          <Frame id="sr-collab" name="Collaboration (Y.js)" layout="col" pad="28">
            <Box id="sr-yjs" label="Y.js" color="green" w="200" h="520" />
          </Frame>
          <Frame id="sr-trans" name="Collaboration (Translation)" layout="col" gap="60" pad="28">
            <Box id="sr-event" label="Sync Event" geo="oval" color="grey" />
            <Box id="sr-validate" label="Validate data" color="violet" />
            <Box id="sr-valid" label="Valid?" geo="diamond" color="orange" />
            <Group id="sr-branch" layout="row" gap="110">
              <Box id="sr-rewrite" label={"Rewrite with\nlast valid doc"} color="red" />
              <Box id="sr-compare" label="Compare" color="green" />
            </Group>
            <Box id="sr-each" label={"For each\nchanged block"} geo="hexagon" color="violet" w="380" h="200" />
          </Frame>
          <Frame id="sr-srv" name="Editor server" layout="col" pad="28">
            <Box id="sr-save" label={"Save to DB,\nperform side effects"} color="blue" w="300" h="520" />
          </Frame>
        </Frame>
      </Group>
      <Frame id="t1" name="Translation service (Option 1) - collaboration owns the whole cycle" layout="row" gap="150" align="center">
        <Box id="t1-prov" label={"Collaboration provider\n(Partykit)"} color="orange" />
        <Frame id="t1-svc" name="Collaboration service" layout="col" pad="28">
          <Box
            id="t1-cycle"
            label={"Collaboration management cycle:\n1. Room initialisation\n2. Collaboration editing processing\n3. Webhooks processing\n4. Content comparison and events translation\n5. Collaboration cleanup"}
            color="violet"
            size="s"
            textAlign="start"
            maxW="400"
            h="240"
          />
        </Frame>
        <Frame id="t1-other" name="Other services" layout="col" pad="28">
          <Box id="t1-editor" label="Editor server" color="blue" h="240" />
        </Frame>
        <Box id="t1-db" label="DB" geo="ellipse" color="blue" fill="semi" />
      </Frame>
      <Frame id="t2" name="Translation service (Option 2) - Partykit owns the cycle" layout="row" gap="150" align="center">
        <Frame id="t2-room" name="Partykit Room" layout="row" gap="60" pad="28">
          <Box id="t2-yjs" label="Y.js" color="green" h="240" />
          <Box
            id="t2-cycle"
            label={"Collaboration management cycle:\n1. Collaboration editing processing\n2. Content comparison and events translation"}
            color="violet"
            size="s"
            textAlign="start"
            maxW="340"
            h="240"
          />
        </Frame>
        <Frame id="t2-other" name="Other services" layout="col" pad="28">
          <Box id="t2-editor" label="Editor server" color="blue" h="240" />
        </Frame>
        <Box id="t2-db" label="DB" geo="ellipse" color="blue" fill="semi" />
      </Frame>
    </Group>
    <Frame id="cv" name="Collaborative editing (Combined view - feature flag behaviour)" layout="row" gap="180" align="center">
      <Frame id="cv-client" name="Client" layout="row" gap="130" pad="28">
        <Box id="cv-user" label="User" color="grey" />
        <Group id="cv-branch" layout="col" gap="110">
          <Group id="cv-on" layout="row" gap="110">
            <Box id="cv-collab" label={"<CollaborativeEditorContentWrapper/>"} color="green" maxW="640" />
            <Box id="cv-shared" label={"Shared state:\nY.js doc\nPresence\nComments"} color="green" h="200" />
          </Group>
          <Box id="cv-plain" label={"<EditorContentWrapper/>"} color="red" maxW="460" />
        </Group>
      </Frame>
      <Frame id="cv-prov" name="Collaboration provider (Partykit)" layout="col" pad="28">
        <Box id="cv-pstate" label={"Shared state:\nY.js doc\nPresence\nComments"} color="orange" w="283" h="200" />
      </Frame>
      <Translation ns="cv" />
      <EditorServer ns="cv" />
    </Frame>
{CLIENTS.map((i) => (
  <Edge from={`ex-u${i}`} to="ex-db" label="Atomic update event" color="red" />
))}
<Note on="ex-db">Every keystroke-level event hits the server. That is the bottleneck.</Note>
{clientEdges("p1")}
{CLIENTS.map((i) => clientEdges(`nf${i}`))}
{CLIENTS.map((i) => (
  <Edge from={`nf${i}-shared`} to="nf-pstate" label="Sync" color="orange" arrowheadStart="arrow" />
))}
<Edge from="nf-pstate" to="nf-cmp" label="Content updated" color="violet" />
<Edge from="nf-cmp" to="nf-db" label="Atomic update events" color="blue" />
<Note on="nf-pstate">Custom throttling lives here - the server sees batches, not keystrokes.</Note>
<Edge from="cv-user" to="cv-collab" label="flag on" color="green" />
<Edge from="cv-user" to="cv-plain" label="flag off" color="red" />
<Edge from="cv-collab" to="cv-shared" label="Update events" />
<Edge from="cv-shared" to="cv-collab" label="Current state" />
<Edge from="cv-shared" to="cv-pstate" label="Sync" color="orange" arrowheadStart="arrow" />
<Edge from="cv-pstate" to="cv-cmp" label="Document updated" color="violet" />
<Edge from="cv-cmp" to="cv-db" label="Atomic update events" color="blue" />
<Edge from="cv-plain" to="cv-db" label="Atomic update events" color="red" />
<Edge from="pv-user" to="pv-sync" label="Request preview data" />
<Edge from="pv-sync" to="pv-yjs" label={'Fetch "fresh" data'} color="orange" />
<Edge from="pv-sync" to="pv-getdb" label="no room" color="red" dash="dotted" />
<Edge from="pv-getdb" to="pv-user" label="Return static data" color="red" />
<Edge from="pv-user" to="pv-update" label="Add comment" />
<Edge from="pv-update" to="pv-yjs" label="Send update" color="orange" arrowheadStart="arrow" />
<Edge from="pv-update" to="pv-user" label="Return updated data" color="green" />
<Note on="pv-yjs">Only when the room exists - i.e. collaboration is active.</Note>
<Edge from="ds-prov" to="ds-routine" label="ContentUpdated" color="orange" />
<Edge from="ds-client" to="ds-routine" label="Preview opened" color="grey" />
<Edge from="ds-routine" to="ds-db" label="Persist" color="blue" />
          <Edge from="ds-routine" to="sr" label="runs" color="violet" />
{flow("sr-event", "sr-validate", "sr-valid")}
<Edge from="sr-yjs" to="sr-validate" label="Get current state" color="green" />
<Edge from="sr-valid" to="sr-rewrite" label="No" color="red" />
<Edge from="sr-valid" to="sr-compare" label="Yes" color="green" />
<Edge from="sr-rewrite" to="sr-yjs" label="Send update" color="red" />
<Edge from="sr-save" to="sr-compare" label={"Get last\nsaved version"} color="blue" />
<Edge from="sr-compare" to="sr-each" />
<Edge from="sr-each" to="sr-save" label="Send atomic update" color="blue" />
<Edge from="t1-prov" to="t1-cycle" label={"Content\nupdated"} color="orange" dash="dotted" />
<Edge from="t1-cycle" to="t1-prov" label="Fetch data" color="orange" />
<Edge from="t1-editor" to="t1-cycle" label={"Get current\nstate from DB"} color="blue" />
<Edge from="t1-cycle" to="t1-editor" label={"Sent atomic\nupdates"} color="violet" />
<Edge from="t1-editor" to="t1-db" label="Save to DB" color="blue" arrowheadStart="arrow" />
<Edge from="t2-cycle" to="t2-editor" label={"Get current\ndocument state"} color="violet" />
<Edge from="t2-editor" to="t2-cycle" label={"Get current\nstate from DB"} color="blue" />
<Edge from="t2-cycle" to="t2-editor" label={"Sent atomic\nupdates"} color="violet" />
<Edge from="t2-editor" to="t2-db" label="Save to DB" color="blue" arrowheadStart="arrow" />
  </Group>
);
