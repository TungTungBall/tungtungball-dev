import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAppOrigin, getSupabaseAuthConfig } from "@/config/env";

export async function createAuthClient(writable = false) {
  const config = getSupabaseAuthConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: getAppOrigin()?.startsWith("https:") ?? false, path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) cookieStore.set(name, value, options);
        } catch (error) {
          if (writable) throw error;
          // Server Component 갱신은 proxy가 응답 쿠키로 전달한다.
        }
      },
    },
  });
}
