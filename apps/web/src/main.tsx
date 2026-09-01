// Import env first, before anything else, so a missing/invalid VITE_*
// var throws at app boot (named in the error) rather than surfacing much
// later at the first fetch call.
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
