# Lint config (greenfield, error mode)

This is the mechanical enforcement of the dependency rules in `CONTEXT.md`. Greenfield mode: errors from day 1, no allowlist.

> **Status:** these configs are *designed to* fail CI from day 1. They take effect once `tldsl-iuk` (bootstrap toolchain) lands the actual `.eslintrc.cjs` / `.dependency-cruiser.cjs` / `package.json` in the repo. No production code should be merged before that.

The two enforcement tools:

- **`eslint-plugin-import`** for module-name and path-zone rules (catches most violations).
- **`dependency-cruiser`** for the "domain must be pure" guarantee (catches `node:*` imports anywhere under `src/domain/**`, including transitive dependencies on infra modules) and the "contracts has no deps" rule.

## Install

```bash
npm install --save-dev \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-import dependency-cruiser \
  vitest
```

## `.eslintrc.cjs`

```js
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
        // (Expressed via two zones - eslint-plugin-import does not support negation.)
        { target: "./src/infra", from: "./src/app",
          except: ["./src/app/ports/**"],
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
```

> **Note on `import/no-restricted-paths` and `except`:** the `except` field is supported in recent versions of `eslint-plugin-import`. If a version does not support it, the equivalent is two zones - one allowing `infra → app/ports`, one banning `infra → app/!(ports)` - but `dependency-cruiser` expresses this more cleanly (see below).

## `.dependency-cruiser.cjs`

Catches what eslint cannot, and acts as a backstop for the rules above.

```js
module.exports = {
  forbidden: [
    {
      name: "domain-must-be-pure",
      severity: "error",
      comment: "src/domain/** must not transitively depend on node built-ins, infra adapters, app, cli, or viewer.",
      from: { path: "^src/domain" },
      to:   { path: "^(node:|src/infra|src/app|src/cli|src/viewer)" },
    },
    {
      name: "infra-only-touches-ports-of-app",
      severity: "error",
      comment: "infra/** may import app/ports/** but nothing else from app/.",
      from: { path: "^src/infra" },
      to:   { path: "^src/app/(?!ports/).*" },
    },
    {
      name: "contracts-has-no-deps",
      severity: "error",
      comment: "src/contracts/** is the shared wire surface and depends on nothing inside the project.",
      from: { path: "^src/contracts" },
      to:   { path: "^src/(cli|app|domain|infra|viewer)" },
    },
    {
      name: "viewer-only-imports-contracts",
      severity: "error",
      comment: "src/viewer/** may only import from src/contracts/.",
      from: { path: "^src/viewer" },
      to:   { path: "^src/(cli|app|domain|infra)" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
  },
};
```

## `package.json` scripts

```json
{
  "scripts": {
    "lint": "eslint --max-warnings=0 src",
    "lint:deps": "depcruise --config .dependency-cruiser.cjs src",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint && npm run lint:deps && npm run test"
  }
}
```

`--max-warnings=0` means a warn-only rule still fails CI - matters if a future migration ever shifts a rule to warn.

## Pitfalls to watch for

- **`import type` backdoor.** `import type { Stats } from 'node:fs'` may slip past `no-restricted-imports` depending on plugin version. Confirm with a deliberate test import; if it slips, lift the rule into `dependency-cruiser`.
- **Re-export laundering.** A shallow `barrel.ts` that re-exports `Database` from `node:fs` lets downstream import `node:fs` indirectly. Keep barrels minimal, prefer importing from leaves.
- **Tests bypass.** Co-located `*.test.ts` files must follow the same rules as the code they test. Do **not** add `*.test.ts` to the `overrides` allowlist - the canonical fakes live next to ports for exactly this reason.
- **Fakes in the wrong layer.** A fake under `src/infra/<port>/fake.ts` would be imported by `src/app/**/*.test.ts`, violating `app → infra`. Fakes belong next to their port (`src/app/ports/<port>.fake.ts`, `src/domain/ports/<port>.fake.ts`).
