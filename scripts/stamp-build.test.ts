import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stampBuild } from "./stamp-build";

const dir = mkdtempSync(join(tmpdir(), "today-stamp-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sw = 'const BUILD = "__BUILD__";\nconst PRECACHE = ["__PRECACHE__"];\n';

function writeBuild(assets: string[]) {
  rmSync(join(dir, "assets"), { recursive: true, force: true });
  mkdirSync(join(dir, "assets"));
  for (const file of assets) writeFileSync(join(dir, "assets", file), file);
  writeFileSync(join(dir, "index.html"), `<html><head>\n    <title>today</title>\n  </head></html>`);
}

test("stamps index.html, version.json and sw.js with one build id", () => {
  writeBuild(["index-b.js", "index-a.css"]);
  const build = stampBuild(dir, sw);

  expect(build).toMatch(/^[0-9a-f]{12}$/);
  expect(readFileSync(join(dir, "index.html"), "utf8")).toContain(`<meta name="today-build" content="${build}" />`);
  expect(JSON.parse(readFileSync(join(dir, "version.json"), "utf8"))).toEqual({ build });
  expect(readFileSync(join(dir, "sw.js"), "utf8")).toBe(
    `const BUILD = "${build}";\nconst PRECACHE = ["/assets/index-a.css","/assets/index-b.js","/manifest.webmanifest","/favicon.svg"];\n`,
  );
});

test("the id is stable across restamps and changes with the assets", () => {
  writeBuild(["index-1.js"]);
  const first = stampBuild(dir, sw);
  expect(stampBuild(dir, sw)).toBe(first);
  expect(readFileSync(join(dir, "index.html"), "utf8").match(/today-build/g)).toHaveLength(1);

  writeBuild(["index-2.js"]);
  expect(stampBuild(dir, sw)).not.toBe(first);
});
