# Contributing

Bug reports, diagrams that lay out badly, and PRs are all welcome. A layout bug
is most useful as a `.tldx.jsx` file plus a sentence about what you expected -
that reproduces in one command and usually becomes the fixture for the fix.

## Setup

```bash
npm ci
npm run check                                    # typecheck + lint + dep-lint + tests
npm run dev:cli -- serve examples/kernel.tldx.jsx # run the CLI from source, no build
```

Node 20 or newer. `tldx render` also needs Playwright, which is kept out of the
default install because it pulls a browser binary:

```bash
npm i -g playwright && npx playwright install chromium
```

## Before you write code

Read [`docs/architecture.md`](docs/architecture.md) - the pipeline, the layers,
and which layer may import which. Those import rules are enforced by
`.eslintrc.cjs` and `.dependency-cruiser.cjs`, so a violation fails
`npm run check` rather than review. The one that catches people out:
`domain/` may not import from `infra/` or `app/`.

[`docs/reference.md`](docs/reference.md) is the component and prop reference.
Look things up in it as needed rather than reading it front to back.

## Tests

Write the smallest test that pins the behaviour, at the layer that owns it:

| what changed | where the test goes |
| --- | --- |
| pure logic | co-located unit test in `domain/` |
| orchestration | integration test in `app/`, against the fakes |
| real adapter behaviour | the port's `.contract.ts` suite |
| end to end | a fixture under `tests/e2e/` |

Every port in `app/ports/` has a colocated `.fake.ts`. The contract suite runs
against the fake and the real adapter both, so a fake that drifts from its
adapter fails the build - if you change one, change the other.

## Commits

`<scope>: <imperative summary>`, lowercase scope, no trailing period, 72
characters or fewer. Look at `git log --oneline` for the shape of it.

One concern per commit, even when that means staging part of a file. Please
don't `git add .` - a commit that mixes a refactor with a fix is a commit
nobody can revert cleanly.

## Pull requests

`main` is protected: everything lands through a PR, and CI has to be green.
Reviews aren't required in number, but open conversations block the merge, so
resolve them or answer them.

Run `npm run check` before you push. It is the same command CI runs, so a
failure there is a failure you could have seen locally in a few seconds.

Keep the PR to one topic. A dependency bump, a refactor and a feature are three
PRs; splitting them costs you a few minutes and saves the reviewer an hour.

Fill in the PR template rather than replacing it. The web UI loads it for you;
`gh pr create --body-file` does not, so pass
`.github/pull_request_template.md` and edit that.

## Dependencies

Adding one is a decision, not a detail - say in the PR what it buys that the
standard library and the existing dependencies don't. Dependabot handles
routine bumps on its own; grouped PRs carry minor and patch updates, and majors
arrive individually because they need a real look.

## Licence

Contributions are MIT, same as the project. Note that the viewer bundles the
tldraw SDK, which is separately licensed - see [NOTICE](NOTICE) before you do
anything that changes how tldraw is distributed.
