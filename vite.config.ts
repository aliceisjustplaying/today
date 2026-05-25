import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare({ tunnel: { autoStart: true } })],
  server: {
    host: "0.0.0.0",
    port: 8787,
    strictPort: true,
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
