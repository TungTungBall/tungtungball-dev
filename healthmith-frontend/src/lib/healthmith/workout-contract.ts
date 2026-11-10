export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const count = (v: unknown): v is number => v === 0 || positive(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

export type WorkoutStage = { stage_index: number; stage_name: string; exercise_id: string; exercise_name: string; target_repetitions: number; pace_instruction: string; internal_focus_instruction: string };
export type WorkoutCurriculum = { id: string; version: number; status: "draft" | "confirmed"; stages: WorkoutStage[] };
export type WorkoutSession = {
  id: string; curriculum_id: string; status: "in_progress" | "paused" | "completed" | "abandoned";
  current_stage_index: number; current_repetitions: number; completed_stage_count: number; version: number;
  started_at: string; updated_at: string; ended_at: string | null; feedback_status: "submitted" | "not_submitted";
  stage_results: Array<{ stage_index: number; exercise_id: string; target_repetitions: number; completed_repetitions: number; completed_at: string }>;
};

export function parseWorkoutCurriculum(v: unknown): WorkoutCurriculum | null {
  if (!isRecord(v) || typeof v.id !== "string" || !UUID.test(v.id) || !positive(v.version)
    || (v.status !== "draft" && v.status !== "confirmed") || !Array.isArray(v.stages) || v.stages.length !== 5) return null;
  const stages: WorkoutStage[] = [];
  for (const s of v.stages) {
    if (!isRecord(s) || !positive(s.stage_index) || s.stage_index > 5 || !positive(s.target_repetitions)
      || !text(s.stage_name) || !text(s.exercise_id) || !text(s.exercise_name) || !text(s.pace_instruction) || !text(s.internal_focus_instruction)) return null;
    stages.push({ stage_index: s.stage_index, stage_name: s.stage_name, exercise_id: s.exercise_id, exercise_name: s.exercise_name, target_repetitions: s.target_repetitions, pace_instruction: s.pace_instruction, internal_focus_instruction: s.internal_focus_instruction });
  }
  stages.sort((a, b) => a.stage_index - b.stage_index);
  if (stages.some((s, i) => s.stage_index !== i + 1)) return null;
  return { id: v.id, version: v.version, status: v.status, stages };
}

export function parseWorkoutSession(v: unknown): WorkoutSession | null {
  if (!isRecord(v) || typeof v.id !== "string" || !UUID.test(v.id) || typeof v.curriculum_id !== "string" || !UUID.test(v.curriculum_id)
    || !["in_progress", "paused", "completed", "abandoned"].includes(String(v.status)) || !positive(v.version)
    || !positive(v.current_stage_index) || v.current_stage_index > 5 || !count(v.current_repetitions)
    || !count(v.completed_stage_count) || v.completed_stage_count > 5 || !Array.isArray(v.stage_results)
    || v.stage_results.length !== v.completed_stage_count || !date(v.started_at) || !date(v.updated_at)
    || Date.parse(v.updated_at) < Date.parse(v.started_at) || !["submitted", "not_submitted"].includes(String(v.feedback_status))) return null;
  const completed = v.status === "completed";
  const ended = completed || v.status === "abandoned";
  if (ended ? !date(v.ended_at) || Date.parse(v.ended_at) < Date.parse(v.started_at) || Date.parse(v.ended_at) > Date.parse(v.updated_at) : v.ended_at !== null) return null;
  if (completed ? v.completed_stage_count !== 5 || v.current_stage_index !== 5 : v.completed_stage_count !== v.current_stage_index - 1) return null;
  if (!completed && v.feedback_status !== "not_submitted") return null;
  const results: WorkoutSession["stage_results"] = [];
  for (const [i, s] of v.stage_results.entries()) {
    if (!isRecord(s) || s.stage_index !== i + 1 || !text(s.exercise_id) || !positive(s.target_repetitions)
      || s.completed_repetitions !== s.target_repetitions || !date(s.completed_at)
      || Date.parse(s.completed_at) < Date.parse(i ? results[i - 1].completed_at : v.started_at) || Date.parse(s.completed_at) > Date.parse(v.updated_at)) return null;
    results.push({ stage_index: i + 1, exercise_id: s.exercise_id, target_repetitions: s.target_repetitions, completed_repetitions: s.target_repetitions, completed_at: s.completed_at });
  }
  if (completed && v.current_repetitions !== results[4].target_repetitions) return null;
  return { id: v.id, curriculum_id: v.curriculum_id, status: v.status as WorkoutSession["status"], version: v.version,
    current_stage_index: v.current_stage_index, current_repetitions: v.current_repetitions, completed_stage_count: v.completed_stage_count,
    started_at: v.started_at, updated_at: v.updated_at, ended_at: v.ended_at as string | null, feedback_status: v.feedback_status as WorkoutSession["feedback_status"], stage_results: results };
}

export function workoutErrorMessage(value: unknown): string {
  const code = isRecord(value) ? value.code : null;
  switch (code) {
    case "UNAUTHORIZED": return "로그인 상태를 확인해 주세요.";
    case "RESOURCE_NOT_FOUND": return "운동 정보를 찾을 수 없어요. 본인의 기록에서 다시 열어 주세요.";
    case "POLICY_NOT_CONFIGURED": return "운동 운영 기준이 아직 준비되지 않았어요. 관리자에게 문의해 주세요.";
    case "NO_ELIGIBLE_EXERCISE": return "입력 조건에 맞는 지원 운동이 없어요. 사전조사와 지원 운동을 확인해 주세요.";
    case "GENERATION_UNAVAILABLE": return "초안 생성 서비스를 준비 중이에요. 저장된 사전조사는 유지돼요.";
    case "NOT_CURRENT_DRAFT": return "새로운 초안이 있어요. 최신 초안을 다시 확인해 주세요.";
    case "VERSION_CONFLICT": return "다른 요청으로 운동 상태가 바뀌었어요. 최신 상태를 불러와 주세요.";
    case "INVALID_STATE": return "현재 운동 상태에서는 이 작업을 할 수 없어요. 진행 중인 운동을 확인해 주세요.";
    default: return "요청을 처리하지 못했어요. 현재 상태를 확인한 뒤 다시 시도해 주세요.";
  }
}
