import { describe, expect, it, vi } from "vitest";

import { parseSubmitResponse } from "@/app/survey/response";
import { buildSubmitUrl, postSurvey } from "@/app/survey/submit";
import type { SurveyAnswers } from "@/app/survey/types";

const sent: SurveyAnswers = {
  physical_limitations: { present: true, body_parts: ["허리"] },
  purpose: { type: "자유 입력", custom_text: "  오래 걷고 싶다  " },
  intensity: 10,
  priority_body_parts: ["하체", "상체"],
};

const created = {
  id: "10000000-0000-4000-8000-000000000002",
  answers: sent,
  generation_request_status: "prepared",
  created_at: "2026-11-02T05:00:00Z",
};

describe("parseSubmitResponse", () => {
  it("계약에 맞는 201만 저장 성공이다", () => {
    expect(parseSubmitResponse(201, created, sent)).toEqual({ state: "saved", submission: created });
  });

  it.each([
    ["prepared가 아님", { ...created, generation_request_status: "done" }],
    ["id가 UUID가 아님", { ...created, id: "1" }],
    ["created_at 없음", { ...created, created_at: undefined }],
    ["우선 부위 순서가 바뀜", { ...created, answers: { ...sent, priority_body_parts: ["상체", "하체"] } }],
    ["자유 입력 원문이 바뀜", { ...created, answers: { ...sent, purpose: { type: "자유 입력", custom_text: "오래 걷고 싶다" } } }],
    ["user_id 노출", { ...created, user_id: "20000000-0000-4000-8000-000000000001" }],
    ["본문이 배열", [created]],
  ])("201이어도 %s이면 저장 여부 불명으로 둔다", (_, body) => {
    expect(parseSubmitResponse(201, body, sent).state).toBe("unknown");
  });

  it("400 INVALID_SURVEY는 field_errors와 함께 입력 오류다", () => {
    const body = {
      code: "INVALID_SURVEY",
      message: "입력 내용을 확인해 주세요.",
      field_errors: [{ field: "answers.priority_body_parts", code: "BODY_PART_CONFLICT", message: "우선 부위를 수정해 주세요." }],
    };
    expect(parseSubmitResponse(400, body, sent)).toEqual({ state: "invalid", message: body.message, fieldErrors: body.field_errors });
  });

  it("401 UNAUTHORIZED·500 SAVE_FAILED를 code로 구분한다", () => {
    expect(parseSubmitResponse(401, { code: "UNAUTHORIZED", message: "인증", field_errors: [] }, sent).state).toBe("unauthorized");
    expect(parseSubmitResponse(500, { code: "SAVE_FAILED", message: "저장 실패", field_errors: [] }, sent).state).toBe("save-failed");
  });

  it.each([
    [500, { code: "INTERNAL", message: "x", field_errors: [] }],
    [400, { code: "INVALID_SURVEY", message: "x" }],
    [502, "<html>"],
    [401, { code: "SAVE_FAILED", message: "x", field_errors: [] }],
  ])("계약 밖 응답(%i)은 성공·실패로 단정하지 않는다", (status, body) => {
    expect(parseSubmitResponse(status, body, sent).state).toBe("unknown");
  });
});

describe("postSurvey", () => {
  it("토큰과 answers를 한 번만 보낸다", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(created), { status: 201 }));
    const result = await postSurvey("http://127.0.0.1:8080", "user-token", sent, fetchImpl);
    expect(result.state).toBe("saved");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://127.0.0.1:8080/api/survey-submissions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer user-token");
    expect(JSON.parse(String(init.body))).toEqual({ answers: sent });
  });

  it("연결 실패는 저장 실패가 아니라 불명이며 다시 보내지 않는다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await postSurvey("http://127.0.0.1:8080", "t", sent, fetchImpl);
    expect(result.state).toBe("unknown");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("JSON이 아닌 응답은 불명이다", async () => {
    const fetchImpl = vi.fn(async () => new Response("oops", { status: 201 }));
    expect((await postSurvey("http://127.0.0.1:8080", "t", sent, fetchImpl)).state).toBe("unknown");
  });

  it("잘못된 서버 주소면 요청하지 않는다", async () => {
    const fetchImpl = vi.fn();
    expect(buildSubmitUrl("ftp://x")).toBeNull();
    expect((await postSurvey("not a url", "t", sent, fetchImpl)).state).toBe("save-failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
