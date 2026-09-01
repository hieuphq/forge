import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { requireAuth, type RequireAuthVariables } from "../auth/require-auth.middleware";
type Client = { write: (bucket: string) => void };
const clients = new Set<Client>();
export function publishDirtyBucket(bucket: string): void { for (const client of clients) client.write(bucket); }
export const eventsApp = new OpenAPIHono<{ Variables: RequireAuthVariables }>();
eventsApp.use("/events", requireAuth);
eventsApp.get("/events", (c) => streamSSE(c, async (stream) => { const client: Client = { write: (bucket) => void stream.writeSSE({ event: "dirty", data: bucket }) }; clients.add(client); stream.onAbort(() => { clients.delete(client); }); await stream.writeSSE({ event: "ready", data: "ok" }); while (!stream.aborted) await stream.sleep(30000); clients.delete(client); }));
