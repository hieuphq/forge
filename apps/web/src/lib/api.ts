import { apiBaseUrl } from "./runtime-config";

export type Role = "owner" | "pm" | "worker";
export type Project = { id: string; name: string; estimate: number; status: string; actual_to_date: number; variance_pct: number };
export type Expense = { id: string; vendor: string; category: string; entryDate: string; note?: string | null; subtotal: number; tax: number; fee: number; totalAmount: number; updatedAt: string; items: { description: string; quantity: number; unitPrice: number; amount: number }[]; attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[] };


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
  me: () => request<{ email: string; role: Role }>("/auth/me"),
  projects: () => request<{ projects: Project[] }>("/projects"),
  project: (id: string) => request<{ project: Project; expenses: Expense[] }>(`/projects/${id}`),
  createExpense: (projectId: string, body: unknown) => request<Expense>(`/projects/${projectId}/expenses`, { method: "POST", body: JSON.stringify(body) }),
  updateExpense: (id: string, body: unknown) => request<Expense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  attach: (id: string, files: { filename: string; contentType: string; sizeBytes: number }[]) => request<{ attachments: Expense["attachments"] }>(`/expenses/${id}/attachments`, { method: "POST", body: JSON.stringify({ files }) }),
};
