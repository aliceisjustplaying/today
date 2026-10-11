import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { registerServiceWorker } from "./updates";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

sessionStorage.removeItem("today.bootRetry");
registerServiceWorker();
