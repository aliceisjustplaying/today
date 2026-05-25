export type SessionRow = {
  id: string;
  userSub: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
};

export type Env = {
  Bindings: Cloudflare.Env;
  Variables: {
    session?: SessionRow;
  };
};
