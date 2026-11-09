"use server";

import { redirect } from "next/navigation";
import { getAppOrigin } from "@/config/env";
import { createAuthClient } from "@/config/supabase-server";
import { safeNextPath } from "@/lib/auth/redirects";

export async function signInWithGoogle(form: FormData) {
  const origin = getAppOrigin();
  const supabase = await createAuthClient(true);
  if (!origin || !supabase) redirect("/login?state=unavailable");

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(form.get("next")));
  let destination: string | null = null;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        scopes: "openid email profile",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (!error) destination = data.url;
  } catch {
    // 오류나 토큰을 URL/로그로 전달하지 않는다.
  }
  if (!destination) redirect("/login?state=error");
  redirect(destination);
}

export async function signOut() {
  const supabase = await createAuthClient(true);
  let failed = false;
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      failed = !!error;
    } catch {
      failed = true;
    }
  }
  redirect(failed ? "/login?state=error" : "/login");
}
