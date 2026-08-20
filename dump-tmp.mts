import { compileFile } from "/Users/zhebil/work/personal/tldsl/src/app/compile-file.js";
import { createNodeFsRead } from "/Users/zhebil/work/personal/tldsl/src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "/Users/zhebil/work/personal/tldsl/src/infra/layout-elk/elk-layout.js";

const layout = new ElkLayoutAdapter();

const r: any = await compileFile(process.argv[2]!, {
  fs: createNodeFsRead(),
  layout,
});
if (r.diagnostics?.length) console.log("DIAGS:", JSON.stringify(r.diagnostics).slice(0, 800));
const scene = r.sceneJson;
if (!scene) { console.log("no scene"); process.exit(0); }
const byId = new Map<string, any>();
for (const rec of Object.values(scene.store)) byId.set(rec.id, rec);
const rows: string[] = [];
for (const rec of Object.values(scene.store)) {
  if (rec.typeName !== "shape") continue;
  rows.push(`${rec.type.padEnd(6)} ${String(rec.id).replace("shape:","").padEnd(22)} parent=${String(rec.parentId).replace("shape:","").padEnd(18)} x=${String(Math.round(rec.x)).padStart(6)} y=${String(Math.round(rec.y)).padStart(6)} w=${String(Math.round(rec.props?.w ?? 0)).padStart(5)} h=${String(Math.round(rec.props?.h ?? 0)).padStart(4)}`);
}
console.log(rows.join("\n"));
console.log("shapes:", rows.length);
console.log("KEYS:", Object.keys(scene));
console.log("SAMPLE:", JSON.stringify(scene).slice(0, 300));
