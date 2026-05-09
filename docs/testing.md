# Testing

## Philosophy

Pyramid, weighted toward the domain. The compiler core (`parser → ir → layout → emit`) is pure - it should be the cheapest, fastest, densest place to test. Integration tests cover use cases with fakes; a small e2e tier covers the real CLI against real ELK and real fs. Visual tests of the viewer are deliberately absent for MVP - the contract that matters is the scene message on the transport, and that's unit-testable.

The point of this structure is that **`npm test` should run in seconds**, give a regression signal under refactor, and not depend on a real browser.

## Test types

| Type | What it tests | Where it lives | Speed | Doubles |
|---|---|---|---|---|
| **Unit** | Pure functions in `domain/`. `parse(src)`, `lower(ast)`, `layout(ir, port)`, `emit(ir)`. Snapshot IR + scene JSON. | `src/domain/**/*.test.ts` (co-located) | Instant | Stub for the layout port; nothing else. |
| **Integration** | Use cases in `app/` wired to fakes for every port. "Edit triggers recompile and pushes scene" runs against `InMemoryFs + FakeWatch + InMemoryTransport`. | `src/app/**/*.test.ts` (co-located) | Fast | Fakes only. |
| **Contract** | Each adapter in `infra/` against the same scenarios its fake satisfies. Catches fake drift. | `src/infra/**/*.test.ts` (co-located) | Real I/O - slower | Real adapter under test; controlled environment (temp dir, real ELK). |
| **E2E** | The actual CLI binary against fixture files. `tldsl check fixtures/auth.tldsl` exits 0; `tldsl check fixtures/broken.tldsl` exits non-zero with expected diagnostic. | `tests/e2e/` | Slowest; a handful only. | None - real fs, real ELK, real binary. |
| **Viewer** | Out of scope for MVP. The scene message contract is exercised by integration tests; visual regression of tldraw is not worth its weight. | - | - | - |

## Where fakes live

**Fakes are colocated with their port**, in the same directory and the layer that owns the port. They are NOT in `infra/`. This is forced by the dependency rules in `CONTEXT.md`: `app/` cannot import from `infra/`, and tests follow the same rules as the code they test.

```
src/domain/ports/layout.ts        # LayoutPort interface
src/domain/ports/layout.fake.ts   # StubLayout

src/app/ports/fs.ts               # FsReadPort interface
src/app/ports/fs.fake.ts          # InMemoryFs

src/app/ports/watch.ts            # WatchPort interface
src/app/ports/watch.fake.ts       # FakeWatch (controllable event source)

src/app/ports/transport.ts        # TransportPort interface
src/app/ports/transport.fake.ts   # InMemoryTransport (records pushed messages)

src/app/ports/log.ts              # LogPort interface
src/app/ports/log.fake.ts         # CaptureLog
```

Real adapters in `src/infra/<name>/` import the *port interface* (e.g., `app/ports/fs.ts`) but never the fake.

## Fakes per port

| Port | Fake | What it does |
|---|---|---|
| `FsReadPort` | `InMemoryFs` | Map of path → content; instant reads |
| `WatchPort` | `FakeWatch` | Exposes `.emitChange(path)` for tests to drive watcher events |
| `LayoutPort` | `StubLayout` | Returns deterministic positions (e.g. simple grid) so emit tests don't depend on ELK |
| `TransportPort` | `InMemoryTransport` | Records `pushed: SceneMessage[]`; exposes assertion helpers |
| `LogPort` | `CaptureLog` | Records `{ level, msg, fields }[]` |

## Test doubles policy

- **Fakes** for stateful collaborators (fs, watch, transport, log). One canonical fake per port. Tests import the fake; they do not invent ad hoc test doubles.
- **Stubs** for the layout port in unit tests (deterministic positions; lets you test `emit` without invoking ELK).
- **Mocks (interaction-checking)** only for one-off checks - "did this function call `log.error` exactly once with code X?". Avoid mocking entire modules.
- **No mocks for stateful collaborators.** Use a fake.

## Contract tests

Each real adapter has a contract test that runs the **same scenarios** as the fake's tests. Concretely:

- A `<port>.contract.ts` exports a function `runContract(make: () => Port)` that runs a battery of scenarios.
- The fake's test imports the contract and supplies its constructor.
- The real adapter's test imports the contract and supplies its constructor (with whatever setup/teardown the real one needs - temp dir, port number, etc.).

If the real adapter behaves differently from the fake on any scenario, the contract test fails. This is the mechanism that catches fake drift.

## Snapshot tests

Use snapshots for `domain/emit/` (scene JSON is wide and tedious to assert field-by-field). Rules:

- Snapshot files live under `src/domain/emit/__snapshots__/`.
- Reviewed in PRs as if they were code.
- A snapshot change without a corresponding source change is a regression.
- Do **not** snapshot AST or IR - those are narrow enough to assert with explicit shapes, and snapshots there hide intent.

## Golden-file tests

For e2e:

- `tests/e2e/fixtures/<name>.tldsl` - input.
- `tests/e2e/fixtures/<name>.scene.json` - expected output.
- `tests/e2e/fixtures/<name>.diagnostics.txt` - expected stdout/stderr if invalid.

A single test runner walks the fixtures directory and checks each. New cases = new fixture files; no test code changes.

## AAA structure

Arrange / Act / Assert. Don't interleave assertions inside the act phase. One behavior per test - if you find yourself naming a test `it('parses and lowers and emits')`, that's three tests.

## What requires what

- A new port: requires a fake colocated with the port, a real adapter, and a contract test. Don't merge the port without all three.
- A new domain stage: requires unit tests covering the happy path + every diagnostic it can emit (with `code` asserted, not just message text - codes are the stable surface).
- A new use case: requires integration tests covering the orchestration. Don't push integration coverage down into unit tests of the use case's internals - that couples tests to implementation.
- A new CLI command: requires at least one e2e test against a fixture.

## Anti-patterns

- **Mocking the filesystem with `vi.mock('node:fs')`** - use `FsReadPort` + `InMemoryFs`. The whole point of the port is to avoid module-level mocking.
- **Snapshotting integration tests** - if the assertion is "the right scene was pushed," assert the message *shape* (it's a `scene` message with N nodes), not the full JSON. Snapshots there are change-detectors, not behavior tests.
- **Skipping contract tests** - if a fake exists without a contract test, fake drift is just waiting to happen.
- **Real ELK in unit tests** - slows the suite, couples unit tests to ELK's behavior. Use the stub.
- **One giant e2e test** - if e2e is the only place a behavior is covered, push the coverage down to integration or unit. E2E is for smoke-testing the wiring.
- **Asserting diagnostic message text** - assert the `code` field. Wording is allowed to change without breaking tests.
