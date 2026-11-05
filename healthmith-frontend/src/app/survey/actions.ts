"use server";

import { getBackendApiUrl } from "@/config/env";
import { getUserSession } from "@/config/session";

import { postSurvey } from "./submit";
import type { SubmitResult } from "./types";
import { parseFormInput, validateSurvey } from "./validation";

const SIGN_IN_REQUIRED = "로그인이 필요해요. 로그인 기능은 준비 중이라 지금은 저장할 수 없어요.";

/**
 * 사전조사 제출 Server Function.
 * 1) 화면 검사를 우회한 값도 다시 검사 → 2) 서버 전용 세션에서 검증된 토큰 확인 → 3) Spring에 한 번 전달.
 * 토큰이 없으면 시험용 토큰·가짜 성공으로 대신하지 않는다. 최종 검사·소유자 결정은 Spring이 한다.
 */
export async function submitSurvey(input: unknown): Promise<SubmitResult> {
  const formInput = parseFormInput(input);
  const validation = formInput ? validateSurvey(formInput) : null;
  if (!validation?.ok) {
    return { state: "invalid", message: "입력 내용을 확인해 주세요.", fieldErrors: [] };
  }

  const session = await getUserSession();
  if (session.state !== "authenticated") {
    return { state: "unauthorized", message: SIGN_IN_REQUIRED };
  }

  return postSurvey(getBackendApiUrl(), session.accessToken, validation.answers);
}
