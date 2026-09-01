import { z } from "zod";

// Vite only exposes vars prefixed VITE_ on import.meta.env, and yields
// `undefined` for anything missing rather than erroring — so a typo or a
// missing .env entry would otherwise surface far from its cause (e.g. at
// the first fetch call) instead of at boot. Parsing eagerly here, and
// importing this module at the top of main.tsx, moves that failure to
// app startup and names the offending key.
const envSchema = z.object({
  VITE_API_URL: z.string().min(1, "VITE_API_URL is required").url(),
});

export const env = envSchema.parse(import.meta.env);
