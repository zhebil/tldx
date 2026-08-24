Tests are deliberately kept proportional to the implementation: the domain
round-trip, the transport contract and the one e2e carry the weight; everything
else is a case or two. See `design.md` for why each piece is shaped this way.

## 1. Domain: page namespacing

- [x] 1.1 Add `src/domain/multipage/` with `pageKeyFor(realpath)`,
      `namespaceScene(scene, key)`, `denamespaceScene(scene, key)` and
      `pageSliceOf(snapshot, key)`; verify with a co-located unit test pinning
      the round-trip `denamespace(namespace(s, k)) === s`, that slicing a
      multi-page snapshot yields only that page's records, and that no id from
      one key survives a slice under another
- [x] 1.2 Verify `npm run lint` still passes with the new module - domain must
      not reach `node:crypto`; hash the path in `infra` and pass the key in

## 2. Transport: per-page replay

- [x] 2.1 Add a page key to `TransportPort.push` in `src/app/ports/transport.ts`
      and extend `transport.contract.ts` with the replay rules (last message per
      page, insertion order on connect, a page never pushed replays nothing);
      the contract suite is the test layer and runs against fake and adapter
      both
- [x] 2.2 Update `src/app/ports/transport.fake.ts` to satisfy the extended
      contract; verify `transport.fake.test.ts` passes
- [x] 2.3 Replace the single `last` in `src/infra/transport/sse-transport.ts`
      with a per-page map; verify via the same contract suite plus the existing
      `sse-transport.test.ts`

## 3. Registry: one record per server

- [x] 3.1 Rewrite `src/infra/serve-registry/serve-registry.ts` around the
      per-root record (`{pid, url, token, codeFingerprint, diagrams}`) with
      project-root resolution by filesystem walk; verify with unit tests for
      root resolution (`.git` dir, `.git` file, `package.json`, bare directory)
- [x] 3.2 Make writes atomic (temp file + `rename`) and add the `wx` claim used
      before binding; verify with unit tests that a torn write leaves the
      previous record readable and that a second claimant loses
- [x] 3.3 Keep the dead-pid and corrupt-record cleanup paths; verify the
      existing cases in `serve-registry.test.ts` still pass against the new
      shape

## 4. Server: control endpoint and auth

- [x] 4.1 Add `POST /diagrams` to `src/infra/devserver/dev-server.ts`, taking a
      file path and returning the assigned page key; verify with a devserver
      test that a valid request reaches the handler
- [x] 4.2 Gate `POST /diagrams` and the existing `PUT /overlay` on the
      per-server token, a same-origin check and a JSON content type; verify with
      devserver tests for wrong token → 403 and cross-site `Origin` → rejected
      with no side effect
- [x] 4.3 Add the page key to the `PUT /overlay` body and route it to the right
      diagram; verify with a devserver test that a missing key is a 400

## 5. App: many diagrams per server

- [x] 5.1 Hold one `watchAndServe` per file in `src/cli/serve.ts`, keyed by
      realpath, with add-diagram and already-served paths; verify with an
      app-level integration test against the fakes that two files produce two
      watchers and that recompiling one pushes only its page
- [x] 5.2 Namespace on push and denamespace before the overlay diff; verify in
      the same integration test that a canvas edit on one page writes only that
      diagram's overlay and records no deletions from the other
- [x] 5.3 Tag log lines with the page key and keep the idle reaper server-wide;
      verified by the existing reaper tests continuing to pass

## 6. CLI: handoff

- [x] 6.1 In `src/cli/main.ts`, resolve the project root, claim or find the
      server, and hand off over `POST /diagrams` when one is live; verify with
      `serve.test.ts` cases that a handoff exits 0 without binding a port and
      that an already-served file reports and exits 0
- [x] 6.2 Open the browser at `#page=<key>` when no viewer is connected, using
      the transport's connected-client count rather than record presence;
      verify with a `serve.test.ts` case per branch (`--no-open`, no client,
      client connected)
- [x] 6.3 Make the first `--ttl` win and report `--ttl ignored; server already
running with ttl <n>m` on handoff; verify with a `serve.test.ts` case

## 7. Viewer: multi-page document

- [x] 7.1 Add a pure `mergePageSlice` in `src/viewer/` doing put plus
      page-scoped removal by id prefix, dropping `document:document` and
      `schema`; verify with a unit test covering stale-record removal scoped to
      one page and other pages left intact
- [x] 7.2 Replace `loadSnapshot` in `app.tsx` with the merge, delete tldraw's
      default page on first merge, and call `setCurrentPage` on page add only;
      verify the default-page deletion in the `mergePageSlice` unit test
- [x] 7.3 Make diagnostics per page in `state.ts` and render only the current
      page's; verify with `state.test.ts` cases that one diagram's success does
      not clear another's diagnostics
- [x] 7.4 Parse `#page=` on mount and select that page when live, ignoring an
      unknown key; verify with a unit test over the hash parser
- [x] 7.5 Send canvas edits with their page key and only that page's records;
      verify with an `overlay-writer.test.ts` case

## 8. Render: page targeting

- [x] 8.1 Navigate to `url#page=<key>` and wait for the editor's current page to
      match before waiting for shapes, in `src/infra/render/export-image.ts`;
      verify with the e2e in 9.1 rather than a unit test - the wait is only
      meaningful against a real browser
- [x] 8.2 Look the page key up in the registry and refuse reuse when the file is
      not served, keeping `--reuse-only`'s error message; verify with a
      `render.test.ts` case

## 9. End to end and docs

- [x] 9.1 Add an e2e beside `tests/e2e/serve-fixture.test.ts` serving two
      diagrams: the second exits 0, both pages exist, and both render correctly
      via `render --reuse-only`
- [x] 9.2 Update `docs/reference.md` and `docs/architecture.md` for the shared
      server, the page key and the control endpoint; verify by reading the
      pipeline diagram back against the new transport shape
- [x] 9.3 Run `npm run check` and confirm typecheck, lint, boundary tests and
      vitest all pass
