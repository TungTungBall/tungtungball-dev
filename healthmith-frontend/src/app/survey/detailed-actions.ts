"use server";
import { getBackendApiUrl } from "@/config/env";
import { getUserSession } from "@/config/session";
import { fromIntakeAnswers, UUID_PATTERN, type IntakeResult } from "@/lib/healthmith/intake-contract";
import { requestDetailedSurvey } from "./detailed-submit";

export async function saveDetailedSurvey(answers: unknown, key: string, id: string | null, version: number | null): Promise<IntakeResult> {
  if (!fromIntakeAnswers(answers) || typeof key !== "string" || !UUID_PATTERN.test(key) ||
      (id !== null && (typeof id !== "string" || !UUID_PATTERN.test(id) || !Number.isSafeInteger(version) || version! < 1)) ||
      (id === null && version !== null)) return {state:"failed",message:"입력 내용을 확인해 주세요."};
  const session = await getUserSession();
  if (session.state !== "authenticated") return {state:"unauthorized",message:"로그인이 필요해요. 로그인 후 다시 저장해 주세요."};
  return requestDetailedSurvey(getBackendApiUrl(), session.accessToken, id ? `/${id}` : "", id ? "PATCH" : "POST", id ? {answers,expected_version:version} : {answers}, key);
}
export async function loadDetailedSurvey(id: string | null = null): Promise<IntakeResult> {
  if (id !== null && (typeof id !== "string" || !UUID_PATTERN.test(id))) return {state:"failed",message:"사전조사 주소를 확인해 주세요."};
  const session = await getUserSession();
  if (session.state !== "authenticated") return {state:"unauthorized",message:"로그인이 필요해요. 로그인 후 다시 불러와 주세요."};
  return requestDetailedSurvey(getBackendApiUrl(),session.accessToken,id ? `/${id}` : "/latest","GET");
}
