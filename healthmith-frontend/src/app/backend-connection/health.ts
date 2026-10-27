export type BackendHealth =
  | { state: "connected" }
  | { state: "not-configured" }
  | { state: "invalid-config" }
  | { state: "http-error"; httpStatus: number }
  | { state: "invalid-response" }
  | { state: "timeout" }
  | { state: "unreachable" };

export async function fetchBackendHealth(baseUrl: string | undefined): Promise<BackendHealth> {
  if (!baseUrl?.trim()) return { state: "not-configured" };

  let healthUrl: URL;
  try {
    const base = new URL(baseUrl.trim());
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username || base.password || base.search || base.hash
    ) {
      return { state: "invalid-config" };
    }
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    healthUrl = new URL("health", base);
  } catch {
    return { state: "invalid-config" };
  }

  const signal = AbortSignal.timeout(5_000);
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal,
    });
    if (response.status !== 200) {
      return { state: "http-error", httpStatus: response.status };
    }

    const body: unknown = await response.json();
    if (body && typeof body === "object" && "status" in body && body.status === "UP") {
      return { state: "connected" };
    }
    return { state: "invalid-response" };
  } catch (error) {
    if (signal.aborted) return { state: "timeout" };
    if (error instanceof SyntaxError) return { state: "invalid-response" };
    return { state: "unreachable" };
  }
}
