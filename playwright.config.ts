import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  globalSetup: "./e2e/builds.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["iPhone 15"],
    baseURL: "http://localhost:4173",
  },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: "bun e2e/server.ts 4173 e2e/.builds/a",
    url: "http://localhost:4173/api/me",
    reuseExistingServer: false,
  },
});
