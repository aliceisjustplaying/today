#!/usr/bin/env bun
import { spawn } from "bun";
import qrcode from "qrcode-terminal";
import { mkdirSync } from "node:fs";

const CLEAN_HOME = "/tmp/clean-cloudflared";
mkdirSync(CLEAN_HOME, { recursive: true });

const dye = (color: string, label: string) =>
  `\x1b[${color}m[${label}]\x1b[0m`;
const webTag = dye("36", "web");
const cfTag = dye("35", "cf ");

function prefixStream(
  stream: ReadableStream<Uint8Array>,
  prefix: string,
  onLine?: (line: string) => void,
) {
  const decoder = new TextDecoder();
  let buf = "";
  (async () => {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        process.stdout.write(`${prefix} ${line}\n`);
        if (onLine) onLine(line);
      }
    }
    if (buf.length > 0) {
      process.stdout.write(`${prefix} ${buf}\n`);
      if (onLine) onLine(buf);
    }
  })();
}

const dev = spawn(["bun", "run", "dev"], {
  stdout: "pipe",
  stderr: "pipe",
});

const cf = spawn(
  [
    "cloudflared",
    "tunnel",
    "--protocol",
    "http2",
    "--url",
    "http://localhost:8787",
  ],
  {
    env: { ...process.env, HOME: CLEAN_HOME },
    stdout: "pipe",
    stderr: "pipe",
  },
);

let urlPrinted = false;
const handleLine = (line: string) => {
  if (urlPrinted) return;
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m) return;
  urlPrinted = true;
  const url = m[0];
  setTimeout(() => {
    process.stdout.write(`\n  Tunnel URL: ${url}\n\n`);
    qrcode.generate(url, { small: true });
    process.stdout.write(
      `\n  Add ${url}/auth/google/callback to your Google OAuth client redirects.\n\n`,
    );
  }, 300);
};

prefixStream(dev.stdout, webTag);
prefixStream(dev.stderr, webTag);
prefixStream(cf.stdout, cfTag, handleLine);
prefixStream(cf.stderr, cfTag, handleLine);

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals = "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n[tunnel] shutting down (${signal})…\n`);
  try {
    dev.kill();
  } catch {}
  try {
    cf.kill();
  } catch {}
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await Promise.race([dev.exited, cf.exited]);
shutdown();
await Promise.allSettled([dev.exited, cf.exited]);
process.exit(0);
