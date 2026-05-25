import { Hono } from "hono";
import { googleAuth } from "@hono/oauth-providers/google";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { oauthTokens } from "./db/schema";
import { createSession, destroySession } from "./session";
import type { Env } from "./env";

const auth = new Hono<Env>();

auth.get("/google/start", (c) => c.redirect("/auth/google/callback"));

auth.use("/google/callback", async (c, next) => {
  const redirect_uri = new URL("/auth/google/callback", c.req.url).toString();
  const handler = googleAuth({
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    access_type: "offline",
    prompt: "consent",
    redirect_uri,
  });
  return handler(c, next);
});

auth.get("/google/callback", async (c) => {
  const token = c.get("token");
  const refreshToken = c.get("refresh-token");
  const user = c.get("user-google");

  if (!user || !user.email || !user.id || !token) {
    return c.text("Google sign-in failed", 400);
  }

  if (user.email.toLowerCase() !== c.env.ALLOWED_EMAIL.toLowerCase()) {
    return c.text(`Sorry, ${user.email} is not allowlisted on this app.`, 403);
  }

  const now = new Date();
  const expiresAt = token.expires_in
    ? new Date(now.getTime() + token.expires_in * 1000)
    : null;

  await db(c.env.DB)
    .delete(oauthTokens)
    .where(
      and(eq(oauthTokens.provider, "google"), eq(oauthTokens.userSub, user.id)),
    );

  await db(c.env.DB).insert(oauthTokens).values({
    provider: "google",
    userSub: user.id,
    accessToken: token.token,
    refreshToken: refreshToken?.token ?? null,
    scope: "openid email profile calendar.readonly",
    expiresAt,
    updatedAt: now,
  });

  await createSession(c, { userSub: user.id, email: user.email });
  return c.redirect("/");
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.redirect("/");
});

export default auth;
