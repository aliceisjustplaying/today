#!/usr/bin/env bun
import { spawn } from "bun";

const children = [
  spawn(["bun", "--watch", "src/server/main.ts"], { stdout: "inherit", stderr: "inherit" }),
  spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" }),
];

const shutdown = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(children.map((child) => child.exited));
shutdown();
await Promise.allSettled(children.map((child) => child.exited));
