import "server-only";

import { createAuthClient } from "@/config/supabase-server";
import { readUserSession, type UserSession } from "@/config/session-state";

export type { UserSession } from "@/config/session-state";

/**
 * 서버 전용 로그인 세션 진입점 (실행 #15).
 * Server Component·Server Function에서만 호출한다. 토큰을 브라우저로 돌려보내지 않는다.
 * 토큰이 없을 때 시험용 토큰이나 가짜 성공으로 대신하지 않는다.
 */
export async function getUserSession(): Promise<UserSession> {
  const supabase = await createAuthClient();
  if (!supabase) return { state: "not-configured" };
  return readUserSession(supabase.auth);
}
