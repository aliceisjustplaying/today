import type { MiddlewareHandler, Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions } from "./db/schema";
import type { Env } from "./env";

const COOKIE_NAME = "today_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function makeSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  c: Context<Env>,
  opts: { userSub: string; email: string },
): Promise<void> {
  const id = makeSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await db(c.env.DB).insert(sessions).values({
    id,
    userSub: opts.userSub,
    email: opts.email,
    createdAt: now,
    expiresAt,
  });

  const secure = new URL(c.req.url).protocol === "https:";
  await setSignedCookie(c, COOKIE_NAME, id, c.env.SESSION_SECRET, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession(c: Context<Env>) {
  const sid = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE_NAME);
  if (!sid) return null;

  const rows = await db(c.env.DB)
    .select()
    .from(sessions)
    .where(eq(sessions.id, sid))
    .limit(1);

  const s = rows[0];
  if (!s) return null;
  if (s.expiresAt < new Date()) return null;

  return s;
}

export async function destroySession(c: Context<Env>): Promise<void> {
  const sid = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE_NAME);
  if (sid) {
    await db(c.env.DB).delete(sessions).where(eq(sessions.id, sid));
  }
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export const sessionMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const s = await readSession(c);
  if (s) c.set("session", s);
  await next();
};

export const requireSession: MiddlewareHandler<Env> = async (c, next) => {
  const s = c.get("session") ?? (await readSession(c));
  if (!s) return c.json({ error: "unauthorized" }, 401);
  c.set("session", s);
  await next();
};
