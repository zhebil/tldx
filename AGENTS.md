# Agent Instructions

## Before writing code

Read `docs/architecture.md` — layers, the pipeline, and the dependency rules.
Those rules are lint-enforced, so violations fail `npm run check` rather than
review. `docs/reference.md` is the component/prop reference; consult it on
demand rather than up front.

## Build & run

```bash
npm run check                  # typecheck + lint + dep-lint + vitest
npm run build                  # dist/cli (tsc) + dist/viewer (vite)
npm run dev:cli -- <args>      # run the CLI from source, e.g. `-- serve examples/kernel.tldx.jsx`
```

## Tests

Write the smallest test that pins the behaviour, at the right layer:

- pure logic → co-located unit test in `domain/`
- orchestration → integration test in `app/` against the fakes
- real adapter behaviour → the port's `.contract.ts` suite
- end to end → a fixture under `tests/e2e/`

Fakes live next to their port and are canonical — the contract suite runs
against the fake and the real adapter both, so a fake that drifts fails.

## Conventions

- Never `git add .` / `git add -A`; stage hunks, one concern per commit.
- Don't commit before the user has reviewed the diff, unless asked.
- Reports, baselines and scratch notes do not belong in `docs/`. Write them to
  a temp dir.
- Debug PNGs go to a temp dir, never the repo.
