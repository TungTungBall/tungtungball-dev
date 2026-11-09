import { expect, test } from "@playwright/test";

test("smoke: 모바일 V2 홈을 오류나 가로 넘침 없이 표시한다", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("헬스미스");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "움직일수록, 보석처럼 빛나게." })).toBeVisible();
  await expect(page.getByRole("link", { name: "첫 여정 시작하기" })).toBeVisible();
  await expect(page.getByRole("img", { name: "빛나는 에메랄드 보석" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("start-screen.png"), fullPage: true });
});

test.describe("US-01 사전조사 입력 · 퍼블리싱 미리보기", () => {
  test("(실패·거절) 부위 충돌·빈 자유 입력을 막고 확인 후 다음 화면으로 이동한다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "첫 여정 시작하기" }).click();
    await page.getByRole("button", { name: "있어요", exact: true }).click();
    await page.getByRole("button", { name: "제약 부위 허리", exact: true }).click();
    await page.getByRole("button", { name: "목표 정하러 가기" }).click();
    await expect(page.locator("#body-error")).toContainText("우선 부위를 수정해 주세요");
    await expect(page).toHaveURL(/preparation\/body$/);
    await page.getByRole("button", { name: "우선 부위 허리", exact: true }).click();
    await page.getByRole("button", { name: "목표 정하러 가기" }).click();
    await page.getByRole("button", { name: "자유 입력", exact: true }).click();
    await page.getByRole("button", { name: "나의 커리큘럼 초안 만들기" }).click();
    await expect(page.locator("#purpose-error")).toContainText("직접 목표를 적어주세요");
    await page.getByRole("textbox", { name: "직접 운동 목표 입력" }).fill("꾸준하게 움직이고 싶어요");
    await page.getByRole("button", { name: "운동 강도 7", exact: true }).click();
    await page.getByRole("button", { name: "나의 커리큘럼 초안 만들기" }).click();
    await expect(page.getByRole("heading", { name: "오늘의 운동 설계도" })).toBeVisible();
    await expect(page.getByText("나의 목표 · 강도 7")).toBeVisible();
    const confirm = page.getByRole("button", { name: "이 루틴 확정하고 준비하기" });
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox").check();
    await confirm.click();
    await expect(page.getByRole("heading", { name: "세공을 시작할 준비" })).toBeVisible();
  });
});

test("smoke: 일시정지·재개는 횟수를 보존하고 포기 후 재개·설문을 막는다", async ({ page }) => {
  await page.goto("/workout");
  await expect(page.getByText("08 / 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "잠시 쉬어가기" }).click();
  await expect(page.getByText(/광석 채굴 · 8 \/ 10회/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "지금은 잠시 쉬는 중이에요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+1회 미리보기", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "일시정지 화면으로 돌아가기" }).click();
  await page.getByRole("button", { name: "이어서 운동하기" }).click();
  await expect(page.getByText("08 / 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+1회 미리보기", exact: true }).click();
  await expect(page.getByText("09 / 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "잠시 쉬어가기" }).click();
  await page.getByRole("button", { name: "이번 운동 포기하기" }).click();
  await expect(page.getByText("0 / 5 포기", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("link", { name: "화면 둘러보기" }).click();
  await page.getByRole("link", { name: /오늘의 여정은 어땠나요/ }).click();
  await expect(page.getByText("포기한 운동은 설문 없이 마무리돼요.")).toBeVisible();
});

test("smoke: 보석 12종이 로컬 SVG로 표시되고 상태를 선택할 수 있다", async ({ page }) => {
  await page.goto("/gems");
  await expect(page.locator("[data-gem-state]")).toHaveCount(12);
  await page.getByRole("button", { name: "금이 간 보석", exact: true }).click();
  await expect(page.getByRole("heading", { name: "금이 간 보석", exact: true, level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "진행 단계", exact: true }).click();
  await expect(page.locator("[data-gem-state]")).toHaveCount(6);
  const valid = await page.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalWidth === image.naturalHeight));
  expect(valid).toBe(true);
});

test("smoke: 모바일 12개 화면과 기록 상태에 오류나 가로 넘침이 없다", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/preparation/body", "/preparation/goals", "/routine", "/camera", "/workout", "/workout/paused", "/workout/complete", "/feedback", "/records", "/camera/permission", "/recovery", "/records?state=empty", "/records?state=loading", "/records?state=error", "/design"]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/preparation/body");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("body-320.png"), fullPage: true });
  expect(errors).toEqual([]);
});
