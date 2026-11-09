import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exchange: vi.fn(), claims: vi.fn(), client: vi.fn(), origin: vi.fn(),
}));
vi.mock("@/config/supabase-server", () => ({ createAuthClient: mocked.client }));
vi.mock("@/config/env", () => ({ getAppOrigin: mocked.origin }));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.origin.mockReturnValue("http://localhost:3000");
  mocked.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocked.exchange, getClaims: mocked.claims } });
  mocked.exchange.mockResolvedValue({ error: null });
  mocked.claims.mockResolvedValue({ data: { claims: { sub: "synthetic-user" } }, error: null });
});

describe("Google OAuth callback", () => {
  it("code 교환과 claims 검증 뒤 설정된 origin으로만 복귀한다", async () => {
    const response = await GET(new Request("http://untrusted-host.test/auth/callback?code=synthetic-code&next=%2F%2Fevil.example"));
    expect(mocked.exchange).toHaveBeenCalledWith("synthetic-code");
    expect(mocked.claims).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("http://localhost:3000/survey");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("사용자 취소는 code 교환 없이 취소 안내로 복귀한다", async () => {
    const response = await GET(new Request("http://localhost:3000/auth/callback?error=access_denied&error_description=private-provider-detail"));
    expect(mocked.exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?state=cancelled");
  });
  it.each(["missing", "exchange", "claims", "network"])("%s 실패를 인증 성공으로 처리하지 않는다", async (failure) => {
    if (failure === "exchange") mocked.exchange.mockResolvedValue({ error: new Error("private-detail") });
    if (failure === "claims") mocked.claims.mockResolvedValue({ data: null, error: new Error("bad-token") });
    if (failure === "network") mocked.exchange.mockRejectedValue(new Error("network"));
    const response = await GET(new Request(`http://localhost:3000/auth/callback${failure === "missing" ? "" : "?code=synthetic"}`));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?state=error");
  });
  it("서버 origin 미설정은 요청 Host로 우회하지 않는다", async () => {
    mocked.origin.mockReturnValue(null);
    const response = await GET(new Request("https://evil.example/auth/callback?code=x"));
    expect(response.status).toBe(503);
    expect(mocked.exchange).not.toHaveBeenCalled();
  });
});
