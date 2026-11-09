// 로그인 세션 판정 규칙. Next.js·쿠키에 의존하지 않아 단위 테스트로 확인할 수 있다.
// 실제 쿠키 읽기는 session.ts가 맡는다.

export type UserSession =
  | { state: "authenticated"; accessToken: string }
  | { state: "signed-out" }
  | { state: "not-configured" }
  | { state: "unavailable" };

type AuthResult<T> = { data: T; error: unknown };

/** session.ts가 넘기는 Supabase auth의 필요한 부분만. */
export type SessionAuthClient = {
  getSession(): Promise<AuthResult<{ session: { access_token: string } | null }>>;
  getClaims(jwt?: string): Promise<AuthResult<{ claims: { sub?: unknown } } | null>>;
};

/**
 * 쿠키의 세션을 꺼낸 뒤 서명·만료를 검증한 토큰만 돌려준다.
 * 검증하지 못한 토큰을 '로그인됨'으로 넘기지 않는다. 최종 소유자 확인은 Spring이 다시 한다.
 */
export async function readUserSession(auth: SessionAuthClient): Promise<UserSession> {
  try {
    const { data, error } = await auth.getSession();
    if (error) return { state: "unavailable" };
    const accessToken = data.session?.access_token;
    if (!accessToken) return { state: "signed-out" };

    const claims = await auth.getClaims(accessToken);
    if (claims.error || !claims.data) return { state: "signed-out" };
    const subject = claims.data.claims.sub;
    if (typeof subject !== "string" || subject.length === 0) return { state: "signed-out" };

    return { state: "authenticated", accessToken };
  } catch {
    return { state: "unavailable" };
  }
}
