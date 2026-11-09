const DEFAULT_DESTINATION = "/survey";

/** OAuth 후 외부 사이트로 빠지는 redirect를 막는다. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_DESTINATION;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return DEFAULT_DESTINATION;
    const url = new URL(value, "https://healthmith.invalid");
    if (url.origin !== "https://healthmith.invalid") return DEFAULT_DESTINATION;
    if (url.pathname.startsWith("/auth/") || url.pathname === "/login") return DEFAULT_DESTINATION;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_DESTINATION;
  }
}
