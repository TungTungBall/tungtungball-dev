import { expect, test } from "@playwright/test";

test("Google 로그인 화면에 실제 로그인 양식과 사전조사 복귀 경로가 있다", async ({ page }) => {
  await page.goto("/login?next=%2Fsurvey");
  await expect(page.getByRole("heading", { name: "나의 여정으로 들어가기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
  await expect(page.locator('input[name="next"]')).toHaveValue("/survey");
  await expect(page.getByText("실제 Google 로그인은 연결 전이에요.")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("OAuth code 누락은 로그인 성공 대신 오류로 복귀하고 캐시하지 않는다", async ({ request }) => {
  const response = await request.get("/auth/callback?next=https://evil.example", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("http://127.0.0.1:3000/login?state=error");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("Google 동의 취소는 외부 오류 상세를 노출하지 않는다", async ({ request }) => {
  const response = await request.get("/auth/callback?error=access_denied&error_description=synthetic-private-detail", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("http://127.0.0.1:3000/login?state=cancelled");
  expect(await response.text()).not.toContain("synthetic-private-detail");
});
