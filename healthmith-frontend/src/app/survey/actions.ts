"use server";

import { mockSubmitSurvey } from "./mock-response";
import type { SubmitResult } from "./types";
import { parseFormInput, validateSurvey } from "./validation";

/**
 * 사전조사 제출 Server Function.
 * 화면 검사를 우회한 값도 다시 검사한다. 최종 검사·소유자 결정은 Spring이 한다.
 * 지금은 임시 응답을 돌려준다(mock-response.ts).
 */
export async function submitSurvey(input: unknown): Promise<SubmitResult> {
  const formInput = parseFormInput(input);
  if (!formInput) {
    return { state: "invalid", message: "입력 내용을 확인해 주세요.", fieldErrors: [] };
  }
  const validation = validateSurvey(formInput);
  if (!validation.ok) {
    return { state: "invalid", message: "입력 내용을 확인해 주세요.", fieldErrors: [] };
  }
  return mockSubmitSurvey(validation.answers);
}
