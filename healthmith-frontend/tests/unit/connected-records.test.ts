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
    return Response.json({ items: [], next_cursor: null, has_more: false });
  });
});

describe("조회한 운동 기록의 표시", () => {
  it("완료하고 설문을 아직 쓰지 않은 운동만 해당 세션 설문으로 연결한다", async () => {
    const html = renderToStaticMarkup(await ConnectedRecordsView());
    expect(html).toContain(`/feedback?sessionId=${id}`);
    expect(html).toContain("—일");
    expect(html).not.toContain("synthetic-token");
    expect(mocks.backend.mock.calls.map(([path]) => path)).toEqual(["me/workout-records?limit=20", "me/workout-stats", "me/gems?limit=8"]);
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
