export function SignIn() {
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="signin-mark" aria-hidden="true">
          t
        </div>
        <h1 className="signin-title">today</h1>
        <p className="signin-tag">the now layer</p>
        <a className="signin-cta" href="/auth/google/start">
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
