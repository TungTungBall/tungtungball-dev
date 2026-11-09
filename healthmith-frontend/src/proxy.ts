import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppOrigin, getSupabaseAuthConfig } from "@/config/env";

/** 서버 렌더링 전에 갱신 쿠키를 요청과 응답 모두에 전달한다. 인가 검증은 각 서버 기능에서도 수행한다. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseAuthConfig();
  if (!config || !request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) return response;

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: getAppOrigin()?.startsWith("https:") ?? false, path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  try { await supabase.auth.getClaims(); } catch { /* 세션 조회에서 unavailable/signed-out으로 처리한다. */ }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/login", "/survey/:path*"] };
