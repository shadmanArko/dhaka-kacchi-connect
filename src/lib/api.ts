/**
 * Single fetch seam for calling your backend (built separately, e.g. with Claude Code).
 *
 * Configure via `.env`:
 *   VITE_API_BASE_URL=https://your-backend.example.com
 *
 * All frontend HTTP calls should go through this file so swapping backends
 * (or later moving endpoints into TanStack `createServerFn`) is a one-file change.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(0, "VITE_API_BASE_URL is not configured");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  }
  return (await res.json()) as T;
}

export const api = {
  subscribe: (email: string) =>
    apiFetch<{ ok: true }>("/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};
