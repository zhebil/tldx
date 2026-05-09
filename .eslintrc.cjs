module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  settings: {
    "import/resolver": { typescript: true, node: true },
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
      patterns: [
        { group: ["chokidar"], message: "Only allowed under infra/fs/." },
        { group: ["elkjs", "elkjs/*"], message: "Only allowed under infra/layout-elk/." },
        { group: ["@tldraw/*", "tldraw"], message: "Only allowed under viewer/." },
      ],
    }],

    // Layer rules (file-path zones).
    "import/no-restricted-paths": ["error", {
      zones: [
        // domain/** is pure: only domain itself + contracts/ allowed.
        { target: "./src/domain", from: "./src/infra",  message: "Domain depends on ports, not adapters." },
        { target: "./src/domain", from: "./src/app",    message: "Domain does not depend on app." },
        { target: "./src/domain", from: "./src/cli",    message: "Domain does not depend on cli." },
        { target: "./src/domain", from: "./src/viewer", message: "Domain does not depend on viewer." },

        // app/** depends on domain + contracts + app/ports only.
        { target: "./src/app", from: "./src/infra",  message: "App depends on ports, not adapters. Wire adapters in cli/." },
        { target: "./src/app", from: "./src/cli",    message: "App does not depend on cli." },
        { target: "./src/app", from: "./src/viewer", message: "App does not depend on viewer." },

        // infra/** never imports cli, viewer, or app/!(ports).
        { target: "./src/infra", from: "./src/cli",    message: "Infra is below cli." },
        { target: "./src/infra", from: "./src/viewer", message: "Infra is below viewer." },
        // Allow infra → app/ports/** only; block infra → app/!(ports).
        // `except` paths are resolved relative to `from` and treated as
        // directory prefixes (not globs), so use the bare directory name.
        { target: "./src/infra", from: "./src/app",
          except: ["ports"],
          message: "Infra may only import from app/ports/, not from other parts of app/." },

        // viewer/** is its own world. Only contracts/ is allowed.
        { target: "./src/viewer", from: "./src/cli",    message: "Viewer is a separate bundle." },
        { target: "./src/viewer", from: "./src/app",    message: "Viewer is a separate bundle." },
        { target: "./src/viewer", from: "./src/domain", message: "Viewer is a separate bundle." },
        { target: "./src/viewer", from: "./src/infra",  message: "Viewer is a separate bundle." },

        // contracts/** imports nothing from inside the project.
        { target: "./src/contracts", from: "./src/cli",    message: "contracts/ has no dependencies." },
        { target: "./src/contracts", from: "./src/app",    message: "contracts/ has no dependencies." },
        { target: "./src/contracts", from: "./src/domain", message: "contracts/ has no dependencies." },
        { target: "./src/contracts", from: "./src/infra",  message: "contracts/ has no dependencies." },
        { target: "./src/contracts", from: "./src/viewer", message: "contracts/ has no dependencies." },
      ],
    }],

    "import/no-cycle": ["error", { maxDepth: 10 }],
  },
  overrides: [
    // Adapters get to import the modules they wrap.
    { files: ["src/infra/fs/**"],          rules: { "no-restricted-imports": "off" } },
    { files: ["src/infra/layout-elk/**"],  rules: { "no-restricted-imports": "off" } },
    { files: ["src/infra/transport/**"],   rules: { "no-restricted-imports": "off" } },
    { files: ["src/infra/devserver/**"],   rules: { "no-restricted-imports": "off" } },
    { files: ["src/infra/log/**"],         rules: { "no-restricted-imports": "off" } },

    // CLI is the wiring site; allowed node basics, but third-party adapter libs stay locked down.
    { files: ["src/cli/**"], rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["chokidar"],            message: "Only allowed under infra/fs/." },
          { group: ["elkjs", "elkjs/*"],    message: "Only allowed under infra/layout-elk/." },
          { group: ["@tldraw/*", "tldraw"], message: "Only allowed under viewer/." },
        ],
      }],
    }},

    // Viewer is its own bundle; tldraw is allowed there.
    { files: ["src/viewer/**"], rules: { "no-restricted-imports": "off" } },
  ],
};
