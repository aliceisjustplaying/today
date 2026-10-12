import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userSub: text("user_sub").notNull(),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const oauthTokens = sqliteTable("oauth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  userSub: text("user_sub").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  scope: text("scope"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  sourceApp: text("source_app").notNull(),
  sourceMeta: text("source_meta"),
  summary: text("summary").notNull(),
  proposedAction: text("proposed_action").notNull(),
  urgency: text("urgency").notNull(),
  confidence: text("confidence").notNull(),
  status: text("status").notNull().default("candidate"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const prepSteps = sqliteTable("prep_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  minutes: integer("minutes").notNull(),
  position: integer("position").notNull(),
  removedAt: integer("removed_at", { mode: "timestamp" }),
});

export const prepChecks = sqliteTable(
  "prep_checks",
  {
    day: text("day").notNull(),
    stepId: integer("step_id")
      .notNull()
      .references(() => prepSteps.id),
    checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.stepId] })],
);

export const prepDays = sqliteTable("prep_days", {
  day: text("day").primaryKey(),
  runningLate: integer("running_late", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const prefs = sqliteTable("prefs", {
  id: integer("id").primaryKey(),
  homeAddress: text("home_address"),
  transportDefault: text("transport_default").notNull().default("transit"),
  transportRescue: text("transport_rescue"),
  rescueRule: text("rescue_rule"),
  timezone: text("timezone").notNull().default("Europe/London"),
});

/**
 * Stars and forks on the Stars tab, kept past GitHub's 300-event / 90-day repo events window.
 * Stars are WatchEvents (id = the GitHub event id); forks come from the forks API (id = "fork:" + the fork's repo id).
 */
export const githubEvents = sqliteTable(
  "github_events",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["star", "fork"] }).notNull(),
    repo: text("repo").notNull(),
    login: text("login").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    /** Epoch ms. */
    at: integer("at").notNull(),
  },
  (t) => [index("github_events_at").on(t.at)],
);

/** GitHub display names, looked up once per login. */
export const githubUsers = sqliteTable("github_users", {
  login: text("login").primaryKey(),
  name: text("name"),
  fetchedAt: integer("fetched_at").notNull(),
});
