import { connection } from "next/server";
import { getAppOrigin, getSupabaseAuthConfig } from "@/config/env";
import { getUserSession } from "@/config/session";
import { safeNextPath } from "@/lib/auth/redirects";
import { getLoginPreviewState } from "@/lib/healthmith/login-preview";
import { LoginView } from "./login-view";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ state?: string | string[]; next?: string | string[] }> }) {
  await connection();
  const params = await searchParams;
  const configured = !!getSupabaseAuthConfig() && !!getAppOrigin();
  const session = await getUserSession();
  const state = configured ? getLoginPreviewState(params.state) : "unavailable";
  return <LoginView key={state} initialState={state} configured={configured} signedIn={session.state === "authenticated"} nextPath={safeNextPath(params.next)} />;
}
