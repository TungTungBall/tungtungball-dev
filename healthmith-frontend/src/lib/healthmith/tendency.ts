export type WorkoutTendency = {
  summary: string | null;
  updated_at: string | null;
  source_feedback_count: number;
  latest_generation_status: "not_requested" | "queued" | "running" | "succeeded" | "failed";
  latest_request_id: string | null;
};

export function parseWorkoutTendency(value: unknown): WorkoutTendency | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if ((v.summary !== null && (typeof v.summary !== "string" || !v.summary.trim()))
    || (v.updated_at !== null && (typeof v.updated_at !== "string" || Number.isNaN(Date.parse(v.updated_at))))
    || typeof v.source_feedback_count !== "number" || !Number.isSafeInteger(v.source_feedback_count) || v.source_feedback_count < 0
    || !["not_requested", "queued", "running", "succeeded", "failed"].includes(String(v.latest_generation_status))
    || (v.latest_request_id !== null && (typeof v.latest_request_id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.latest_request_id)))) return null;
  // 요약과 출처 정보가 함께 온 경우에만 실제 요약으로 표시한다.
  if (v.summary !== null && (v.updated_at === null || v.source_feedback_count === 0)) return null;
  if (v.summary === null && (v.updated_at !== null || v.source_feedback_count !== 0)) return null;
  if ((v.latest_generation_status === "not_requested") !== (v.latest_request_id === null)) return null;
  return v as WorkoutTendency;
}

export function tendencyStatusMessage(status: WorkoutTendency["latest_generation_status"]): string {
  switch (status) {
    case "queued": return "새 요약 요청이 대기 중이에요. 잠시 후 다시 확인해 주세요.";
    case "running": return "새 요약을 만들고 있어요. 잠시 후 다시 확인해 주세요.";
    case "failed": return "새 요약을 만들지 못했어요. 기존 요약이 있으면 그대로 보여드려요.";
    case "succeeded": return "최근 요약 생성이 끝났어요.";
    case "not_requested": return "아직 요약 생성 요청이 없어요.";
  }
}
