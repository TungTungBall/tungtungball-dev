import { describe, expect, it } from "vitest";

import type { SurveyFormInput } from "@/app/survey/types";
import { fieldFromServerPath, parseFormInput, validateSurvey } from "@/app/survey/validation";

// US-01 원문 조건 1~5와 PM 부위 충돌 정책의 화면 검사 (docs/decisions/us01-test-scenarios.md)

const valid: SurveyFormInput = {
  limitationsPresent: false,
  limitationParts: [],
  purposeType: "체력",
  customText: "",
  intensity: "5",
  priorityParts: ["하체", "상체"],
};

const withInput = (patch: Partial<SurveyFormInput>): SurveyFormInput => ({ ...valid, ...patch });

describe("validateSurvey — 정상", () => {
  it("제약 없음·체력·강도 5를 API answers로 바꾸고 우선 부위 순서를 유지한다 (조건 1)", () => {
    expect(validateSurvey(valid)).toEqual({
      ok: true,
      answers: {
        physical_limitations: { present: false, body_parts: [] },
        purpose: { type: "체력", custom_text: null },
        intensity: 5,
        priority_body_parts: ["하체", "상체"],
      },
    });
  });

  it.each(["체력", "감량", "근력", "자세"] as const)("목적 %s는 custom_text를 null로 보낸다 (조건 2)", (type) => {
    const result = validateSurvey(withInput({ purposeType: type, customText: "무시되지 않는 글" }));
    expect(result.ok && result.answers.purpose).toEqual({ type, custom_text: null });
  });

  it("자유 입력 문장을 앞뒤 공백까지 그대로 보낸다 (조건 2)", () => {
    const result = validateSurvey(withInput({ purposeType: "자유 입력", customText: "  오래 걷고 싶다  " }));
    expect(result.ok && result.answers.purpose).toEqual({ type: "자유 입력", custom_text: "  오래 걷고 싶다  " });
  });

  it.each(["1", "10"])("강도 경계값 %s를 허용한다 (조건 3)", (intensity) => {
    const result = validateSurvey(withInput({ intensity }));
    expect(result.ok && result.answers.intensity).toBe(Number(intensity));
  });

  it("제약 부위와 우선 부위를 별도 배열·순서로 보존한다 (조건 3)", () => {
    const result = validateSurvey(
      withInput({ limitationsPresent: true, limitationParts: ["허리"], priorityParts: ["상체", "하체"] }),
    );
    expect(result.ok && result.answers.physical_limitations).toEqual({ present: true, body_parts: ["허리"] });
    expect(result.ok && result.answers.priority_body_parts).toEqual(["상체", "하체"]);
  });
});

describe("validateSurvey — 거절", () => {
  it.each(["", "0", "11", "5.5", "abc", "-1", " "])("강도 %j는 강도 오류다 (조건 4)", (intensity) => {
    const result = validateSurvey(withInput({ intensity }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.intensity).toBeTruthy();
  });

  it("운동 목적 미선택은 목적 오류다 (조건 4)", () => {
    const result = validateSurvey(withInput({ purposeType: null }));
    expect(!result.ok && Object.keys(result.errors)).toEqual(["purpose"]);
  });

  it.each(["", "   ", "\n\t"])("자유 입력이 공백뿐(%j)이면 자유 입력 오류다 (조건 4)", (customText) => {
    const result = validateSurvey(withInput({ purposeType: "자유 입력", customText }));
    expect(!result.ok && Object.keys(result.errors)).toEqual(["customText"]);
  });

  it("제약 있음인데 부위가 없으면 부위 오류다 (조건 5)", () => {
    const result = validateSurvey(withInput({ limitationsPresent: true, limitationParts: [] }));
    expect(!result.ok && Object.keys(result.errors)).toEqual(["limitationParts"]);
  });

  it("제약 유무를 고르지 않으면 오류다", () => {
    const result = validateSurvey(withInput({ limitationsPresent: null }));
    expect(!result.ok && result.errors.limitations).toBeTruthy();
  });

  it("우선 부위가 비면 오류다", () => {
    const result = validateSurvey(withInput({ priorityParts: [] }));
    expect(!result.ok && Object.keys(result.errors)).toEqual(["priorityParts"]);
  });

  it("제약 부위와 우선 부위가 겹치면 우선 부위 수정 안내로 막고 자동 제거하지 않는다 (PM 정책)", () => {
    const input = withInput({ limitationsPresent: true, limitationParts: ["허리"], priorityParts: ["허리", "하체"] });
    const result = validateSurvey(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.priorityParts).toContain("우선 부위를 수정");
    expect(input.priorityParts).toEqual(["허리", "하체"]);
  });

  it("제약 없음이면 남아 있는 제약 부위를 보내지 않는다", () => {
    const result = validateSurvey(withInput({ limitationsPresent: false, limitationParts: ["허리"], priorityParts: ["허리"] }));
    expect(result.ok && result.answers.physical_limitations).toEqual({ present: false, body_parts: [] });
  });

  it("중복 부위를 거절한다", () => {
    const result = validateSurvey(withInput({ priorityParts: ["상체", "상체"] }));
    expect(result.ok).toBe(false);
  });
});

describe("parseFormInput — Server Function 입력 모양", () => {
  it("정상 입력을 그대로 돌려준다", () => {
    expect(parseFormInput(valid)).toEqual(valid);
  });

  it.each([
    null,
    "문자열",
    [],
    { ...valid, limitationsPresent: "true" },
    { ...valid, limitationParts: ["기타"] },
    { ...valid, purposeType: "다이어트" },
    { ...valid, intensity: 5 },
    { ...valid, priorityParts: "상체" },
  ])("잘못된 모양 %j는 null이다", (value) => {
    expect(parseFormInput(value)).toBeNull();
  });
});

describe("fieldFromServerPath", () => {
  it.each([
    ["answers.intensity", "intensity"],
    ["answers.priority_body_parts", "priorityParts"],
    ["answers.physical_limitations.body_parts", "limitationParts"],
    ["answers.purpose.custom_text", "customText"],
    ["answers.purpose.type", "purpose"],
    ["answers.unknown", null],
  ])("%s → %s", (path, field) => {
    expect(fieldFromServerPath(path)).toBe(field);
  });
});
