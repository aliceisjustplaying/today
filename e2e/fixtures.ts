import { spawn } from "node:child_process";
import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

export const test = base.extend<{}, { serverURL: string }>({
  serverURL: [async ({}, use) => {
    const child = spawn("bun", ["e2e/server.ts", "0", "e2e/.builds/a"], { stdio: ["ignore", "pipe", "inherit"] });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = "";
        child.stdout.on("data", (data) => {
          output += data.toString();
          const match = output.match(/e2e server on (http:\/\/localhost:\d+) serving/);
          if (match?.[1]) resolve(match[1]);
        });
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`e2e server exited with ${code}`)));
      });
      await use(url);
    } finally {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await exited;
      }
    }
  }, { scope: "worker" }],
  baseURL: async ({ serverURL }, use) => {
    await use(serverURL);
  },
});
