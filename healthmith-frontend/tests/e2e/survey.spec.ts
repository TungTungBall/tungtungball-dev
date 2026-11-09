import { expect, test, type Page } from "@playwright/test";

// /survey 화면 검사. E2E 서버에는 Supabase 설정이 없으므로 세션 없음 상태만 확인한다.
// 실제 Spring·DB 저장은 이 검사로 확인하지 않는다.

async function chooseBasics(page: Page) {
  await page.getByLabel("없어요").check();
  await page.locator('input[name="priority-parts"][value="하체"]').check();
  await page.locator('input[name="priority-parts"][value="상체"]').check();
  await page.getByLabel("체력", { exact: true }).check();
  await page.getByLabel(/운동 강도/).fill("5");
}

test.beforeEach(async ({ page }) => {
  const response = await page.goto("/survey");
  expect(response?.status()).toBe(200);
});

test("입력 칸·선택지·로그인 안내를 보여 주고 가로로 넘치지 않는다", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나에게 맞는 운동을 준비할게요");
  for (const purpose of ["체력", "감량", "근력", "자세", "자유 입력"]) {
    await expect(page.getByLabel(purpose, { exact: true })).toBeVisible();
  }
  await expect(page.locator('input[name="priority-parts"]')).toHaveCount(3);
  await expect(page.getByRole("note")).toContainText("로그인 후 저장할 수 있어요");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("우선 부위는 고른 순서대로 순위를 표시한다", async ({ page }) => {
  await page.locator('input[name="priority-parts"][value="허리"]').check();
  await page.locator('input[name="priority-parts"][value="상체"]').check();
  await expect(page.locator("label", { hasText: "허리" }).last()).toContainText("1");
  await expect(page.locator("label", { hasText: "상체" }).last()).toContainText("2");
});

test("빈 제출은 각 칸의 오류를 보여 주고 저장하지 않는다", async ({ page }) => {
  await page.getByRole("button", { name: "사전조사 저장" }).click();
  await expect(page.locator("#limitations-error")).toBeVisible();
  await expect(page.locator("#purpose-error")).toBeVisible();
  await expect(page.locator("#intensity-error")).toBeVisible();
  await expect(page.locator("#priorityParts-error")).toBeVisible();
  await expect(page.getByText("사전조사 내용을 저장했어요")).toHaveCount(0);
});

test("부위가 겹치면 우선 부위 수정 안내로 막고 선택을 그대로 둔다", async ({ page }) => {
  await chooseBasics(page);
  await page.getByLabel("있어요").check();
  await page.locator('input[name="limitation-parts"][value="하체"]').check();
  await page.getByRole("button", { name: "사전조사 저장" }).click();
  await expect(page.locator("#priorityParts-error")).toContainText("우선 부위를 수정해 주세요");
  await expect(page.locator('input[name="priority-parts"][value="하체"]')).toBeChecked();
});

test("강도 0·11은 강도 오류다", async ({ page }) => {
  await chooseBasics(page);
  for (const value of ["0", "11"]) {
    await page.getByLabel(/운동 강도/).fill(value);
    await page.getByRole("button", { name: "사전조사 저장" }).click();
    await expect(page.locator("#intensity-error")).toBeVisible();
  }
});

test("로그인 세션이 없으면 가짜 성공 없이 로그인 필요를 알리고 입력을 유지한다", async ({ page }) => {
  await chooseBasics(page);
  await page.getByRole("button", { name: "사전조사 저장" }).click();
  await expect(page.getByRole("status").last()).toContainText("로그인이 필요해요");
  await expect(page.getByText("사전조사 내용을 저장했어요")).toHaveCount(0);
  await expect(page.getByLabel(/운동 강도/)).toHaveValue("5");
  await expect(page).toHaveURL(/\/survey$/);
});
