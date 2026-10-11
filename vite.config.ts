import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { stampBuild } from "./scripts/stamp-build";

const extraAllowedHosts =
  process.env.VITE_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean) ?? [];

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? "8788"}`;

function buildStamp(): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "today-build-stamp",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle(error) {
      if (!error) stampBuild(outDir, readFileSync(resolve(root, "src/sw.js"), "utf8"));
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  server: {
    host: "0.0.0.0",
    port: 8787,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", "localhost", ...extraAllowedHosts],
    proxy: {
      "/api": apiTarget,
      "/auth": apiTarget,
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
