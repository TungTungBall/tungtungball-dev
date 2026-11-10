import { expect, test } from "@playwright/test";

// CI에는 실제 로그인·DB·Gemini 설정을 넣지 않는다. 이 파일은 진입 경로와
// 비로그인·잘못된 주소의 화면을 검사하며 실제 외부 서비스 검증을 대신하지 않는다.
test("홈 시작 버튼은 서버 저장용 사전조사로 연결한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "첫 여정 시작하기" }).click();
  await expect(page).toHaveURL(/\/survey$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나에게 맞는 운동을 준비할게요");
});

test("기록 기본 화면은 로그인 없이 예시를 실제 기록으로 보여 주지 않는다", async ({ page }) => {
  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "나의 운동 기록" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google로 로그인", exact: true })).toHaveAttribute("href", "/login?next=%2Frecords");
  await expect(page.getByText("11.02 ◆ 에메랄드", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "예시 기록 미리보기", exact: true }).click();
  await expect(page).toHaveURL(/\/records\?state=populated$/);
  await expect(page.getByText("표시된 기록은 디자인 예시예요.", { exact: true })).toBeVisible();
  await expect(page.getByText("11.02 ◆ 에메랄드", { exact: true })).toBeVisible();
});

test("생성 상태 조회는 로그인 없이 완료 초안을 만들지 않는다", async ({ page }) => {
  await page.goto("/routine/generation/10000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "초안을 불러오지 못했어요" })).toBeVisible();
  await expect(page.getByText("로그인 상태를 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(page.locator(".hm-routine-item")).toHaveCount(0);
});

test("잘못된 운동 세션 주소는 설문 대신 기록 복귀를 안내한다", async ({ page }) => {
  await page.goto("/feedback?sessionId=invalid");
  await expect(page.getByRole("heading", { name: "운동 세션을 확인할 수 없어요" })).toBeVisible();
  await expect(page.getByRole("link", { name: "운동 기록 보기" })).toHaveAttribute("href", "/records");
  await expect(page.getByRole("button", { name: "응답 저장하고 다음 초안 보기" })).toHaveCount(0);
});

test("비로그인 설문 제출은 입력을 보존하고 저장 성공으로 이동하지 않는다", async ({ page }) => {
  await page.goto("/feedback?sessionId=40000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "근육통 없음", exact: true }).click();
  await page.getByRole("button", { name: "난이도 3", exact: true }).click();
  await page.getByRole("button", { name: "재미 4", exact: true }).click();
  await page.getByRole("button", { name: "응답 저장하고 다음 초안 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "로그인 상태를 확인해 주세요." })).toBeVisible();
  await expect(page.getByRole("button", { name: "난이도 3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "오늘의 응답을 저장했어요" })).toHaveCount(0);
});
