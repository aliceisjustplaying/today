import { parseTabs, type TabConfig } from "./linear";

const REQUIRED = [
  "ALLOWED_EMAIL",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "SESSION_SECRET",
  "GITHUB_TOKEN",
] as const;

export type Config = {
  ALLOWED_EMAIL: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  GOOGLE_API_KEY: string;
  HOME_ADDRESS: string;
  SESSION_SECRET: string;
  LINEAR_API_KEYS: string[];
  LINEAR_RETURNS_LABEL: string;
  LINEAR_TABS: TabConfig[];
  LIMITS_URL: string;
  GITHUB_USER: string;
  GITHUB_TOKEN: string;
  TIMEZONE: string;
  TRANSPORT_DEFAULT: string;
  TRANSPORT_RESCUE: string;
  BUFFER_MINUTES: string;
  HOST: string;
  PORT: number;
  DATABASE_PATH: string;
  MIGRATIONS_DIR: string;
  STATIC_DIR: string;
};

type EnvSource = Record<string, string | undefined>;

export function loadConfig(env: EnvSource = process.env): Config {
  const value = (key: string) => env[key]?.trim() || undefined;

  const linearApiKeys = [value("LINEAR_API_KEY"), ...(value("LINEAR_API_KEYS") ?? "").split(/[\s,]+/)]
    .filter((key): key is string => Boolean(key))
    .filter((key, i, all) => all.indexOf(key) === i);

  const missing: string[] = REQUIRED.filter((key) => !value(key));
  if (linearApiKeys.length === 0) missing.push("LINEAR_API_KEY or LINEAR_API_KEYS");
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  return {
    ALLOWED_EMAIL: value("ALLOWED_EMAIL")!,
    GOOGLE_OAUTH_CLIENT_ID: value("GOOGLE_OAUTH_CLIENT_ID")!,
    GOOGLE_OAUTH_CLIENT_SECRET: value("GOOGLE_OAUTH_CLIENT_SECRET")!,
    GOOGLE_OAUTH_REDIRECT_URI: value("GOOGLE_OAUTH_REDIRECT_URI"),
    GOOGLE_API_KEY: value("GOOGLE_API_KEY") ?? "",
    HOME_ADDRESS: value("HOME_ADDRESS") ?? "",
    SESSION_SECRET: value("SESSION_SECRET")!,
    LINEAR_API_KEYS: linearApiKeys,
    LINEAR_RETURNS_LABEL: value("LINEAR_RETURNS_LABEL") ?? "Returns",
    LINEAR_TABS: parseTabs(value("LINEAR_TABS")),
    LIMITS_URL: value("LIMITS_URL") ?? "http://127.0.0.1:8790",
    GITHUB_USER: value("GITHUB_USER") ?? "aliceisjustplaying",
    GITHUB_TOKEN: value("GITHUB_TOKEN")!,
    TIMEZONE: value("TIMEZONE") ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    TRANSPORT_DEFAULT: value("TRANSPORT_DEFAULT") ?? "TRANSIT",
    TRANSPORT_RESCUE: value("TRANSPORT_RESCUE") ?? "DRIVE",
    BUFFER_MINUTES: value("BUFFER_MINUTES") ?? "10",
    HOST: value("HOST") ?? "127.0.0.1",
    PORT: Number(value("PORT") ?? "8788"),
    DATABASE_PATH: value("DATABASE_PATH") ?? "data/today.sqlite",
    MIGRATIONS_DIR: value("MIGRATIONS_DIR") ?? "drizzle/migrations",
    STATIC_DIR: value("STATIC_DIR") ?? "dist/client",
  };
}
