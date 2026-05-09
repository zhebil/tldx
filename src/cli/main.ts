/**
 * `tldsl` CLI entry point. Composition root: wires real adapters (NodeFs,
 * StubLayout for now - real ELK lands in tldsl-gxl) and dispatches
 * subcommands. Per CONTEXT.md, this is the ONLY place real adapters meet
 * use cases.
 *
 * Subcommands:
 *   tldsl check <file>   Validate a single `.tldsl` file. Exits non-zero on
 *                        compile errors. Files not ending in `.tldsl` are
 *                        accepted silently with exit 0 (PostToolUse hook).
 *
 * `serve` is a separate issue and not wired here yet.
 */

import { StubLayout } from "../domain/ports/layout.fake.js";
import { createNodeFsRead } from "../infra/fs/node-fs-read.js";

import { runCheck, type CheckIo } from "./check.js";

type Command = {
  name: string;
  args: string;
  description: string;
  run: (rest: readonly string[], io: CheckIo) => number | Promise<number>;
};

type ParsedInvocation =
  | { kind: "help"; explicit: boolean }
  | { kind: "command"; name: string; rest: readonly string[] };

const commands: readonly Command[] = [
  {
    name: "check",
    args: "<file>",
    description: "parse and validate a single .tldsl file",
    run: (rest, io) => {
      const path = rest[0];
      if (path === undefined) {
        io.writeStderr("tldsl check: missing <file> argument\n");
        return 1;
      }
      return runCheck({
        path,
        deps: {
          fs: createNodeFsRead(),
          layout: new StubLayout(),
        },
        io,
      });
    },
  },
];

function parseArgs(argv: readonly string[]): ParsedInvocation {
  const [head, ...rest] = argv;
  if (head === undefined) return { kind: "help", explicit: false };
  if (head === "--help" || head === "-h") return { kind: "help", explicit: true };
  return { kind: "command", name: head, rest };
}

function buildUsage(cmds: readonly Command[]): string {
  const lines = ["usage: tldsl <command> [args]", "", "commands:"];
  const width = Math.max(...cmds.map((c) => `${c.name} ${c.args}`.length));
  for (const c of cmds) {
    const head = `${c.name} ${c.args}`.padEnd(width);
    lines.push(`  ${head}   ${c.description}`);
  }
  return lines.join("\n");
}

export async function main(argv: readonly string[], io: CheckIo): Promise<number> {
  const usage = buildUsage(commands);
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    io.writeStdout(`${usage}\n`);
    return parsed.explicit ? 0 : 1;
  }

  const cmd = commands.find((c) => c.name === parsed.name);
  if (cmd === undefined) {
    io.writeStderr(`tldsl: unknown command: ${parsed.name}\n${usage}\n`);
    return 1;
  }

  return cmd.run(parsed.rest, io);
}

// Run when invoked directly (not when imported by tests).
const isEntry =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isEntry) {
  const io: CheckIo = {
    writeStdout: (chunk) => process.stdout.write(chunk),
    writeStderr: (chunk) => process.stderr.write(chunk),
  };
  void main(process.argv.slice(2), io).then((code) => {
    process.exitCode = code;
  });
}
