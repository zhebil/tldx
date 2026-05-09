import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ViewerApp } from "./app.js";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("missing #root element in viewer html");
}

createRoot(container).render(
  <StrictMode>
    <ViewerApp />
  </StrictMode>,
);
