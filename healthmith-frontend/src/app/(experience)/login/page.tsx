import { getLoginPreviewState } from "@/lib/healthmith/login-preview";
import { LoginView } from "./login-view";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const state = getLoginPreviewState((await searchParams).state);
  return <LoginView key={state} initialState={state} />;
}
