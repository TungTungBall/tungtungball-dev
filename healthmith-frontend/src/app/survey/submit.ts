import { parseSubmitResponse, UNKNOWN_MESSAGE } from "./response";
import type { SubmitResult, SurveyAnswers } from "./types";

// Spring POST /api/survey-submissions 호출. 서버(Server Function)에서만 쓴다.
// 주소·토큰을 화면 응답이나 로그에 넣지 않는다.

const SUBMIT_TIMEOUT_MS = 10_000;

export function buildSubmitUrl(baseUrl: string): URL | null {
  try {
    const base = new URL(baseUrl.trim());
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      return null;
    }
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    return new URL("api/survey-submissions", base);
  } catch {
    return null;
  }
}

/**
 * 한 번만 보낸다. 실패해도 자동으로 다시 보내지 않는다(응답 유실 때 중복 저장 방지 정책이 아직 없음).
 */
export async function postSurvey(
  baseUrl: string,
  accessToken: string,
  answers: SurveyAnswers,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const url = buildSubmitUrl(baseUrl);
  if (!url) {
    return { state: "save-failed", message: "서버 주소 설정을 확인해 주세요. 사전조사는 저장되지 않았어요." };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ answers }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch {
    // 요청이 서버에 닿았는지 알 수 없다. 저장 실패로 단정하지 않는다.
    return { state: "unknown", message: UNKNOWN_MESSAGE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "unknown", message: UNKNOWN_MESSAGE };
  }
  return parseSubmitResponse(response.status, body, answers);
}
