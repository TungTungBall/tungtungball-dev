import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAuthConfig } from "@/config/env";
import { readUserSession, type UserSession } from "@/config/session-state";

export type { UserSession } from "@/config/session-state";

/**
 * 서버 전용 로그인 세션 진입점 (실행 #15).
 * Server Component·Server Function에서만 호출한다. 토큰을 브라우저로 돌려보내지 않는다.
 * 로그인 화면(구글 로그인)은 아직 없으므로 지금은 대부분 signed-out이 나온다.
 * 토큰이 없을 때 시험용 토큰이나 가짜 성공으로 대신하지 않는다.
 */
export async function getUserSession(): Promise<UserSession> {
  const config = getSupabaseAuthConfig();
  if (!config) return { state: "not-configured" };

  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Component에서는 쿠키를 쓸 수 없다. 토큰 갱신 쿠키는 Server Function·Route Handler에서만 저장된다.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 렌더링 중 호출이면 무시한다. 다음 요청에서 다시 갱신한다.
        }
      },
    },
  });

  return readUserSession(supabase.auth);
}
