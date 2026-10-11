import type { Config } from "./config";
import type { DB } from "./db";

export type SessionRow = {
  id: string;
  userSub: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
};

export type AppEnv = Config & { db: DB };

export type Env = {
  Bindings: AppEnv;
  Variables: {
    session?: SessionRow;
  };
};
