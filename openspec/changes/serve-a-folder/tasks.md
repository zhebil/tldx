## 1. Argument expansion

- [x] 1.1 Add `src/cli/serve-target.ts` exporting the function that maps one
      CLI path argument to the non-empty list of files to serve: anything that
      is not a directory stays a one-element list (including a missing path,
      which keeps today's "server with a diagnostic page" behaviour); a
      directory becomes its `*.tldx.jsx` children, one level deep, sorted
      ascending by file name. Test layer: co-located unit test
      `src/cli/serve-target.test.ts` over a temp dir.
- [x] 1.2 Pin the selection rules in that same unit test: subdirectories are
      not descended into and a directory named `*.tldx.jsx` is not selected,
      `.tldx.overlay.json` sidecars and other files are ignored, a directory
      with no `.tldx.jsx` child throws a message naming the directory, and a
      missing path is passed through unchanged rather than throwing.

## 2. Serve wiring

- [x] 2.1 Call the expansion from the `serve` command in `src/cli/main.ts`
      before `findServer`/`claimServer`, so an empty or bad directory exits 1
      with the message on stderr and no server is started or contacted. Test
      layer: `src/cli/main.test.ts` asserting the exit code, the stderr text,
      and that no registry record appears.
- [x] 2.2 Cold start: boot the server on the first file, then `addDiagram` the
      remaining files in order before `awaitShutdown`, reporting each. Test
      layer: `src/cli/serve.test.ts` asserting one server holds a page per file
      in served order.
- [x] 2.3 Handoff: loop `handOff` over every file sequentially, printing the
      existing added / already-served line per file, and exit 0. Test layer:
      `src/cli/main.test.ts` against a stub server, covering a directory where
      some files are already served.
- [x] 2.4 Open at most one browser tab, deep-linked to the first file's page,
      using the first response's `hasViewer`, with `--no-open` still
      suppressing it. Test layer: `src/cli/serve.test.ts` plus the existing
      `shouldOpenBrowser` unit test, asserting the opener is called once with
      the first page's URL.
- [x] 2.5 A file that `addDiagram` or `handOff` rejects is reported and the
      loop continues; the command exits non-zero if any file failed. Test
      layer: `src/cli/main.test.ts` with one unreadable file among several.
- [x] 2.6 Update the `serve` usage line to `<file|dir>` and its description in
      the `commands` table. Test layer: `src/cli/main.test.ts` help-output
      assertion.

## 3. End to end

- [x] 3.1 Add an e2e case under `tests/e2e/` serving a fixture directory of two
      `.tldx.jsx` files plus one non-diagram file, asserting one server, two
      pages, and no page for the third file. Test layer: `tests/e2e/`
      (extend `serve-shared.test.ts` or add a sibling next to it).

## 4. Docs

- [x] 4.1 Document the directory form in `README.md` (usage table and the
      example section), `docs/reference.md` (the `tldx serve` row) and
      `plugin/skills/tldx/SKILL.md` (the serve workflow section), including the
      one-level-deep rule and the empty-directory error. Verify by grepping
      each file for the directory form.
- [x] 4.2 Note the directory form in `docs/architecture.md` where `tldx serve`
      is described as one server per project root, if and only if that
      paragraph would otherwise read as file-only. Verify by re-reading that
      paragraph.

## 5. Gate

- [x] 5.1 Run `npm run format` then `npm run check` and confirm typecheck,
      oxfmt, oxlint, knip and vitest all pass; paste any failure verbatim.
