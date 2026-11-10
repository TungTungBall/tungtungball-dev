"use server";

import { getUserSession } from "@/config/session";
import { fetchBackendApi } from "@/lib/backend-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORENESS = ["없음", "상체", "하체", "허리", "기타"] as const;

export type FeedbackInput = {
  soreness_body_parts: string[];
  difficulty: number;
  enjoyment: number;
};

export type FeedbackSubmitResult =
  | { state: "saved"; next_generation_request_id: string | null; safety_notice: string }
  | { state: "unauthorized" | "failed"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInput(value: unknown): value is FeedbackInput {
  if (!isRecord(value) || !Array.isArray(value.soreness_body_parts)) return false;
  const parts = value.soreness_body_parts;
  return parts.length >= 1 && parts.length <= 4
    && parts.every((part) => typeof part === "string" && SORENESS.includes(part as (typeof SORENESS)[number]))
    && new Set(parts).size === parts.length
    && (parts.includes("없음") ? parts.length === 1 : true)
    && typeof value.difficulty === "number" && Number.isInteger(value.difficulty) && value.difficulty >= 1 && value.difficulty <= 5
    && typeof value.enjoyment === "number" && Number.isInteger(value.enjoyment) && value.enjoyment >= 1 && value.enjoyment <= 5;
}

export async function submitWorkoutFeedback(sessionId: string, input: unknown): Promise<FeedbackSubmitResult> {
  if (!UUID.test(sessionId) || !isInput(input)) return { state: "failed", message: "설문 응답을 확인해 주세요." };
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
  try {
    const response = await fetchBackendApi(`workout-sessions/${encodeURIComponent(sessionId)}/feedback`, session.accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
    if (response.status === 401) return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
    if (response.status !== 201) return { state: "failed", message: "설문을 저장하지 못했어요. 입력과 운동 상태를 확인해 주세요." };
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.feedback) || body.feedback.session_id !== sessionId
      || (body.safety_notice !== null && typeof body.safety_notice !== "string")
      || (body.next_generation_request_id !== null && (typeof body.next_generation_request_id !== "string" || !UUID.test(body.next_generation_request_id)))) {
      return { state: "failed", message: "저장 응답을 확인하지 못했어요." };
    }
    return {
      state: "saved",
      next_generation_request_id: body.next_generation_request_id,
      safety_notice: body.safety_notice ?? "",
    };
  } catch {
    return { state: "failed", message: "설문 저장 결과를 확인할 수 없어요. 기록을 다시 확인해 주세요." };
  }
}
