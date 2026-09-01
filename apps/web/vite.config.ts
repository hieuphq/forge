import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite only looks for .env files in the current working directory by
  // default. This is a monorepo, so point it at the repo root instead of
  // duplicating a .env per app — one root .env covers both api and web.
  envDir: path.resolve(__dirname, "../.."),
});
