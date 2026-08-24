# Agent Instructions

## Architecture

Read `CONTEXT.md` (project root) before writing code. It defines the layers, dependency rules, and patterns. Lint enforces these mechanically - violations fail CI.

Read `docs/testing.md` for the testing philosophy. Co-located unit tests in `domain/` are the bulk of the suite; fakes per port are canonical.

Other docs (`scene-json.md`, `lint-config.md`, `architecture.md`, `dsl.md`, `decisions.md`, `roadmap.md`) are reference material - **consult on demand**, not up front. Open one when the issue mentions it or your code touches that surface.

**Targeted-test rule**: when adding behavior, write the smallest test that pins it down at the right layer. Pure logic → unit test in `domain/`. Orchestration → integration test in `app/` with fakes. Real adapter behavior → contract test in `infra/`. End-to-end smoke → fixture under `tests/e2e/`. Don't push integration coverage down into unit tests of internals.

**Conflict-resolution rule**: if `CONTEXT.md` says a symbol/file lives in location A but `ls src/<A>` is empty (or the symbol exists somewhere else - e.g., types in `contracts/` that CONTEXT places in `domain/`), read the existing file before claiming an issue that references it. The resolved location may reshape the issue's scope. Cross-checking after the claim wastes a claim.

## Build & run

```bash
npm run check        # typecheck + lint + dep-lint + vitest (full automated suite)
npm run build        # dist/cli/ (tsc) + dist/viewer/ (vite); ship-ready artifacts
npm run dev:cli -- <args>   # run CLI from source via tsx, e.g. `-- serve fixtures/x.tldx`
node dist/cli/main.js <args>  # run the built CLI
```

The CLI is wired as `bin.tldx → dist/cli/main.js` (with shebang). After `npm link`, `tldx serve <file>` and `tldx check <file>` work like an installed binary.

`tsconfig.build.json` is the emit config (extends the root `tsconfig.json`, flips `noEmit`, narrows includes). Tests/fakes/contract suites and `src/viewer/` are excluded from the CLI build.

## Implement → Review → Commit

Default working loop in this repo:

1. **Claude implements** the change (driven by a `bd` issue).
2. **User reviews** the diff. Do **not** commit before the review unless explicitly told to.
3. **Claude commits in logical batches** via the `/commit` slash command. One concern per commit; stage hunks (not whole files) when a single file touches multiple concerns. Details in `.claude/commands/commit.md`.

Never `git add .` / `git add -A` and never amend without an explicit ask.

## Issue tracking

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
