import { Frame, Group, Box, Edge, Sticky, flow } from "tldsl";
import { SAVE_TO_DB, YDOC, CLIENTS, EditorServer, Translation, Provider, ClientEditor, clientEdges } from "./shared.jsx";

export const Phase1 = () => (
  <Frame id="phase1" name="Phase 1 (non collaborative)" layout="col" pad="56">
    <Frame id="p1" name="Phase 1 - Collaborative editing (new flow, not yet collaborative)" layout="row" gap="150" align="center">
      <ClientEditor ns="p1" state={"Shared state:\nY.js doc"} />
      <Translation ns="p1" />
      <EditorServer ns="p1" />
    </Frame>
<Edge from="p1-shared" to="p1-cmp" label="Doc changed" />
<Edge from="p1-cmp" to="p1-db" label="Atomic update events" color="blue" />
<Sticky on="p1-trans">No backend changes required - the document is not collaborative at this point.</Sticky>
  </Frame>
);

export const Phase2 = () => (
  <Frame id="phase2" name="Phase 2 (collaborative)" layout="col" pad="56">
    <Frame id="p2" name="Phase 2 - Collaboration flow" layout="row" gap="240" align="center">
      <Frame id="p2-client" name="Client" layout="col" pad="28">
        <Box id="p2-user" label="User" color="grey" h="420" />
      </Frame>
      <Frame id="p2-room" name="Partykit Room" layout="col" gap="70" pad="28">
        <Box id="p2-onload" label="onLoad" color="light-blue" />
        <Box id="p2-yjs" label="Y.js" color="green" />
        <Box id="p2-clean" label="Document cleaned up" color="light-red" />
      </Frame>
      <Frame id="p2-docs" name="Documents Service" layout="col" pad="28">
        <Box id="p2-svc" label={"Documents\nService"} color="blue" h="420" />
      </Frame>
    </Frame>
<Edge from="p2-user" to="p2-onload" label="Connect room" color="light-blue" />
<Edge from="p2-svc" to="p2-onload" label="Fetch document" color="light-blue" />
<Edge from="p2-onload" to="p2-yjs" label="Init Y.js document" color="light-blue" />
<Edge from="p2-yjs" to="p2-user" label="Collaborative editing" color="green" arrowheadStart="arrow" />
<Edge from="p2-yjs" to="p2-svc" label="Sync into DB" color="green" />
<Edge from="p2-yjs" to="p2-clean" label="All users left" color="red" />
<Sticky on="p2-room">Blue = init, green = editing, red = cleanup.</Sticky>
  </Frame>
);
