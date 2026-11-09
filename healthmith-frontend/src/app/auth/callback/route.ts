import { NextResponse } from "next/server";
import { getAppOrigin } from "@/config/env";
import { createAuthClient } from "@/config/supabase-server";
import { safeNextPath } from "@/lib/auth/redirects";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getAppOrigin();
  if (!origin) return new NextResponse("로그인 설정을 확인해 주세요.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (url.searchParams.has("error")) {
    return finish(url.searchParams.get("error") === "access_denied" ? "/login?state=cancelled" : "/login?state=error");
  }
  const code = url.searchParams.get("code");
  if (!code) return finish("/login?state=error");
  const supabase = await createAuthClient(true);
  if (!supabase) return finish("/login?state=unavailable");
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const verified = await supabase.auth.getClaims();
      if (!verified.error && verified.data?.claims.sub) return finish(safeNextPath(url.searchParams.get("next")));
    }
  } catch {
    // Provider 내부 메시지와 authorization code를 응답에 포함하지 않는다.
  }
  return finish("/login?state=error");
}
