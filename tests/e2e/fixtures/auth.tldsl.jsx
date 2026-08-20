import { Doc, Frame, Box, Edge, Note } from "tldsl";

export default function Diagram() {
  return (
    <Doc>
      <Frame id="auth-flow" name="Auth flow">
        <Box id="user" label="User" />
        <Box id="login" label="Login form" />
        <Box id="auth" label="Auth service" />
        <Box id="tokens" label="Token store" />
        <Box id="app" label="App" />

        <Edge id="e-user-login" from="user" to="login" />
        <Edge id="e-login-auth" from="login" to="auth" />
        <Edge id="e-auth-tokens" from="auth" to="tokens" />
        <Edge id="e-tokens-app" from="tokens" to="app" />

        <Note id="n-design">Token store is the only writer of session tokens.</Note>
      </Frame>
    </Doc>
  );
}
