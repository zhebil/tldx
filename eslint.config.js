import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

// Third-party modules that belong to exactly one adapter. Listed once and
// reused by the CLI override below, which repeats the patterns but not the
// node: builtin bans.
const ADAPTER_ONLY_PATTERNS = [
  { group: ["chokidar"], message: "Only allowed under infra/fs/." },
  { group: ["elkjs", "elkjs/*"], message: "Only allowed under infra/layout-elk/." },
  { group: ["esbuild", "esbuild/*"], message: "Only allowed under infra/execute-jsx/." },
  { group: ["@tldraw/*", "tldraw"], message: "Only allowed under viewer/." },
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver(), createNodeResolver()],
    },
    rules: {
      // Ban node built-ins everywhere by default; allow them only where below.
      "no-restricted-imports": ["error", {
        paths: [
          { name: "node:fs", message: "Use FsReadPort. Real impl lives in infra/fs/." },
          { name: "node:fs/promises", message: "Use FsReadPort. Real impl lives in infra/fs/." },
          { name: "node:child_process", message: "Wrap in a port under infra/." },
          { name: "node:http", message: "Only allowed under infra/devserver/." },
        ],
        patterns: ADAPTER_ONLY_PATTERNS,
      }],

      // Layer rules (file-path zones).
      "import-x/no-restricted-paths": ["error", {
        zones: [
          // domain/** is pure: only domain itself + contracts/ allowed.
          { target: "./src/domain", from: "./src/infra", message: "Domain depends on ports, not adapters." },
          { target: "./src/domain", from: "./src/app", message: "Domain does not depend on app." },
          { target: "./src/domain", from: "./src/cli", message: "Domain does not depend on cli." },
          { target: "./src/domain", from: "./src/viewer", message: "Domain does not depend on viewer." },

          // app/** depends on domain + contracts + app/ports only.
          { target: "./src/app", from: "./src/infra", message: "App depends on ports, not adapters. Wire adapters in cli/." },
          { target: "./src/app", from: "./src/cli", message: "App does not depend on cli." },
          { target: "./src/app", from: "./src/viewer", message: "App does not depend on viewer." },

          // infra/** never imports cli, viewer, or app/!(ports).
          { target: "./src/infra", from: "./src/cli", message: "Infra is below cli." },
          { target: "./src/infra", from: "./src/viewer", message: "Infra is below viewer." },
          // Allow infra → app/ports/** only; block infra → app/!(ports).
          // `except` paths are resolved relative to `from` and treated as
          // directory prefixes (not globs), so use the bare directory name.
          { target: "./src/infra", from: "./src/app",
            except: ["ports"],
            message: "Infra may only import from app/ports/, not from other parts of app/." },

          // viewer/** is its own world. Only contracts/ is allowed.
          { target: "./src/viewer", from: "./src/cli", message: "Viewer is a separate bundle." },
          { target: "./src/viewer", from: "./src/app", message: "Viewer is a separate bundle." },
          { target: "./src/viewer", from: "./src/domain", message: "Viewer is a separate bundle." },
          { target: "./src/viewer", from: "./src/infra", message: "Viewer is a separate bundle." },

          // contracts/** imports nothing from inside the project.
          { target: "./src/contracts", from: "./src/cli", message: "contracts/ has no dependencies." },
          { target: "./src/contracts", from: "./src/app", message: "contracts/ has no dependencies." },
          { target: "./src/contracts", from: "./src/domain", message: "contracts/ has no dependencies." },
          { target: "./src/contracts", from: "./src/infra", message: "contracts/ has no dependencies." },
          { target: "./src/contracts", from: "./src/viewer", message: "contracts/ has no dependencies." },

          // runtime/** is the JSX authoring surface, bundled and run inside a
          // worker alongside user code. It never sees infra/app/cli/viewer.
          { target: "./src/runtime", from: "./src/infra", message: "Runtime is bundled and executed standalone; it does not depend on infra." },
          { target: "./src/runtime", from: "./src/app", message: "Runtime is bundled and executed standalone; it does not depend on app." },
          { target: "./src/runtime", from: "./src/cli", message: "Runtime is bundled and executed standalone; it does not depend on cli." },
          { target: "./src/runtime", from: "./src/viewer", message: "Runtime is bundled and executed standalone; it does not depend on viewer." },

          // runtime/** is a leaf: nothing else depends on it.
          { target: "./src/domain", from: "./src/runtime", message: "runtime/ is a leaf - only its own worker imports it." },
          { target: "./src/app", from: "./src/runtime", message: "runtime/ is a leaf - only its own worker imports it." },
          { target: "./src/cli", from: "./src/runtime", message: "runtime/ is a leaf - only its own worker imports it." },
          { target: "./src/contracts", from: "./src/runtime", message: "runtime/ is a leaf - only its own worker imports it." },
          { target: "./src/viewer", from: "./src/runtime", message: "runtime/ is a leaf - only its own worker imports it." },
        ],
      }],

      "import-x/no-cycle": ["error", { maxDepth: 10 }],
    },
  },

  // Adapters get to import the modules they wrap.
  {
    files: [
      "src/infra/fs/**",
      "src/infra/git/**",
      "src/infra/layout-elk/**",
      "src/infra/execute-jsx/**",
      "src/infra/transport/**",
      "src/infra/devserver/**",
      "src/infra/log/**",
      "src/infra/open-browser/**",
      "src/infra/render/**",
      "src/infra/serve-registry/**",
      // Viewer is its own bundle; tldraw is allowed there.
      "src/viewer/**",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // CLI is the wiring site; allowed node basics, but third-party adapter libs stay locked down.
  {
    files: ["src/cli/**"],
    rules: { "no-restricted-imports": ["error", { patterns: ADAPTER_ONLY_PATTERNS }] },
  },
);
