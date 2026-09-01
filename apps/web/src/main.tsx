// Import env first, before anything else, so malformed optional VITE_*
// local-dev fallbacks fail at app boot. Production API config is loaded
// from /config.js before this module script runs.
import "@/env";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
