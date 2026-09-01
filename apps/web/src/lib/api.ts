import { apiBaseUrl } from "./runtime-config";

export type Role = "owner" | "pm" | "worker";
export type Session = { email: string; role: Role };
export type PublicUser = { id: string; email: string; username: string; name?: string | null; role: Role };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers }, ...init });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { message = ((await res.json()) as { message?: string }).message ?? message; } catch {}
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  baseUrl: apiBaseUrl,
  login: (email: string, password: string) => request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<Session>("/auth/me"),
  createUser: (body: { email: string; username: string; name?: string; role: Role; password: string }) => request<PublicUser>("/users", { method: "POST", body: JSON.stringify(body) }),
};
