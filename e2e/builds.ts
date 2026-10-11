import { cpSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stampBuild } from "../scripts/stamp-build";

export const BUILDS = "e2e/.builds";

/**
 * Two deploys of the current client: `a` is dist/client as built, `b` is the same code with
 * every hashed asset renamed, as the next deploy would have, so `a`'s assets are gone from it.
 */
export default function setup() {
  rmSync(BUILDS, { recursive: true, force: true });
  const a = join(BUILDS, "a");
  const b = join(BUILDS, "b");
  cpSync("dist/client", a, { recursive: true });
  cpSync("dist/client", b, { recursive: true });

  const renames = readdirSync(join(b, "assets")).map((file) => [file, file.replace(/\.(\w+)$/, "-b.$1")] as const);
  for (const [from, to] of renames) renameSync(join(b, "assets", from), join(b, "assets", to));
  const indexPath = join(b, "index.html");
  let html = readFileSync(indexPath, "utf8");
  for (const [from, to] of renames) html = html.replaceAll(`/assets/${from}`, `/assets/${to}`);
  writeFileSync(indexPath, html);
  stampBuild(b, readFileSync("src/sw.js", "utf8"));
}
