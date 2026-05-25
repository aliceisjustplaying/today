import { useEffect, useState } from "react";
import type { Me } from "./types";
import { SignIn } from "./SignIn";
import { SignedIn } from "./SignedIn";

type AuthState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "signed-in"; me: Me }
  | { kind: "error"; message: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) return setAuth({ kind: "anon" });
        if (!r.ok) return setAuth({ kind: "error", message: `HTTP ${r.status}` });
        const me = (await r.json()) as Me;
        setAuth({ kind: "signed-in", me });
      })
      .catch((e) => setAuth({ kind: "error", message: String(e) }));
  }, []);

  if (auth.kind === "loading") {
    return (
      <div className="loading-screen" aria-busy="true">
        <div className="loading-pulse" />
      </div>
    );
  }
  if (auth.kind === "anon") return <SignIn />;
  if (auth.kind === "error") {
    return (
      <div className="error-screen">
        <pre>{auth.message}</pre>
      </div>
    );
  }
  return <SignedIn me={auth.me} />;
}
