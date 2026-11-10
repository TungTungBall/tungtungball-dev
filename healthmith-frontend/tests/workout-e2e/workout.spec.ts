import { expect, test, type Page } from "@playwright/test";

let requestId: string, curriculumId: string, ownerToken: string;
test.beforeEach(async ({ context, request }) => {
  const reset = await request.post("http://127.0.0.1:8091/test/reset");
  expect(reset.ok()).toBe(true);
  ({ requestId, curriculumId } = await reset.json());
  const session = await (await request.get("http://127.0.0.1:8091/test/session")).json();
  ownerToken = session.token;
  await context.addCookies([{ name: "sb-127-auth-token", value: session.cookie, url: "http://127.0.0.1:3000", httpOnly: true, sameSite: "Lax" }]);
});

async function begin(page: Page) {
  await page.goto(`/routine/generation/${requestId}`);
  const confirm = page.getByRole("button", { name: "이 루틴 확정하고 준비하기" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox").check(); await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/camera\\?curriculumId=${curriculumId}`));
  await page.getByRole("button", { name: "카메라 허용하고 운동 시작" }).click();
  await expect(page).toHaveURL(/\/workout\?sessionId=/);
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
  return new URL(page.url()).searchParams.get("sessionId")!;
}

async function syntheticPose(page: Page) {
  // 카메라/관절 입력만 대체한다. 서버 액션·JWT·Spring·R2DBC·DB는 실제 경로다.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    let angle = 160;
    window.addEventListener("fixture-angle", (event) => { angle = (event as CustomEvent<number>).detail; });
    window.Worker = class extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url) !== "/pose-worker.js") { super(url, options); return; }
        // 격리 테스트에만 있는 빈 worker로 실제 Worker 계약을 유지한다.
        super(URL.createObjectURL(new Blob([""], { type: "text/javascript" })));
      }
      postMessage(data: { type: string; frame?: ImageBitmap; time?: number }) {
        if (data.type === "init") setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { type: "ready" } })), 0);
        else if (data.type === "frame") {
          data.frame?.close();
          const p = (x: number, y: number) => ({ x, y, z: 0, visibility: 1, in_frame: true });
          const points = [p(1, 0), p(0, 0), p(Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180))];
          setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { type: "pose", points, time: data.time } })), 0);
        }
      }
    };
  });
}

async function repetition(page: Page) {
  await expect(page.getByRole("status")).toContainText("움직임을 측정");
  await page.waitForTimeout(220);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-angle", { detail: 80 })));
  await page.waitForTimeout(220);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-angle", { detail: 160 })));
}

