import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), backend: vi.fn() }));
vi.mock("@/config/session", () => ({ getUserSession: mocks.session }));
vi.mock("@/lib/backend-api", () => ({ fetchBackendApi: mocks.backend }));
vi.mock("@/config/env", () => ({ getPoseRuleSettings: () => ({}) }));
import { changeWorkoutState, confirmWorkoutCurriculum, loadWorkout, loadWorkoutResult, recordWorkoutRepetition, startWorkoutSession } from "@/app/(experience)/workout/actions";
import { parseWorkoutSession } from "@/lib/healthmith/workout-contract";

const id = "10000000-0000-4000-8000-000000000001", cid = "20000000-0000-4000-8000-000000000001", key = "30000000-0000-4000-8000-000000000001";
const time = "2026-11-10T00:00:00Z";
const session = { id, curriculum_id: cid, status: "in_progress", version: 1, current_stage_index: 1, current_repetitions: 0, completed_stage_count: 0, stage_results: [], started_at: time, updated_at: time, ended_at: null, feedback_status: "not_submitted" };
const curriculum = { id: cid, version: 2, status: "confirmed", stages: Array.from({ length: 5 }, (_, i) => ({ stage_index: i + 1, stage_name: `단계 ${i + 1}`, exercise_id: "TEST_EX", exercise_name: "테스트 운동", target_repetitions: 3, pace_instruction: "검토한 속도", internal_focus_instruction: "검토한 안내" })) };
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ state: "authenticated", accessToken: "synthetic-secret" }); });

