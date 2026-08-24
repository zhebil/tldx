# Agent Instructions

## Before writing code

Read `docs/architecture.md` — layers, the pipeline, and the dependency rules.
Those rules are lint-enforced, so violations fail `npm run check` rather than
review. `docs/reference.md` is the component/prop reference; consult it on
demand rather than up front.

## Build & run

```bash
npm run check                  # tsc + oxfmt --check + oxlint + knip + vitest
npm run format                 # oxfmt, in place - run this before `check` complains
npm run build                  # dist/cli (tsc) + dist/viewer (vite)
npm run dev:cli -- <args>      # run the CLI from source, e.g. `-- serve examples/kernel.tldx.jsx`
npm run diagrams               # re-render docs/diagrams/*.tldx.jsx to the SVGs docs/ embeds
```

The docs diagrams are source plus a committed SVG. `npm run check` only proves
the source still compiles - if you change one, run `npm run diagrams` and commit
the SVG alongside it, or the picture in `docs/architecture.md` goes stale.

`layers.svg` and `round-trip.svg` currently carry arrow bends that were set on
the canvas and have no JSX spelling ([#30]), so the source alone does not
reproduce them. `npm run diagrams` picks them up only because it reuses a
running `serve`, which applies the overlay ([#38]) - run it with no server up
and those two SVGs get visibly worse. Check the diff before committing a
re-render.

[#30]: https://github.com/zhebil/tldx/issues/30
[#38]: https://github.com/zhebil/tldx/issues/38

Shared entities live in `docs/diagrams/lib/vocabulary.jsx`, not in each diagram.
Recolouring a layer means editing `LAYER` there once; adding a box that already
exists elsewhere means importing it, not copying its props.

Each tool owns one question and nothing else, so they never disagree: `tsc`
types, `oxfmt` formatting, `oxlint` per-file rules _and_ the layer boundaries
(`.oxlintrc.json`), `knip` unused files/exports/dependencies (`knip.json`).

`lint` runs `--type-aware`, which is what makes `no-floating-promises`,
`await-thenable`, `unbound-method` and the rest of the typed rules do anything
at all - without it they load and silently pass. It needs `oxlint-tsgolint`
(a devDependency) and costs ~100ms.

## Tests

Write the smallest test that pins the behaviour, at the right layer:

- pure logic → co-located unit test in `domain/`
- orchestration → integration test in `app/` against the fakes
- real adapter behaviour → the port's `.contract.ts` suite
- end to end → a fixture under `tests/e2e/`

Fakes live next to their port and are canonical — the contract suite runs
against the fake and the real adapter both, so a fake that drifts fails.

## Conventions

`CONTRIBUTING.md` has the human-facing version of the commit and PR rules; it
and this file must not disagree.

- Never `git add .` / `git add -A`; stage hunks, one concern per commit.
- Don't commit before the user has reviewed the diff, unless asked.
- Opening a PR means filling in `.github/pull_request_template.md`, not writing
  a body from scratch: same headings, same order, and tick the checklist for
  real. Read it first - `gh pr create --body-file` bypasses it silently.
- Reports, baselines and scratch notes do not belong in `docs/`. Write them to
  a temp dir.
- Debug PNGs go to a temp dir, never the repo.

## Releasing

`main` is protected; land changes through a PR. To ship a version:

```bash
npm version patch          # bumps package.json and tags v<x.y.z>
# bump plugin/.claude-plugin/plugin.json to match, then push both
git push origin main --follow-tags
gh release create v<x.y.z> --generate-notes
```

Publishing to npm is the `Publish Package` workflow, triggered by the GitHub
release. It authenticates over OIDC (npm trusted publishing), so there is no
token in the repo and nothing to rotate. The workflow refuses to publish if the
tag and `package.json` disagree.
