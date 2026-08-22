import { Frame, Box, Edge } from "tldsl";

export const SAVE_TO_DB = "Save to DB\nTrigger side effects";
export const YDOC = "Shared state:\nY.js doc\nPresence";
export const CLIENTS = [1, 2, 3];

export const EditorServer = ({ ns }) => (
  <Frame id={`${ns}-srv`} name="Editor Server" layout="col" pad="28">
    <Box id={`${ns}-db`} label={SAVE_TO_DB} color="blue" />
  </Frame>
);

export const Translation = ({ ns }) => (
  <Frame id={`${ns}-trans`} name="Collaboration (Translation)" layout="col" pad="28">
    <Box id={`${ns}-cmp`} label={"Comparison and\nevents translation"} color="violet" />
  </Frame>
);

export const Provider = ({ ns, label }) => (
  <Frame id={`${ns}-prov`} name="Collaboration provider (Partykit)" layout="col" pad="28">
    <Box id={`${ns}-pstate`} label={label} color="orange" />
  </Frame>
);

export const ClientEditor = ({ ns, state }) => (
  <Frame id={`${ns}-client`} name="Client" layout="row" gap="110" pad="24">
    <Box id={`${ns}-user`} label="User" color="grey" />
    <Box id={`${ns}-shared`} label={state} color="green" />
  </Frame>
);

export const clientEdges = (ns) => [
  <Edge from={`${ns}-user`} to={`${ns}-shared`} label="Update events" />,
  <Edge from={`${ns}-shared`} to={`${ns}-user`} label="Current state" />,
];
