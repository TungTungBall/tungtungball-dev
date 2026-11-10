"use server";

import { getUserSession } from "@/config/session";
import { getPoseRuleSettings } from "@/config/env";
import { parsePoseRule, type PoseRule } from "@/lib/healthmith/pose-counter";
import { fetchBackendApi } from "@/lib/backend-api";
import { isRecord, parseWorkoutCurriculum, parseWorkoutSession, positive, UUID, workoutErrorMessage, type WorkoutCurriculum, type WorkoutSession } from "@/lib/healthmith/workout-contract";

type Result<T> = { state: "ok"; data: T } | { state: "failed"; message: string; uncertain?: boolean; conflict?: boolean };
async function request<T>(path: string, parse: (value: unknown) => T | null, body?: unknown, key?: string): Promise<Result<T>> {
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "failed", message: "로그인 상태를 확인해 주세요." };
  try {
    const response = await fetchBackendApi(path, session.accessToken, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body),
    });
    if (response.status === 401) return { state: "failed", message: "로그인 상태를 확인해 주세요." };
    const value: unknown = await response.json();
    if (!response.ok) return { state: "failed", message: workoutErrorMessage(value), conflict: response.status === 409 };
    const data = parse(value);
    return data === null ? { state: "failed", message: "서버 응답을 확인할 수 없어요. 현재 상태를 다시 불러와 주세요.", uncertain: body !== undefined } : { state: "ok", data };
  } catch {
    return { state: "failed", message: body === undefined ? "운동 정보를 불러오지 못했어요." : "저장 결과를 확인하지 못했어요. 같은 요청을 다시 확인하거나 최신 상태를 불러와 주세요.", uncertain: body !== undefined };
  }
}
const invalid = { state: "failed" as const, message: "운동 요청 정보를 확인해 주세요." };

export async function loadPoseRule(exerciseId: string): Promise<PoseRule | null> {
  if (typeof exerciseId !== "string" || exerciseId.length > 200) return null;
  const settings = getPoseRuleSettings();
  return isRecord(settings) && Object.hasOwn(settings, exerciseId) ? parsePoseRule(settings[exerciseId]) : null;
}

export async function loadConfirmedWorkout(id: string): Promise<Result<{ curriculum: WorkoutCurriculum; rules: Record<string, PoseRule> }>> {
  if (!UUID.test(id)) return invalid;
  const c = await request(`curricula/${id}`, parseWorkoutCurriculum);
  if (c.state !== "ok") return c;
  if (c.data.id !== id || c.data.status !== "confirmed") return invalid;
  const rules: Record<string, PoseRule> = {};
  for (const stage of c.data.stages) {
    const rule = await loadPoseRule(stage.exercise_id);
    if (rule) rules[stage.exercise_id] = rule;
  }
  return { state: "ok", data: { curriculum: c.data, rules } };
}

export async function loadWorkout(sessionId?: string): Promise<Result<{ session: WorkoutSession; curriculum: WorkoutCurriculum } | { session: null }>> {
  if (sessionId !== undefined && !UUID.test(sessionId)) return invalid;
  const loaded = sessionId
    ? await request(`workout-sessions/${sessionId}`, (v) => { const s = parseWorkoutSession(v); return s?.id === sessionId ? s : null; })
    : await request("workout-sessions/current", (v) => {
      if (!isRecord(v)) return null;
      if (v.session === null) return { empty: true };
      const s = parseWorkoutSession(v.session); return s && ["paused", "in_progress"].includes(s.status) ? s : null;
    });
  if (loaded.state !== "ok") return loaded;
  if ("empty" in loaded.data) return { state: "ok", data: { session: null } };
  const s = loaded.data;
  const c = await request(`curricula/${s.curriculum_id}`, parseWorkoutCurriculum);
  if (c.state !== "ok") return c;
  if (c.data.id !== s.curriculum_id || c.data.status !== "confirmed") return invalid;
  const stage = c.data.stages[s.current_stage_index - 1];
  if (s.status !== "completed" && s.current_repetitions >= stage.target_repetitions) return invalid;
  if (s.stage_results.some((r, i) => r.exercise_id !== c.data.stages[i].exercise_id || r.target_repetitions !== c.data.stages[i].target_repetitions)) return invalid;
  return { state: "ok", data: { session: s, curriculum: c.data } };
}

export async function confirmWorkoutCurriculum(id: string, version: number, key: string): Promise<Result<WorkoutCurriculum>> {
  if (!UUID.test(id) || !positive(version) || !UUID.test(key)) return invalid;
  return request(`curricula/${id}/confirmations`, (v) => {
    const c = parseWorkoutCurriculum(v); return c?.id === id && c.status === "confirmed" && c.version === version + 1 ? c : null;
  }, { expected_version: version }, key);
}

export async function startWorkoutSession(id: string, version: number, key: string): Promise<Result<WorkoutSession>> {
  if (!UUID.test(id) || !positive(version) || !UUID.test(key)) return invalid;
  return request("workout-sessions", (v) => {
    const s = parseWorkoutSession(v); return s?.curriculum_id === id && s.status === "in_progress" && s.current_stage_index === 1 && s.current_repetitions === 0 ? s : null;
  }, { curriculum_id: id, expected_curriculum_version: version }, key);
}

export async function recordWorkoutRepetition(id: string, version: number, stage: number, eventId: string): Promise<Result<WorkoutSession>> {
  if (!UUID.test(id) || !positive(version) || !positive(stage) || stage > 5 || !UUID.test(eventId)) return invalid;
  return request(`workout-sessions/${id}/repetitions`, (v) => {
    if (!isRecord(v) || v.event_id !== eventId || typeof v.event_applied !== "boolean") return null;
    const s = parseWorkoutSession(v.session);
    return s?.id === id && s.version >= version + 1 && (s.current_stage_index === stage || s.current_stage_index === stage + 1) ? s : null;
  }, { event_id: eventId, stage_index: stage, expected_version: version });
}

export async function changeWorkoutState(id: string, version: number, action: "pause" | "resume" | "abandon", key: string, reason: "manual" | "no_motion" = "manual"): Promise<Result<WorkoutSession>> {
  if (!UUID.test(id) || !positive(version) || !UUID.test(key) || !["pause", "resume", "abandon"].includes(action) || !["manual", "no_motion"].includes(reason)) return invalid;
  const status = { pause: "paused", resume: "in_progress", abandon: "abandoned" }[action];
  return request(`workout-sessions/${id}/${action}`, (v) => {
    const s = parseWorkoutSession(v); return s?.id === id && s.version === version + 1 && s.status === status ? s : null;
  }, { expected_version: version, ...(action === "pause" ? { reason } : {}) }, key);
}

export async function loadWorkoutResult(id: string): Promise<Result<{ session: WorkoutSession; gem: { id: string; display_name: string } | null }>> {
  if (!UUID.test(id)) return invalid;
  return request(`workout-sessions/${id}/result`, (v) => {
    if (!isRecord(v)) return null;
    const s = parseWorkoutSession(v.session);
    if (!s || s.id !== id || !["completed", "abandoned"].includes(s.status)) return null;
    if (s.status === "abandoned") return v.gem === null ? { session: s, gem: null } : null;
    const g = v.gem;
    if (!isRecord(g) || typeof g.id !== "string" || !UUID.test(g.id) || g.source_workout_session_id !== id || g.state !== "polished" || typeof g.display_name !== "string") return null;
    return { session: s, gem: { id: g.id, display_name: g.display_name } };
  });
}
