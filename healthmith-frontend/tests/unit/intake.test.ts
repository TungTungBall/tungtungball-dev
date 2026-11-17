import { describe, expect, it } from "vitest";
import { emptyIntake, intakeStepError, LIMITATION_PARTS } from "@/lib/healthmith/intake";

describe("새 사전조사 입력 규칙", () => {
  it("미선택을 없음이나 기본값으로 취급하지 않는다", () => {
    const input = emptyIntake();
    for (let step = 0; step < 5; step++) expect(intakeStepError(input, step)).not.toBeNull();
    expect(intakeStepError(input, 5)).toBeNull();
    expect(LIMITATION_PARTS).toHaveLength(8);
    expect(LIMITATION_PARTS).not.toContain("기타");
  });
  it("선택한 부위 모두의 위치와 정도를 확인한다", () => {
    const input = { ...emptyIntake(), limitationsPresent: true, limitations: { 손목: {side: "왼쪽", severity: "보통" as const}, 무릎: {side: null, severity: null} } };
    expect(intakeStepError(input, 4)).toContain("무릎");
    input.limitations.손목.side = "잘못된 위치";
    expect(intakeStepError(input, 4)).toContain("손목");
  });
  it("제약 없음은 허용하고 충돌하는 선호를 몰래 삭제하지 않는다", () => {
    const input = emptyIntake();input.limitationsPresent = false;
    expect(intakeStepError(input, 4)).toBeNull();
    input.limitationsPresent = true;input.limitations = {손목: {side: "왼쪽", severity: "심함"}};input.priorities = ["손목"];
    expect(intakeStepError(input, 4)).toBeNull();
    expect(intakeStepError(input, 5)).toBeNull();
    expect(input.priorities).toEqual(["손목"]);
  });
  it("불가능한 일정 값을 거절한다", () => {
    for (const [minutes, days] of [[0, 3], [20, 8], [20, 1.5]]) expect(intakeStepError({...emptyIntake(), minutes, days}, 3)).not.toBeNull();
    expect(intakeStepError({...emptyIntake(), minutes:20, days:3}, 3)).toBeNull();
  });
});
