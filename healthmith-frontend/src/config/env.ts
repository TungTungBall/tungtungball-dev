// 환경변수는 이 파일에서만 읽는다 (docs/CODE-STYLE.md 6번).
// Next.js 서버 전용 값이다. 브라우저 코드("use client")에서 가져다 쓰지 않는다.

const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:8080";

/** Spring 백엔드 기본 주소. 설정하지 않으면 로컬 백엔드 주소를 쓴다. */
export function getBackendApiUrl(): string {
  return process.env.BACKEND_API_URL ?? DEFAULT_BACKEND_API_URL;
}

export type SupabaseAuthConfig = {
  url: string;
  publishableKey: string;
};

/**
 * 로그인 세션을 읽을 Supabase 설정. 백엔드와 같은 이름을 쓴다.
 * 둘 중 하나라도 비어 있으면 null을 돌려주고, 호출한 쪽은 '세션 없음'으로 처리한다.
 */
export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
