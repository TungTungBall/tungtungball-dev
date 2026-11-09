import { describe, expect, it } from "vitest";

import { readUserSession, type SessionAuthClient } from "@/config/session-state";

// 실행 #15 로그인 세션 판정. 실제 Supabase 연결이 아니라 auth 대역이다.

function auth(overrides: Partial<{ token: string | null; sessionError: boolean; claimsError: boolean; sub: unknown; throws: boolean }>): SessionAuthClient {
  const { token = "token", sessionError = false, claimsError = false, sub = "20000000-0000-4000-8000-000000000001", throws = false } = overrides;
  return {
    async getSession() {
      if (throws) throw new Error("network");
      return { data: { session: token ? { access_token: token } : null }, error: sessionError ? new Error("x") : null };
    },
    async getClaims() {
      return claimsError ? { data: null, error: new Error("bad signature") } : { data: { claims: { sub } }, error: null };
    },
  };
}

describe("readUserSession", () => {
  it("서명 검증을 통과한 토큰만 authenticated다", async () => {
    expect(await readUserSession(auth({}))).toEqual({ state: "authenticated", accessToken: "token" });
  });

  it("세션이 없으면 signed-out이다", async () => {
    expect(await readUserSession(auth({ token: null }))).toEqual({ state: "signed-out" });
  });

  it("만료·변조로 검증에 실패하면 토큰을 돌려주지 않는다", async () => {
    expect(await readUserSession(auth({ claimsError: true }))).toEqual({ state: "signed-out" });
  });

  it("sub가 비었거나 문자열이 아니면 signed-out이다", async () => {
    expect(await readUserSession(auth({ sub: "" }))).toEqual({ state: "signed-out" });
    expect(await readUserSession(auth({ sub: 42 }))).toEqual({ state: "signed-out" });
  });

  it("세션 읽기 오류·예외는 unavailable이다", async () => {
    expect(await readUserSession(auth({ sessionError: true }))).toEqual({ state: "unavailable" });
    expect(await readUserSession(auth({ throws: true }))).toEqual({ state: "unavailable" });
  });
});
