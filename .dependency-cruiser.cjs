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
      name: "elkjs-only-in-layout-elk",
      severity: "error",
      comment: "elkjs is the real layout adapter's library; only infra/layout-elk/ may import it.",
      from: { path: "^src/(?!infra/layout-elk/)" },
      to:   { path: "^elkjs($|/)" },
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
