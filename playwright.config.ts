import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  globalSetup: "./e2e/builds.ts",
  fullyParallel: true,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 1),
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["iPhone 15"],
  },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
});
