import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

export const bodyState = sqliteTable("body_state", {
  id: integer("id").primaryKey(),
  eaten: integer("eaten", { mode: "boolean" }).notNull().default(false),
  showered: integer("showered", { mode: "boolean" }).notNull().default(false),
  shaved: integer("shaved", { mode: "boolean" }).notNull().default(false),
  dressed: integer("dressed", { mode: "boolean" }).notNull().default(false),
  packed: integer("packed", { mode: "boolean" }).notNull().default(false),
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
