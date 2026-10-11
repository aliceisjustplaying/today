import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUILD_META = /\s*<meta name="today-build" content="[^"]*" \/>/;

/**
 * Gives a built client one id derived from its index.html and hashed assets, then writes it
 * where each side can compare: a meta tag in index.html (the running page), version.json
 * (the server) and sw.js (the service worker, together with the files it precaches).
 */
export function stampBuild(dir: string, swSource: string): string {
  const htmlPath = join(dir, "index.html");
  const html = readFileSync(htmlPath, "utf8").replace(BUILD_META, "");
  const assets = readdirSync(join(dir, "assets"))
    .sort()
    .map((file) => `/assets/${file}`);
  const build = createHash("sha256").update(html).update(assets.join("\n")).digest("hex").slice(0, 12);

  writeFileSync(htmlPath, html.replace("</head>", `  <meta name="today-build" content="${build}" />\n  </head>`));
  writeFileSync(join(dir, "version.json"), `${JSON.stringify({ build })}\n`);
  writeFileSync(
    join(dir, "sw.js"),
    swSource
      .replace('"__BUILD__"', JSON.stringify(build))
      .replace('["__PRECACHE__"]', JSON.stringify([...assets, "/manifest.webmanifest", "/favicon.svg"])),
  );
  return build;
}
