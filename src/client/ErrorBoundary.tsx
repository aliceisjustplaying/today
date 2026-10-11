import { Component, type ReactNode } from "react";
import { clearCached } from "./cache";

type State = { error: Error | null };

/** Without this, a render error unmounts the whole app and leaves a blank white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("today crashed while rendering", error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1 className="crash-title">Something went wrong</h1>
        <p className="crash-text">today hit an error it couldn't recover from.</p>
        <button
          type="button"
          className="crash-reload"
          onClick={() => {
            clearCached();
            window.location.reload();
          }}
        >
          Reload
        </button>
        <pre className="crash-detail">{error.message}</pre>
      </main>
    );
  }
}
