import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }));
vi.mock("@/config/session", () => ({ getUserSession: mocks.session }));
vi.mock("@/config/env", () => ({ getBackendApiUrl: () => "https://backend.example/root" }));
import { createCurriculumGeneration, readCurriculumGeneration, readGeneratedCurriculum, regenerateCurriculum } from "@/app/survey/generation-actions";

const id = "10000000-0000-4000-8000-000000000001";
const curriculumId = "30000000-0000-4000-8000-000000000001";
const job = { id, status: "queued", curriculum_id: null, error: null };
const stages = Array.from({ length: 5 }, (_, index) => ({ stage_index: index + 1, stage_name: `단계 ${index + 1}`, exercise_name: "스쿼트", target_repetitions: 10, pace_instruction: "천천히", internal_focus_instruction: "발바닥으로 바닥을 밀어 주세요." }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ state: "authenticated", accessToken: "synthetic-token" });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("커리큘럼 생성 연결", () => {
  it.each([
    ["NO_ELIGIBLE_EXERCISE", "입력 조건에 맞는 지원 운동이 없어요."],
    ["GENERATION_UNAVAILABLE", "초안 생성 서비스를 준비 중이에요."],
    ["POLICY_NOT_CONFIGURED", "운동 운영 기준이 아직 준비되지 않았어요."],
  ])("생성 준비 오류 %s의 원인을 사용자에게 구분해 알린다", async (code, message) => {
    mocks.fetch.mockResolvedValue(Response.json({ code, message: "private backend detail" }, { status: 503 }));
    const result = await createCurriculumGeneration(id);
    expect(result.state).toBe("failed");
    expect(JSON.stringify(result)).toContain(message);
    expect(JSON.stringify(result)).not.toContain("private backend detail");
  });
  it("사용자 요청에만 생성 명령을 한 번 보내고 토큰을 반환하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ...job, user_id: "private" }, { status: 202 }));
    expect(await createCurriculumGeneration(id)).toEqual({ state: "ok", job });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://backend.example/root/api/curriculum-generation-requests");
    expect(options).toMatchObject({ method: "POST", cache: "no-store", redirect: "error", body: JSON.stringify({ survey_submission_id: id }) });
    expect(options.headers.Authorization).toBe("Bearer synthetic-token");
    expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("로그인이 없거나 ID가 잘못되면 생성하지 않는다", async () => {
    expect((await createCurriculumGeneration("wrong")).state).toBe("failed");
    mocks.session.mockResolvedValue({ state: "anonymous" });
    expect((await createCurriculumGeneration(id)).state).toBe("unauthorized");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...job, id: "wrong" },
    { ...job, status: "succeeded" },
    { ...job, status: "running", curriculum_id: curriculumId },
    { ...job, status: "failed", error: null },
  ])("잘못된 생성 응답은 다음 화면으로 연결하지 않는다: %j", async (body) => {
    mocks.fetch.mockResolvedValue(Response.json(body, { status: 202 }));
    expect((await createCurriculumGeneration(id)).state).toBe("failed");
  });

  it("다른 요청의 조회 결과를 받아들이지 않는다", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ...job, id: curriculumId }));
    expect((await readCurriculumGeneration(id)).state).toBe("failed");
  });

  it("생성 실패 상태는 조회할 수 있지만 완료로 오인하지 않는다", async () => {
    const failed = { ...job, status: "failed", error: { code: "GENERATION_FAILED", message: "다시 시도해 주세요." } };
    mocks.fetch.mockResolvedValue(Response.json(failed));
    expect(await readCurriculumGeneration(id)).toEqual({ state: "ok", job: failed });
  });

  it("실제 5단계 초안을 순서대로 반환하며 게임을 시작하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ id: curriculumId, status: "draft", version: 2, stages: [...stages].reverse() }));
    expect(await readGeneratedCurriculum(curriculumId)).toEqual({ state: "ok", curriculum: { id: curriculumId, status: "draft", version: 2, stages } });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][1].method).toBe("GET");
  });

  it.each([
    { id: curriculumId, status: "draft", version: 1, stages: stages.slice(1) },
    { id: curriculumId, status: "draft", version: 0, stages },
    { id: curriculumId, status: "draft", version: 1, stages: [null, ...stages.slice(1)] },
  ])("깨진 초안은 운동 단계로 표시하지 않는다", async (body) => {
    mocks.fetch.mockResolvedValue(Response.json(body));
    expect((await readGeneratedCurriculum(curriculumId)).state).toBe("failed");
  });

  it("재생성은 현재 버전을 전달한다", async () => {
    mocks.fetch.mockResolvedValue(Response.json(job, { status: 202 }));
    expect((await regenerateCurriculum(curriculumId, 3)).state).toBe("ok");
    expect(String(mocks.fetch.mock.calls[0][0])).toBe(`https://backend.example/root/api/curricula/${curriculumId}/regenerations`);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ expected_version: 3 });
  });

  it("인증 만료·네트워크 실패는 토큰 노출이나 자동 재시도 없이 끝난다", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await readCurriculumGeneration(id)).state).toBe("unauthorized");
    mocks.fetch.mockRejectedValue(new Error("synthetic-token private backend"));
    const result = await createCurriculumGeneration(id);
    expect(result.state).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
