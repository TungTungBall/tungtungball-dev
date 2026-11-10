import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), backend: vi.fn() }));
vi.mock("@/config/session", () => ({ getUserSession: mocks.session }));
vi.mock("@/lib/backend-api", () => ({ fetchBackendApi: mocks.backend }));
import { ConnectedRecordsView } from "@/app/(experience)/records/connected-records";

const id = "40000000-0000-4000-8000-000000000001";
const record = { session_id: id, result: "completed", ended_at: "2026-11-10T01:00:00Z", completed_stage_count: 5, feedback_status: "not_submitted" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ state: "authenticated", accessToken: "synthetic-token" });
  mocks.backend.mockImplementation(async (path: string) => {
    if (path.startsWith("me/workout-records")) return Response.json({ items: [record], next_cursor: null, has_more: false });
    if (path === "me/workout-stats") return Response.json({ completed_sessions: 1, abandoned_sessions: 0, current_streak_days: null });
    if (path === "me/workout-tendency") return Response.json({ summary: null, updated_at: null, source_feedback_count: 0, latest_generation_status: "not_requested", latest_request_id: null });
    return Response.json({ items: [], next_cursor: null, has_more: false });
  });
});

describe("조회한 운동 기록의 표시", () => {
  it("로그인이 없으면 실제 기록 조회 없이 로그인과 별도 예시 화면을 안내한다", async () => {
    mocks.session.mockResolvedValue({ state: "anonymous" });
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain("나의 운동 기록");
    expect(html).toContain("/records?state=populated");
    expect(html).not.toContain("11.02 ◆ 에메랄드");
    expect(mocks.backend).not.toHaveBeenCalled();
  });

  it("완료하고 설문을 아직 쓰지 않은 운동만 해당 세션 설문으로 연결한다", async () => {
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain(`/feedback?sessionId=${id}`);
    expect(html).toContain("—일");
    expect(html).not.toContain("synthetic-token");
    expect(mocks.backend.mock.calls.map(([path]) => path)).toEqual(["me/workout-records?limit=20", "me/workout-stats", "me/gems?limit=8", "me/workout-tendency"]);
  });

  it.each(["abandoned", "submitted"])("포기했거나 설문이 끝난 운동은 제출 링크를 표시하지 않는다: %s", async (state) => {
    mocks.backend.mockImplementation(async (path: string) => {
      if (path.startsWith("me/workout-records")) return Response.json({ items: [{ ...record, result: state === "abandoned" ? state : "completed", feedback_status: state === "submitted" ? state : "not_submitted" }] });
      if (path === "me/workout-stats") return Response.json({ completed_sessions: 1, abandoned_sessions: 1, current_streak_days: null });
      return Response.json({ items: [] });
    });
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).not.toContain(`/feedback?sessionId=${id}`);
    expect(html).toContain(state === "abandoned" ? "포기한 운동은 설문 없이 마무리돼요." : "설문 완료");
  });

  it("조회가 실패하면 예시나 빈 성공 기록 대신 오류를 표시한다", async () => {
    mocks.backend.mockResolvedValue(new Response(null, { status: 500 }));
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain("기록을 불러오지 못했어요");
    expect(html).not.toContain("아직 저장된 운동 기록이 없어요.");
  });
});


describe("성향 요약과 기록을 분리해서 표시", () => {
  it("실제 요약과 출처 건수를 표시하고 생성 실패 때도 기존 요약을 유지한다", async () => {
    const fallback = mocks.backend.getMockImplementation()!;
    mocks.backend.mockImplementation(async (path: string, ...args: unknown[]) => path === "me/workout-tendency"
      ? Response.json({ summary: "천천히 운동할 때 더 즐거웠어요. <script>unsafe</script>", updated_at: "2026-11-10T01:00:00Z", source_feedback_count: 3, latest_generation_status: "failed", latest_request_id: id })
      : fallback(path, ...args));
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain("천천히 운동할 때 더 즐거웠어요.");
    expect(html).toContain("설문 3건");
    expect(html).toContain("새 요약을 만들지 못했어요.");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it.each(["network", "malformed", "forbidden", "unauthorized"])("요약 %s 오류가 나도 운동 기록을 감추지 않는다", async (failure) => {
    const fallback = mocks.backend.getMockImplementation()!;
    mocks.backend.mockImplementation(async (path: string, ...args: unknown[]) => {
      if (path !== "me/workout-tendency") return fallback(path, ...args);
      if (failure === "network") throw new Error("synthetic-token");
      return failure === "malformed" ? Response.json({ summary: "잘못된 요약" }) : new Response(null, { status: failure === "forbidden" ? 403 : 401 });
    });
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain(`/feedback?sessionId=${id}`);
    expect(html).toContain(failure === "unauthorized" ? "다시 로그인" : "요약을 불러오지 못했어요.");
    expect(html).not.toContain("synthetic-token");
    expect(html).not.toContain("잘못된 요약");
  });

  it("전체 완료 횟수가 없을 때 조회한 일부 기록으로 전체를 추측하지 않는다", async () => {
    const fallback = mocks.backend.getMockImplementation()!;
    mocks.backend.mockImplementation(async (path: string, ...args: unknown[]) => path === "me/workout-stats"
      ? Response.json({ completed_sessions: null, abandoned_sessions: null, current_streak_days: null }) : fallback(path, ...args));
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain("—회");
    expect(html).not.toContain("<strong>1회</strong>");
  });
});
