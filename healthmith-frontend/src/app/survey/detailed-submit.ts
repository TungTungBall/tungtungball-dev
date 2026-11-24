import { buildSubmitUrl } from "./submit";
import { fromIntakeAnswers, toIntakeAnswers, parseIntakeDetail, type IntakeResult } from "@/lib/healthmith/intake-contract";

export async function requestDetailedSurvey(base: string, token: string, suffix: string, method: "GET" | "POST" | "PATCH", payload?: unknown, key?: string, fetchImpl: typeof fetch = fetch): Promise<IntakeResult> {
  const url = buildSubmitUrl(base);
  if (!url) return {state:"failed",message:"서버 주소 설정을 확인해 주세요."};
  url.pathname = url.pathname.replace(/api\/survey-submissions$/, "api/v2/survey-submissions") + suffix;
  try {
    const response = await fetchImpl(url, {method, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(10_000),
      headers:{Accept:"application/json", Authorization:`Bearer ${token}`, ...(payload ? {"Content-Type":"application/json"} : {}), ...(key ? {"Idempotency-Key":key} : {})},
      body:payload ? JSON.stringify(payload) : undefined,
    });
    if (response.status === 401) return {state:"unauthorized",message:"로그인이 필요해요. 로그인 후 다시 시도해 주세요."};
    if (response.status === 404) return {state:"not-found",message:method === "GET" ? "저장된 사전조사가 없거나 조회할 수 없어요." : "서버가 새 사전조사 저장을 지원하지 않아요. 입력은 그대로 유지돼요."};
    if (response.status === 409) return {state:"conflict",message:"저장 버전이나 요청이 충돌했어요. 입력 대신 최신 저장본을 불러온 뒤 다시 수정해 주세요."};
    if (response.status === 400) return {state:"failed",message:"입력 항목을 확인해 주세요. 저장하지 못했어요."};
    if (response.ok) {
      const submission = parseIntakeDetail(await response.json());
      if (submission && (!suffix || suffix === "/latest" || submission.id.toLowerCase() === suffix.slice(1).toLowerCase())) {
        if (method === "GET") return {state:"saved",submission};
        const sent = payload as {answers?: unknown; expected_version?: number};
        const expected = fromIntakeAnswers(sent?.answers);
        const received = fromIntakeAnswers(submission.answers)!;
        if (expected && submission.version === (method === "POST" ? 1 : (sent.expected_version ?? 0) + 1)
            && JSON.stringify(toIntakeAnswers(expected)) === JSON.stringify(toIntakeAnswers(received))) return {state:"saved",submission};
      }
    }
  } catch { /* 토큰·입력은 로그에 남기지 않는다. 응답 유실 때 같은 키로 재시도한다. */ }
  return {state:method === "GET" ? "failed" : "unknown",message:method === "GET" ? "저장 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "저장 결과를 확인하지 못했어요. 화면을 유지하고 같은 요청으로 다시 확인해 주세요."};
}
