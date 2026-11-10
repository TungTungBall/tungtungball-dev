import "server-only";

import { getBackendApiUrl } from "@/config/env";

/** Build a backend API URL without exposing server configuration to the browser. */
export function buildBackendApiUrl(path: string): URL | null {
  try {
    const base = new URL(getBackendApiUrl().trim());
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    return new URL(path.replace(/^\/+/, ""), new URL("api/", base));
  } catch {
    return null;
  }
}

export function fetchBackendApi(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const url = buildBackendApiUrl(path);
  if (!url) return Promise.reject(new Error("Backend API URL is invalid"));
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}
