import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite config for the viewer bundle. Root is src/viewer/ so index.html
// resolves there; output goes to dist/viewer/ for the dev server to serve.
export default defineConfig({
  root: resolve(__dirname, "src/viewer"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/viewer"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
