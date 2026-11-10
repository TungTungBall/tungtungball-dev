import { parseSubmitResponse, parseSurveyDetail, UNKNOWN_MESSAGE } from "./response";
import type { DetailResult, SubmitResult, SurveyAnswers } from "./types";

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

function buildDetailUrl(baseUrl: string, id: string): URL | null {
  const base = buildSubmitUrl(baseUrl);
  if (!base || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return new URL(`${base.toString().replace(/\/$/, "")}/${encodeURIComponent(id)}`);
}

async function parseDetailResponse(response: Response, id: string): Promise<DetailResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "failed", message: "사전조사 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (response.status === 200) {
    const submission = parseSurveyDetail(body, id);
    return submission
      ? { state: "loaded", submission }
      : { state: "failed", message: "서버 응답을 확인할 수 없어요." };
  }
  if (response.status === 401) return { state: "unauthorized", message: "로그인 상태를 확인해 주세요." };
  if (response.status === 409 && typeof body === "object" && body !== null && "code" in body && body.code === "VERSION_CONFLICT") {
    return { state: "conflict", message: "다른 곳에서 내용이 바뀌었어요. 최신 내용을 다시 불러와 주세요." };
  }
  return { state: "failed", message: "사전조사 내용을 불러오거나 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
}

export async function getSurvey(
  baseUrl: string,
  accessToken: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DetailResult> {
  const url = buildDetailUrl(baseUrl, id);
  if (!url) return { state: "failed", message: "사전조사 주소를 확인할 수 없어요." };
  try {
    const response = await fetchImpl(url, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    return parseDetailResponse(response, id);
  } catch {
    return { state: "failed", message: "사전조사 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export async function patchSurvey(
  baseUrl: string,
  accessToken: string,
  id: string,
  version: number,
  answers: SurveyAnswers,
  fetchImpl: typeof fetch = fetch,
): Promise<DetailResult> {
  const url = buildDetailUrl(baseUrl, id);
  if (!url || !Number.isSafeInteger(version) || version < 1) {
    return { state: "failed", message: "사전조사 수정 정보를 확인해 주세요." };
  }
  try {
    const response = await fetchImpl(url, {
      method: "PATCH", cache: "no-store", redirect: "error",
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`, "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ answers, expected_version: version }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    return parseDetailResponse(response, id);
  } catch {
    return { state: "failed", message: UNKNOWN_MESSAGE };
  }
}
