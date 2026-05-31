import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string | undefined>;

const env: EnvMap = {};

function parseEnvFile(path: string): EnvMap {
  if (!existsSync(path)) return {};

  const parsed: EnvMap = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key) continue;

    const value = rawValue
      ?.replace(/\s+#.*$/, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();

    parsed[key] = value;
  }

  return parsed;
}

for (const source of [process.env, parseEnvFile(".env"), parseEnvFile(".dev.vars"), parseEnvFile(".dev.vars.local")]) {
  Object.assign(env, source);
}

const requiredKeys = [
  "CLOUDFLARE_D1_DATABASE_ID",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "ALLOWED_EMAIL",
  "TIMEZONE",
] as const;

const missing = requiredKeys.filter((key) => !env[key]?.trim());
if (missing.length > 0) {
  throw new Error(`Missing required env values for private Wrangler config: ${missing.join(", ")}`);
}

const customDomain = env.CLOUDFLARE_CUSTOM_DOMAIN?.trim();

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: env.CLOUDFLARE_WORKER_NAME?.trim() || "today",
  ...(env.CLOUDFLARE_ACCOUNT_ID?.trim() ? { account_id: env.CLOUDFLARE_ACCOUNT_ID.trim() } : {}),
  main: "src/server/index.ts",
  compatibility_date: "2025-05-01",
  compatibility_flags: ["nodejs_compat"],
  assets: {
    directory: "./dist/client",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: true,
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: env.CLOUDFLARE_D1_DATABASE_NAME?.trim() || "today",
      database_id: env.CLOUDFLARE_D1_DATABASE_ID,
      migrations_dir: "drizzle/migrations",
    },
  ],
  vars: {
    GOOGLE_OAUTH_REDIRECT_URI: env.GOOGLE_OAUTH_REDIRECT_URI,
    ALLOWED_EMAIL: env.ALLOWED_EMAIL,
    TIMEZONE: env.TIMEZONE,
    TRANSPORT_DEFAULT: env.TRANSPORT_DEFAULT?.trim() || "TRANSIT",
    TRANSPORT_RESCUE: env.TRANSPORT_RESCUE?.trim() || "DRIVE",
    BUFFER_MINUTES: env.BUFFER_MINUTES?.trim() || "10",
  },
  observability: {
    enabled: true,
  },
  ...(customDomain
    ? {
        routes: [
          {
            pattern: customDomain,
            custom_domain: true,
          },
        ],
      }
    : {}),
};

writeFileSync("wrangler.local.jsonc", `${JSON.stringify(config, null, 2)}\n`);
mkdirSync(".wrangler/deploy", { recursive: true });
writeFileSync(
  ".wrangler/deploy/config.json",
  `${JSON.stringify({ configPath: "../../wrangler.local.jsonc" }, null, 2)}\n`,
);