describe("실제 운동 연결", () => {
  it("사용자 확인을 받은 확정 명령만 보내며 자동 시작하지 않는다", async () => {
    mocks.backend.mockResolvedValue(Response.json(curriculum));
    expect((await confirmWorkoutCurriculum(cid, 1, key)).state).toBe("ok");
    expect(mocks.backend).toHaveBeenCalledTimes(1);
    expect(mocks.backend.mock.calls[0]).toEqual([`curricula/${cid}/confirmations`, "synthetic-secret", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ expected_version: 1 }) }]);
  });
  it("시작 재시도는 같은 키와 확정 버전을 보낸다", async () => {
    mocks.backend.mockImplementation(() => Promise.resolve(Response.json(session, { status: 201 })));
    for (let i = 0; i < 2; i++) expect((await startWorkoutSession(cid, 2, key)).state).toBe("ok");
    expect(mocks.backend.mock.calls[0]).toEqual(mocks.backend.mock.calls[1]);
  });
  it("새로고침은 본인의 세션·확정 커리큘럼을 읽고 명령을 보내지 않는다", async () => {
    mocks.backend.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(curriculum));
    const r = await loadWorkout(id);
    expect(r).toEqual({ state: "ok", data: { session, curriculum } });
    expect(JSON.stringify(r)).not.toContain("synthetic-secret");
    expect(mocks.backend.mock.calls.every((call) => Object.keys(call[2]).length === 0)).toBe(true);
  });
  it("현재 세션이 없으면 예시 운동을 실제 운동으로 대신하지 않는다", async () => {
    mocks.backend.mockResolvedValue(Response.json({ session: null }));
    expect(await loadWorkout()).toEqual({ state: "ok", data: { session: null } });
  });
  it("다른 ID·다른 커리큘럼 응답과 초과한 횟수를 거절한다", async () => {
    mocks.backend.mockResolvedValueOnce(Response.json({ ...session, id: cid }));
    expect((await loadWorkout(id)).state).toBe("failed");
    mocks.backend.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({ ...curriculum, id }));
    expect((await loadWorkout(id)).state).toBe("failed");
    mocks.backend.mockResolvedValueOnce(Response.json({ ...session, current_repetitions: 3 })).mockResolvedValueOnce(Response.json(curriculum));
    expect((await loadWorkout(id)).state).toBe("failed");
  });
  it("반복 이벤트는 ID·원래 버전·단계만 보내고 중복 영수증을 받아들인다", async () => {
    mocks.backend.mockResolvedValue(Response.json({ event_id: key, event_applied: false, session: { ...session, current_repetitions: 1, version: 2 } }));
    expect((await recordWorkoutRepetition(id, 1, 1, key)).state).toBe("ok");
    expect(JSON.parse(mocks.backend.mock.calls[0][2].body)).toEqual({ event_id: key, stage_index: 1, expected_version: 1 });
  });
  it("반복의 다른 영수증이나 증가하지 않은 버전은 거절한다", async () => {
    mocks.backend.mockResolvedValueOnce(Response.json({ event_id: cid, event_applied: true, session: { ...session, version: 2 } }));
    expect((await recordWorkoutRepetition(id, 1, 1, key)).state).toBe("failed");
    mocks.backend.mockResolvedValueOnce(Response.json({ event_id: key, event_applied: true, session }));
    expect((await recordWorkoutRepetition(id, 1, 1, key)).state).toBe("failed");
  });
  it("통신 결과 불명과 버전 충돌을 구분하며 내부 오류를 노출하지 않는다", async () => {
    mocks.backend.mockRejectedValueOnce(new Error("synthetic-secret"));
    expect(await recordWorkoutRepetition(id, 1, 1, key)).toMatchObject({ state: "failed", uncertain: true });
    mocks.backend.mockResolvedValueOnce(Response.json({ code: "VERSION_CONFLICT", message: "private" }, { status: 409 }));
    const r = await changeWorkoutState(id, 1, "pause", key);
    expect(r).toMatchObject({ state: "failed", conflict: true });
    expect(JSON.stringify(r)).not.toMatch(/private|synthetic-secret/);
  });
  it("30초 무동작 중단은 no_motion과 버전을 저장한다", async () => {
    mocks.backend.mockResolvedValue(Response.json({ ...session, status: "paused", version: 2 }));
    expect((await changeWorkoutState(id, 1, "pause", key, "no_motion")).state).toBe("ok");
    expect(JSON.parse(mocks.backend.mock.calls[0][2].body)).toEqual({ expected_version: 1, reason: "no_motion" });
  });
  it("포기 결과에 보석이 있거나 완료 전 결과면 표시하지 않는다", async () => {
    mocks.backend.mockResolvedValueOnce(Response.json({ session, gem: null }));
    expect((await loadWorkoutResult(id)).state).toBe("failed");
    const ended = { ...session, status: "abandoned", ended_at: time };
    mocks.backend.mockResolvedValueOnce(Response.json({ session: ended, gem: { id: key } }));
    expect((await loadWorkoutResult(id)).state).toBe("failed");
    mocks.backend.mockResolvedValueOnce(Response.json({ session: ended, gem: null }));
    expect(await loadWorkoutResult(id)).toEqual({ state: "ok", data: { session: ended, gem: null } });
  });
  it("완료 세션은 다섯 단계의 목표·시간·마지막 횟수가 모두 일치해야 한다", () => {
    const completed = { ...session, status: "completed", current_stage_index: 5, current_repetitions: 3, completed_stage_count: 5, ended_at: time,
      stage_results: Array.from({ length: 5 }, (_, i) => ({ stage_index: i + 1, exercise_id: "TEST_EX", target_repetitions: 3, completed_repetitions: 3, completed_at: time })) };
    expect(parseWorkoutSession(completed)).not.toBeNull();
    expect(parseWorkoutSession({ ...completed, current_repetitions: 2 })).toBeNull();
    expect(parseWorkoutSession({ ...completed, ended_at: null })).toBeNull();
    expect(parseWorkoutSession({ ...completed, stage_results: completed.stage_results.slice(1) })).toBeNull();
  });
  it("비로그인·잘못된 식별자·문자 버전은 외부 호출 전에 거절한다", async () => {
    expect((await startWorkoutSession("bad", 1, key)).state).toBe("failed");
    expect((await recordWorkoutRepetition(id, NaN, 1, key)).state).toBe("failed");
    mocks.session.mockResolvedValue({ state: "signed-out" });
    expect((await changeWorkoutState(id, 1, "abandon", key)).state).toBe("failed");
    expect(mocks.backend).not.toHaveBeenCalled();
  });
});
