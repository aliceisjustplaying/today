import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const extraAllowedHosts =
  process.env.VITE_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean) ?? [];

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? "8788"}`;

export default defineConfig({
  plugins: [react()],
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
