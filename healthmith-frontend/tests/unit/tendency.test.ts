import { describe, expect, it } from "vitest";
import { parseWorkoutTendency, tendencyStatusMessage } from "@/lib/healthmith/tendency";

const empty = { summary: null, updated_at: null, source_feedback_count: 0, latest_generation_status: "not_requested", latest_request_id: null };
const id = "40000000-0000-4000-8000-000000000001";

describe("성향 요약 API 계약", () => {
  it("요약 없음과 생성 대기를 구분한다", () => {
    expect(parseWorkoutTendency(empty)).toEqual(empty);
    const queued = { ...empty, latest_generation_status: "queued", latest_request_id: id };
    expect(parseWorkoutTendency(queued)).toEqual(queued);
    expect(tendencyStatusMessage("queued")).toContain("대기 중");
    expect(tendencyStatusMessage("running")).toContain("만들고 있어요");
  });
  it.each([
    null, [], {}, { ...empty, source_feedback_count: -1 }, { ...empty, source_feedback_count: 0.5 },
    { ...empty, summary: "" }, { ...empty, summary: "출처 없는 요약" },
    { ...empty, latest_generation_status: "completed" }, { ...empty, latest_generation_status: "running" },
    { ...empty, latest_request_id: id }, { ...empty, updated_at: "잘못된 날짜" },
  ])("불완전한 응답을 요약으로 표시하지 않는다: %j", (value) => {
    expect(parseWorkoutTendency(value)).toBeNull();
  });
});
