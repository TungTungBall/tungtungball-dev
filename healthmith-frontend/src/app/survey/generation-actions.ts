"use server";

import { getBackendApiUrl } from "@/config/env";
import { getUserSession } from "@/config/session";
import { workoutErrorMessage } from "@/lib/healthmith/workout-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 10_000;

export type GenerationJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  curriculum_id: string | null;
  error: { code: string; message: string } | null;
};

export type GeneratedCurriculum = {
  id: string;
  status: "draft" | "confirmed" | "rejected";
  version: number;
  stages: Array<{
    stage_index: number;
    stage_name: string;
    exercise_name: string;
    target_repetitions: number;
    pace_instruction: string;
    internal_focus_instruction: string;
  }>;
};

export type GenerationResult =
  | { state: "ok"; job: GenerationJob }
  | { state: "unauthorized"; message: string }
  | { state: "failed"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiUrl(path: string): URL | null {
  try {
    const base = new URL(getBackendApiUrl().trim());
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    return new URL(path.replace(/^\//, ""), new URL("api/", base));
  } catch {
    return null;
  }
}

function parseJob(value: unknown): GenerationJob | null {
  if (!isRecord(value)) return null;
  const { id, status, curriculum_id: curriculumId, error } = value;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (!["queued", "running", "succeeded", "failed"].includes(String(status))) return null;
  if (curriculumId !== null && (typeof curriculumId !== "string" || !UUID.test(curriculumId))) return null;
  if (status === "succeeded" && typeof curriculumId !== "string") return null;
  if ((status === "queued" || status === "running" || status === "failed") && curriculumId !== null) return null;
  if (error !== null && (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string")) return null;
  if ((status === "failed") !== (error !== null)) return null;
  return { id, status: status as GenerationJob["status"], curriculum_id: curriculumId as string | null, error: error as GenerationJob["error"] };
}

export async function createCurriculumGeneration(submissionId: string): Promise<GenerationResult> {
  if (!UUID.test(submissionId)) return { state: "failed", message: "사전조사 저장 정보를 확인해 주세요." };
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: "로그인 후 커리큘럼 초안을 만들 수 있어요." };
  const url = apiUrl("curriculum-generation-requests");
  if (!url) return { state: "failed", message: "서버 주소 설정을 확인해 주세요." };
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error",
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`, "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ survey_submission_id: submissionId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401) return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
    const body: unknown = await response.json();
    if (!response.ok) return { state: "failed", message: workoutErrorMessage(body) };
    const job = parseJob(body);
    return response.status === 202 && job?.status !== "failed" && job
      ? { state: "ok", job }
      : { state: "failed", message: "초안 생성 요청을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
  } catch {
    return { state: "failed", message: "초안 생성 요청 결과를 확인할 수 없어요. 다시 요청하기 전에 잠시 후 확인해 주세요." };
  }
}

export async function readCurriculumGeneration(requestId: string): Promise<GenerationResult> {
  if (!UUID.test(requestId)) return { state: "failed", message: "생성 요청 정보를 확인해 주세요." };
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
  const url = apiUrl(`curriculum-generation-requests/${encodeURIComponent(requestId)}`);
  if (!url) return { state: "failed", message: "서버 주소 설정을 확인해 주세요." };
  try {
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401) return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
    const job = parseJob(await response.json());
    return response.ok && job?.id === requestId
      ? { state: "ok", job }
      : { state: "failed", message: "초안 생성 상태를 불러오지 못했어요." };
  } catch {
    return { state: "failed", message: "초안 생성 상태를 불러오지 못했어요." };
  }
}

export async function readGeneratedCurriculum(curriculumId: string): Promise<
  { state: "ok"; curriculum: GeneratedCurriculum } | { state: "failed"; message: string }
> {
  if (!UUID.test(curriculumId)) return { state: "failed", message: "생성된 초안 정보를 확인해 주세요." };
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "failed", message: "로그인 상태를 확인해 주세요." };
  const url = apiUrl(`curricula/${encodeURIComponent(curriculumId)}`);
  if (!url) return { state: "failed", message: "서버 주소 설정을 확인해 주세요." };
  try {
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const value: unknown = await response.json();
    if (!response.ok || !isRecord(value) || value.id !== curriculumId || !Array.isArray(value.stages)) {
      return { state: "failed", message: "생성된 초안을 불러오지 못했어요." };
    }
    const { status, version, stages } = value;
    if ((status !== "draft" && status !== "confirmed") || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || stages.length !== 5) {
      return { state: "failed", message: "생성된 초안 응답을 확인할 수 없어요." };
    }
    const parsedStages: GeneratedCurriculum["stages"] = [];
    for (const stage of stages) {
      if (!isRecord(stage) || typeof stage.stage_index !== "number" || typeof stage.stage_name !== "string"
        || typeof stage.exercise_name !== "string" || typeof stage.target_repetitions !== "number"
        || typeof stage.pace_instruction !== "string" || typeof stage.internal_focus_instruction !== "string") {
        return { state: "failed", message: "생성된 초안 응답을 확인할 수 없어요." };
      }
      parsedStages.push({
        stage_index: stage.stage_index, stage_name: stage.stage_name, exercise_name: stage.exercise_name,
        target_repetitions: stage.target_repetitions, pace_instruction: stage.pace_instruction,
        internal_focus_instruction: stage.internal_focus_instruction,
      });
    }
    parsedStages.sort((a, b) => a.stage_index - b.stage_index);
    if (parsedStages.some((s, i) => s.stage_index !== i + 1 || !Number.isSafeInteger(s.target_repetitions) || s.target_repetitions < 1
      || !s.stage_name.trim() || !s.exercise_name.trim() || !s.pace_instruction.trim() || !s.internal_focus_instruction.trim())) {
      return { state: "failed", message: "생성된 초안 응답을 확인할 수 없어요." };
    }
    return { state: "ok", curriculum: { id: curriculumId, status, version, stages: parsedStages } };
  } catch {
    return { state: "failed", message: "생성된 초안을 불러오지 못했어요." };
  }
}

export async function regenerateCurriculum(curriculumId: string, expectedVersion: number): Promise<GenerationResult> {
  if (!UUID.test(curriculumId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { state: "failed", message: "초안 정보를 확인해 주세요." };
  }
  const session = await getUserSession();
  if (session.state !== "authenticated") return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
  const url = apiUrl(`curricula/${encodeURIComponent(curriculumId)}/regenerations`);
  if (!url) return { state: "failed", message: "서버 주소 설정을 확인해 주세요." };
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error",
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`, "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ expected_version: expectedVersion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401) return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
    const body: unknown = await response.json();
    if (!response.ok) return { state: "failed", message: workoutErrorMessage(body) };
    const job = parseJob(body);
    return response.status === 202 && job?.status !== "failed" && job
      ? { state: "ok", job }
      : { state: "failed", message: "새 초안 생성 요청을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
  } catch {
    return { state: "failed", message: "새 초안 요청 결과를 확인할 수 없어요." };
  }
}
