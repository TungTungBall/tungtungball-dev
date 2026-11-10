import { describe, expect, it, vi } from "vitest";
import { getSurvey, patchSurvey } from "@/app/survey/submit";
import type { SurveyAnswers } from "@/app/survey/types";

const id = "10000000-0000-4000-8000-000000000001";
const answers: SurveyAnswers = { physical_limitations: { present: false, body_parts: [] }, purpose: { type: "자유 입력", custom_text: "  오래 걷기  " }, intensity: 5, priority_body_parts: ["하체", "상체"] };
const detail = { id, answers, generation_request_status: "prepared", created_at: "2026-11-10T00:00:00Z", version: 2 };

describe("사전조사 조회·수정", () => {
  it("본인 조회 결과의 버전과 자유 입력·우선순위 원문을 보존한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(detail));
    expect(await getSurvey("https://backend.example", "synthetic-token", id, fetcher)).toEqual({ state: "loaded", submission: detail });
    expect(String(fetcher.mock.calls[0][0])).toBe(`https://backend.example/api/survey-submissions/${id}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", redirect: "error", headers: { Authorization: "Bearer synthetic-token" } });
  });

  it("PATCH는 기대 버전과 입력을 보내고 응답의 새 버전을 사용한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...detail, version: 3 }));
    expect(await patchSurvey("https://backend.example", "synthetic-token", id, 2, answers, fetcher)).toEqual({ state: "loaded", submission: { ...detail, version: 3 } });
    const request = fetcher.mock.calls[0][1];
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toEqual({ answers, expected_version: 2 });
    expect(request.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("버전 충돌은 최신 내용을 불러와야 하는 상태로 구분한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "VERSION_CONFLICT", message: "x" }, { status: 409 }));
    expect((await patchSurvey("https://backend.example", "token", id, 2, answers, fetcher)).state).toBe("conflict");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...detail, id: "other" }, { ...detail, version: 0 }, { ...detail, version: 1.5 },
    { ...detail, user_id: "private" }, { ...detail, created_at: "invalid" },
  ])("다른 ID·깨진 상세 응답은 화면에 반환하지 않는다", async (body) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    expect((await getSurvey("https://backend.example", "token", id, fetcher)).state).toBe("failed");
  });

  it("유효하지 않은 버전은 요청하지 않고 네트워크 실패는 재시도하지 않는다", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private"));
    expect((await patchSurvey("https://backend.example", "token", id, 0, answers, fetcher)).state).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await patchSurvey("https://backend.example", "token", id, 2, answers, fetcher)).state).toBe("failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
