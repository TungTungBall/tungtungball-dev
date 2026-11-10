import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ oauth: vi.fn(), signout: vi.fn(), client: vi.fn(), origin: vi.fn() }));
vi.mock("@/config/supabase-server", () => ({ createAuthClient: mocked.client }));
vi.mock("@/config/env", () => ({ getAppOrigin: mocked.origin }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { signInWithGoogle, signOut } from "@/app/auth/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.origin.mockReturnValue("http://localhost:3000");
  mocked.client.mockResolvedValue({ auth: { signInWithOAuth: mocked.oauth, signOut: mocked.signout } });
  mocked.oauth.mockResolvedValue({ data: { url: "https://synthetic.supabase.co/auth/v1/authorize" }, error: null });
  mocked.signout.mockResolvedValue({ error: null });
});

describe("Google 로그인 서버 기능", () => {
  it("Google 최소 로그인 scope와 PKCE callback을 사용한다", async () => {
    const form = new FormData(); form.set("next", "//evil.example");
    await expect(signInWithGoogle(form)).rejects.toThrow("REDIRECT:https://synthetic.supabase.co/auth/v1/authorize");
    expect(mocked.oauth).toHaveBeenCalledWith({ provider: "google", options: {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Fsurvey", scopes: "openid email profile", skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    } });
    expect(mocked.client).toHaveBeenCalledWith(true);
  });
  it("설정이 없으면 외부 로그인으로 이동하지 않는다", async () => {
    mocked.client.mockResolvedValue(null);
    await expect(signInWithGoogle(new FormData())).rejects.toThrow("REDIRECT:/login?state=unavailable");
    expect(mocked.oauth).not.toHaveBeenCalled();
  });
  it("provider 오류는 비밀을 노출하지 않는 오류 화면으로 복귀한다", async () => {
    mocked.oauth.mockResolvedValue({ data: { url: null }, error: new Error("private-detail") });
    await expect(signInWithGoogle(new FormData())).rejects.toThrow("REDIRECT:/login?state=error");
  });
  it("현재 브라우저 세션을 로그아웃한다", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(mocked.signout).toHaveBeenCalledWith({ scope: "local" });
  });
});
