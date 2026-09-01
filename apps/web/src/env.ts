import { z } from "zod";

// Runtime containers provide the browser-visible API URL through /config.js.
// VITE_API_URL remains optional for local Vite dev only; it must not be
// required at production image build time.
const envSchema = z.object({
  VITE_API_URL: z.string().url().optional(),
});

export const env = envSchema.parse(import.meta.env);
