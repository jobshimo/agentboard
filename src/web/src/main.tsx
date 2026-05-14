// Entry point — App component wired in S10a.
// This placeholder keeps Vite happy so `npm run dev:web` starts without error.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <p>agentboard — coming soon</p>
  </StrictMode>
);
