import { expect, test, type Page } from "@playwright/test";

async function toLimitations(page: Page) {
  await page.goto("/survey");
  await page.getByRole("button", {name:"다음", exact:true}).click();
  await expect(page.locator(".hm-intake").getByRole("alert")).toContainText("운동 목표");
  for (const answer of ["체력 기르기", "가끔 해봤어요", "가벼운 루틴은 할 수 있어요"]) {
    await page.getByRole("button", {name:answer, exact:true}).click();
    await page.getByRole("button", {name:"다음", exact:true}).click();
  }
  await page.getByRole("button", {name:"20분", exact:true}).click();
  await page.getByRole("button", {name:"3회", exact:true}).click();
  await page.getByRole("button", {name:"다음", exact:true}).click();
}

test("8개 부위·세부 정보·제한 우선 안내를 보존하며 미지원 저장은 보내지 않는다", async ({page}, info) => {
  const mutations: string[] = [];
  page.on("request", r => {if (r.method() === "POST" || r.method() === "PATCH") mutations.push(r.url());});
  await toLimitations(page);
  for (const name of ["목", "어깨", "팔꿈치", "손목", "허리", "고관절", "무릎", "발목"]) await expect(page.getByRole("button", {name, exact:true})).toBeVisible();
  await expect(page.getByRole("button", {name:"기타", exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"없음", exact:true}).click();
  await page.getByRole("button", {name:"손목", exact:true}).click();
  await expect(page.getByRole("button", {name:"없음", exact:true})).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", {name:"다음", exact:true}).click();
  await expect(page.locator(".hm-intake").getByRole("alert")).toContainText("손목의 위치와 불편 정도");
  await page.getByRole("button", {name:"왼쪽", exact:true}).click();
  await page.getByRole("button", {name:"보통", exact:true}).click();
  await page.screenshot({path:info.outputPath("limitations.png"),fullPage:true});
  await page.getByRole("button", {name:"다음", exact:true}).click();
  await page.getByRole("button", {name:"손목", exact:true}).click();
  await expect(page.locator(".hm-intake").getByRole("status")).toContainText("제한 조건을 먼저 확인");
  await page.getByRole("button", {name:"입력 내용 확인", exact:true}).click();
  await expect(page.getByText("손목 · 왼쪽 · 보통", {exact:true})).toBeVisible();
  await expect(page.getByRole("button", {name:"저장 기능 준비 중"})).toBeDisabled();
  await page.getByRole("button", {name:"이전", exact:true}).click();
  await expect(page.getByRole("button", {name:"손목", exact:true})).toHaveAttribute("aria-pressed", "true");
  expect(mutations).toEqual([]);
});

test("없음으로 바꾸면 상세 부위를 지우고 선호도 없이 확인할 수 있다", async ({page}) => {
  await toLimitations(page);
  await page.getByRole("button", {name:"목", exact:true}).click();
  await expect(page.getByRole("button", {name:"중앙", exact:true})).toBeVisible();
  await page.getByRole("button", {name:"없음", exact:true}).click();
  await expect(page.getByRole("button", {name:"중앙", exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"다음", exact:true}).click();
  await page.getByRole("button", {name:"입력 내용 확인", exact:true}).click();
  await expect(page.getByRole("heading", {name:"입력 내용 확인"})).toBeVisible();
  await expect(page.getByText("선택 안 함", {exact:true})).toHaveCount(2);
});

test("새 설문은 일부 응답·선택 해제·건너뛰기가 가능하고 저장을 가장하지 않는다", async ({page}, info) => {
  const mutations: string[] = [];
  page.on("request", r => {if (r.method() === "POST") mutations.push(r.url());});
  await page.goto("/feedback?sessionId=40000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("link", {name:"기존 설문으로 응답하기"})).toHaveAttribute("href", /legacy=1$/);
  await page.getByRole("button", {name:"힘들었어요", exact:true}).click();
  await page.getByRole("button", {name:"힘들었어요", exact:true}).click();
  await expect(page.getByRole("button", {name:"힘들었어요", exact:true})).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", {name:"4", exact:true}).click();
  await page.getByLabel("자유 의견").fill("휴식 시간을 조금 더 주세요.");
  await expect(page.getByRole("button", {name:"응답 저장 준비 중"})).toBeDisabled();
  await page.screenshot({path:info.outputPath("feedback.png"), fullPage:true});
  await page.getByRole("link", {name:"건너뛰고 기록 보기"}).click();
  await expect(page).toHaveURL(/\/records$/);
  expect(mutations).toEqual([]);
});

test("320px에서 검정 배경·원티드 폰트와 읽을 수 있는 선택지를 유지한다", async ({page}) => {
  await page.setViewportSize({width:320,height:740});
  for (const route of ["/survey", "/survey/legacy", "/feedback"]) {
    await page.goto(route);
    await expect(page.locator(".hm-app")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(page.locator(".hm-app")).toHaveCSS("font-family", /wanted/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
