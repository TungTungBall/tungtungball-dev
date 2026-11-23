import { describe, expect, it } from "vitest";
import { PAIN_BODY_PARTS, type SurveyFormInput } from "@/app/survey/types";
import { parseFormInput, validateSurvey, fieldFromServerPath } from "@/app/survey/validation";
import { isSurveyAnswers, sameAnswers } from "@/app/survey/response";

const input: SurveyFormInput = { limitationsPresent: false, limitationParts: [], purposeType: "체력", customText: "", intensity: "10", priorityParts: ["하체"] };
describe("통증 설문 계약", () => {
  it("9개 위치를 운동 불가 부위와 분리해서 저장하며 우선 부위와 겹쳐도 허용한다", () => {
    const parsed = parseFormInput({ ...input, painBodyParts: [...PAIN_BODY_PARTS] });
    expect(parsed).not.toBeNull();
    const result = validateSurvey(parsed!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.pain_body_parts).toEqual(PAIN_BODY_PARTS);
    expect(result.answers.physical_limitations).toEqual({ present: false, body_parts: [] });
    expect(isSurveyAnswers(result.answers)).toBe(true);
    expect(sameAnswers(result.answers, { ...result.answers, pain_body_parts: [] })).toBe(false);
  });
  it("기존 응답과 빈 통증 선택의 호환성을 유지한다", () => {
    const result = validateSurvey(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isSurveyAnswers(result.answers)).toBe(true);
    expect(sameAnswers(result.answers, { ...result.answers, pain_body_parts: [] })).toBe(true);
  });
  it.each([{ painBodyParts: ["무릎"] }, { painBodyParts: ["무릎 앞쪽", "무릎 앞쪽"] }, { painBodyParts: null }, { painBodyParts: "목" }])("잘못된 통증 목록 $painBodyParts를 거절한다", ({ painBodyParts }) => {
    const value = { ...input, painBodyParts };
    const parsed = parseFormInput(value);
    expect(parsed === null || !validateSurvey(parsed).ok).toBe(true);
    const baseline = validateSurvey(input);
    if (baseline.ok) expect(isSurveyAnswers({ ...baseline.answers, pain_body_parts: painBodyParts })).toBe(false);
  });
  it("서버의 통증 오류를 해당 입력에 표시한다", () => {
    expect(fieldFromServerPath("answers.pain_body_parts")).toBe("painBodyParts");
  });
});
