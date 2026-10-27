import { expect, test } from "@playwright/test";

test("renders the Korean start screen without runtime errors or horizontal overflow", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("헬스미스");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "헬스미스", exact: true })).toBeVisible();
  await expect(page.getByText("프론트엔드 기본 화면이 준비되었습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "준비 완료" })).toBeVisible();
  await expect(page.getByRole("button", { name: "준비 완료" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('start-screen.png'), fullPage: true });
});
