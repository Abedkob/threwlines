import { invalidateBrowserQueries } from "@/lib/query-cache";

export const DATA_CHANGED_EVENT = "nosterys:data-changed";

export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || res.statusText);
  }
  const method = (options?.method ?? "GET").toUpperCase();
  if (method !== "GET" && typeof window !== "undefined") {
    invalidateBrowserQueries();
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
  return (await res.json().catch(() => ({}))) as T;
}

export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^(https?:|data:|\/)/.test(path)) return path;
  return `/api/uploads/company-assets/${path}`;
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function jsonBody(value: unknown): { body: string } {
  return { body: JSON.stringify(value) };
}
