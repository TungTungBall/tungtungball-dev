import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), backend: vi.fn() }));
vi.mock("@/config/session", () => ({ getUserSession: mocks.session }));
vi.mock("@/lib/backend-api", () => ({ fetchBackendApi: mocks.backend }));
import { submitWorkoutFeedback } from "@/app/(experience)/feedback/actions";

const id = "40000000-0000-4000-8000-000000000001";
const input = { soreness_body_parts: ["없음"], difficulty: 3, enjoyment: 4 };
const saved = { feedback: { session_id: id }, safety_notice: null, next_generation_request_id: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ state: "authenticated", accessToken: "synthetic-token" });
  mocks.backend.mockResolvedValue(Response.json(saved, { status: 201 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("운동 후 설문 서버 연결", () => {
  it("통증이 없으면 safety_notice가 null인 실제 계약도 저장 성공이다", async () => {
    expect(await submitWorkoutFeedback(id, input)).toEqual({ state: "saved", safety_notice: "", next_generation_request_id: null });
    const [path, token, request] = mocks.backend.mock.calls[0];
    expect(path).toBe(`workout-sessions/${id}/feedback`);
    expect(token).toBe("synthetic-token");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual(input);
    expect(request.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("통증 안내와 다음 생성 요청을 화면에 필요한 값만 반환한다", async () => {
    mocks.backend.mockResolvedValue(Response.json({ ...saved, safety_notice: "통증이 계속되면 운동을 멈춰 주세요.", next_generation_request_id: id, internal: "private" }, { status: 201 }));
    expect(await submitWorkoutFeedback(id, { ...input, soreness_body_parts: ["허리"] })).toEqual({ state: "saved", safety_notice: "통증이 계속되면 운동을 멈춰 주세요.", next_generation_request_id: id });
  });

  it.each([
    { ...input, soreness_body_parts: ["없음", "허리"] },
    { ...input, soreness_body_parts: ["허리", "허리"] },
    { ...input, soreness_body_parts: ["목"] },
    { ...input, difficulty: 0 },
    { ...input, enjoyment: 6 },
  ])("잘못된 응답은 서버에 보내지 않는다: %j", async (bad) => {
    expect((await submitWorkoutFeedback(id, bad)).state).toBe("failed");
    expect(mocks.backend).not.toHaveBeenCalled();
  });

  it("로그인이 없으면 저장을 시도하지 않는다", async () => {
    mocks.session.mockResolvedValue({ state: "anonymous" });
    expect((await submitWorkoutFeedback(id, input)).state).toBe("unauthorized");
    expect(mocks.backend).not.toHaveBeenCalled();
  });

  it.each([401, 409, 500])("HTTP %i를 저장 성공으로 표시하지 않는다", async (status) => {
    mocks.backend.mockResolvedValue(new Response(null, { status }));
    expect((await submitWorkoutFeedback(id, input)).state).toBe(status === 401 ? "unauthorized" : "failed");
  });

  it("다른 세션의 응답이나 깨진 JSON은 성공으로 표시하지 않는다", async () => {
    mocks.backend.mockResolvedValue(Response.json({ ...saved, feedback: { session_id: "other" } }, { status: 201 }));
    expect((await submitWorkoutFeedback(id, input)).state).toBe("failed");
    mocks.backend.mockResolvedValue(new Response("<html>", { status: 201 }));
    expect((await submitWorkoutFeedback(id, input)).state).toBe("failed");
  });
});
