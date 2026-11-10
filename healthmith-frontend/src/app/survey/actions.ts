"use server";

import { getBackendApiUrl } from "@/config/env";
import { getUserSession } from "@/config/session";

import { getSurvey, patchSurvey, postSurvey } from "./submit";
import type { DetailResult, SubmitResult } from "./types";
import { parseFormInput, validateSurvey } from "./validation";

const SIGN_IN_REQUIRED = "로그인이 필요해요. Google로 로그인한 뒤 다시 저장해 주세요.";

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

export async function loadSurvey(id: string): Promise<DetailResult> {
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: SIGN_IN_REQUIRED };
  return getSurvey(getBackendApiUrl(), session.accessToken, id);
}

export async function updateSurvey(id: string, version: number, input: unknown): Promise<DetailResult> {
  const formInput = parseFormInput(input);
  const validation = formInput ? validateSurvey(formInput) : null;
  if (!validation?.ok) return { state: "failed", message: "입력 내용을 확인해 주세요." };
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: SIGN_IN_REQUIRED };
  return patchSurvey(getBackendApiUrl(), session.accessToken, id, version, validation.answers);
}
