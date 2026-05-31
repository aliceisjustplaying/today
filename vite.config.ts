import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env;

const extraAllowedHosts =
  env?.VITE_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean) ?? [];

export default defineConfig({
  plugins: [react(), cloudflare({ configPath: env?.WRANGLER_CONFIG_PATH ?? "wrangler.jsonc" })],
  server: {
    host: "0.0.0.0",
    port: 8787,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", "localhost", ...extraAllowedHosts],
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