test("실제 MediaPipe WASM·모델을 worker에서 기동하고 카메라를 일시정지·복원한다", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const id = await begin(page);
  await expect(page.getByRole("status")).toContainText(/주요 관절|움직임을 측정/, { timeout: 30_000 });
  let hidWhileSaving = false;
  await page.route("**/workout?sessionId=*", async (route) => {
    if (!hidWhileSaving && route.request().method() === "POST" && route.request().postData()?.includes('"pause"')) {
      hidWhileSaving = true;
      const response = await route.fetch();
      // 수동 중단 응답 대기 중 화면 숨김 중단도 큐에 들어오는 경합을 재현한다.
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "잠시 쉬어가기" }).click();
  await expect(page.getByRole("heading", { name: "잠시 쉬고 있어요" })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); });
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이어서 운동하기" }).click();
  await expect(page.getByRole("heading", { name: "광석 채굴", exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await (await request.get(`http://127.0.0.1:8081/api/workout-sessions/${id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
  expect(resumed).toMatchObject({ status: "in_progress", version: 3 });
  expect(hidWhileSaving).toBe(true);
  await page.getByRole("button", { name: "잠시 쉬어가기" }).click();
  await expect(page.getByRole("heading", { name: "잠시 쉬고 있어요" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이번 운동 포기하기" }).click();
  await expect(page).toHaveURL(new RegExp(`/workout/complete\\?sessionId=${id}`));
  await expect(page.getByText("포기한 운동은 설문 없이 마무리돼요.")).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘의 운동 느낌 남기기" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("카메라 반복 신호→실제 5단계 완료→보석·설문·기록까지 저장한다", async ({ page, request }, info) => {
  await syntheticPose(page);
  const id = await begin(page);
  for (let stage = 1; stage <= 5; stage++) {
    await expect(page.locator(".hm-eyebrow")).toContainText(`STAGE ${stage} / 5`);
    await repetition(page);
    if (stage < 5) await expect(page.locator(".hm-eyebrow")).toContainText(`STAGE ${stage + 1} / 5`);
  }
  await expect(page).toHaveURL(new RegExp(`/workout/complete\\?sessionId=${id}`));
  await expect(page.getByText("5 / 5 단계 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "완성된 보석" })).toBeVisible();
  await page.getByRole("link", { name: "오늘의 운동 느낌 남기기" }).click();
  await expect(page).toHaveURL(new RegExp(`/feedback\\?sessionId=${id}`));
  await page.getByRole("button", { name: "근육통 없음", exact: true }).click();
  await page.getByRole("button", { name: "난이도 3", exact: true }).click();
  await page.getByRole("button", { name: "재미 4", exact: true }).click();
  await page.getByRole("button", { name: "응답 저장하고 다음 초안 보기" }).click();
  await expect(page.getByRole("heading", { name: "오늘의 응답을 저장했어요" })).toBeVisible();
  await page.goto("/records");
  await expect(page.getByText("설문 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("완성된 보석", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("saved-workout-record.png"), fullPage: true });
  // 제공받은 MVP allow_reuse=true 정책에서 이전 시작 영수증으로 되돌아가지 않는다.
  expect((await request.post("http://127.0.0.1:8091/test/allow-reuse")).ok()).toBe(true);
  await page.goto(`/camera?curriculumId=${curriculumId}`);
  await page.getByRole("button", { name: "카메라 허용하고 운동 시작" }).click();
  await expect(page).toHaveURL(/\/workout\?sessionId=/);
  expect(new URL(page.url()).searchParams.get("sessionId")).not.toBe(id);
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
});

test("반복 저장 응답 유실 후 같은 이벤트 재시도는 횟수를 두 번 올리지 않는다", async ({ page, request }) => {
  await syntheticPose(page);
  const id = await begin(page);
  let dropped = false;
  await page.route("**/workout?sessionId=*", async (route) => {
    const body = route.request().postData();
    if (!dropped && route.request().method() === "POST" && body?.startsWith(`["${id}",1,1,`)) {
      dropped = true;
      await route.fetch(); // 실제 서버의 저장을 완료한 다음 브라우저 응답만 유실시킨다.
      await route.abort("failed");
    } else await route.continue();
  });
  await repetition(page);
  await expect(page.getByRole("button", { name: "같은 요청 결과 다시 확인" })).toBeVisible();
  await page.getByRole("button", { name: "같은 요청 결과 다시 확인" }).click();
  await expect(page.locator(".hm-eyebrow")).toContainText("STAGE 2 / 5");
  const saved = await (await request.get(`http://127.0.0.1:8081/api/workout-sessions/${id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
  expect(saved).toMatchObject({ version: 2, current_stage_index: 2, current_repetitions: 0, completed_stage_count: 1 });
  expect(dropped).toBe(true);
});

test("다른 사용자에게 세션·운동 결과를 공개하지 않는다", async ({ page, context, request }) => {
  await syntheticPose(page);
  const id = await begin(page);
  await page.getByRole("button", { name: "잠시 쉬어가기" }).click();
  await expect(page.getByRole("heading", { name: "잠시 쉬고 있어요" })).toBeVisible();
  const other = await (await request.get("http://127.0.0.1:8091/test/session?other=1")).json();
  await context.addCookies([{ name: "sb-127-auth-token", value: other.cookie, url: "http://127.0.0.1:3000", httpOnly: true, sameSite: "Lax" }]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "운동을 불러오지 못했어요" })).toBeVisible();
  await expect(page.getByText("0 / 1", { exact: true })).toHaveCount(0);
  await page.goto(`/workout/complete?sessionId=${id}`);
  await expect(page.getByRole("heading", { name: "운동 결과를 불러오지 못했어요" })).toBeVisible();
});

test("카메라 권한 거절은 실제 세션을 만들거나 단계를 진행시키지 않는다", async ({ page, request }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("test-only", "NotAllowedError"));
  });
  await page.goto(`/routine/generation/${requestId}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "이 루틴 확정하고 준비하기" }).click();
  await page.getByRole("button", { name: "카메라 허용하고 운동 시작" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "카메라 권한을 허용해야" })).toBeVisible();
  const current = await (await request.get("http://127.0.0.1:8081/api/workout-sessions/current", { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
  expect(current.session).toBeNull();
  await expect(page).toHaveURL(/\/camera\?curriculumId=/);
});

test("30초 무동작은 저장한 단계·횟수를 유지한 채 자동 일시정지한다", async ({ page, request }) => {
  await syntheticPose(page);
  await page.clock.install();
  const id = await begin(page);
  await expect(page.getByRole("status")).toContainText("움직임을 측정");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("heading", { name: "잠시 쉬고 있어요" })).toBeVisible();
  const saved = await (await request.get(`http://127.0.0.1:8081/api/workout-sessions/${id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
  expect(saved).toMatchObject({ status: "paused", current_stage_index: 1, current_repetitions: 0, completed_stage_count: 0 });
});
