export function SignIn() {
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="signin-mark" aria-hidden="true">
          t
        </div>
        <h1 className="signin-title">today</h1>
        <p className="signin-tag">the now layer</p>
        <p className="signin-about">
          today is Alice's personal dashboard: what's next on her calendar, what's due, and when to
          leave. It's a private app, and only her account can sign in.
        </p>
        <a className="signin-cta" href="/auth/google/start">
          Sign in with Google
        </a>
        <a className="signin-privacy" href="/privacy">
          Privacy policy
        </a>
      </div>
    </main>
  );
}
