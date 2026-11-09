import { isBodyPart, isPurposeType } from "./validation";
import type { SavedSurvey, ServerFieldError, SubmitResult, SurveyAnswers } from "./types";

// 서버 응답은 unknown으로 받아 좁힌다 (CODE-STYLE 5번). as 단언으로 넘기지 않는다.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNKNOWN_MESSAGE = "저장되었는지 확인할 수 없어요. 새로 제출하기 전에 잠시 후 다시 확인해 주세요.";
const UNAUTHORIZED_MESSAGE = "로그인 상태를 확인해 주세요.";
const SAVE_FAILED_MESSAGE = "사전조사를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const INVALID_MESSAGE = "입력 내용을 확인해 주세요.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function isBodyPartArray(value: unknown): value is SurveyAnswers["priority_body_parts"] {
  return Array.isArray(value) && value.every(isBodyPart);
}

export function isSurveyAnswers(value: unknown): value is SurveyAnswers {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["physical_limitations", "purpose", "intensity", "priority_body_parts"])) return false;
  const limitations = value.physical_limitations;
  const purpose = value.purpose;
  return (
    isRecord(limitations) &&
    hasOnlyKeys(limitations, ["present", "body_parts"]) &&
    typeof limitations.present === "boolean" &&
    isBodyPartArray(limitations.body_parts) &&
    isRecord(purpose) &&
    hasOnlyKeys(purpose, ["type", "custom_text"]) &&
    isPurposeType(purpose.type) &&
    (purpose.custom_text === null || typeof purpose.custom_text === "string") &&
    typeof value.intensity === "number" &&
    Number.isInteger(value.intensity) &&
    isBodyPartArray(value.priority_body_parts)
  );
}

/** 보낸 값과 저장된 값이 같은지. 부위 순서와 자유 입력 원문까지 비교한다. */
export function sameAnswers(a: SurveyAnswers, b: SurveyAnswers): boolean {
  const sameParts = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((part, index) => part === y[index]);
  return (
    a.physical_limitations.present === b.physical_limitations.present &&
    sameParts(a.physical_limitations.body_parts, b.physical_limitations.body_parts) &&
    a.purpose.type === b.purpose.type &&
    a.purpose.custom_text === b.purpose.custom_text &&
    a.intensity === b.intensity &&
    sameParts(a.priority_body_parts, b.priority_body_parts)
  );
}

function parseSavedSurvey(body: unknown, sent: SurveyAnswers): SavedSurvey | null {
  if (!isRecord(body)) return null;
  const { id, answers, generation_request_status: status, created_at: createdAt } = body;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
  if (!isSurveyAnswers(answers) || !sameAnswers(answers, sent)) return null;
  if (status !== "prepared") return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  if ("user_id" in body) return null;
  return { id, answers, generation_request_status: status, created_at: createdAt };
}

function parseFieldErrors(value: unknown): ServerFieldError[] | null {
  if (!Array.isArray(value)) return null;
  const result: ServerFieldError[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { field, code, message } = item;
    if (typeof field !== "string" || typeof code !== "string" || typeof message !== "string") return null;
    result.push({ field, code, message });
  }
  return result;
}

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === "string" && body.message.trim() !== "" ? body.message : fallback;
}

/**
 * HTTP 상태와 본문으로 화면 결과를 정한다.
 * 계약(docs/API.md)과 다른 응답은 성공·실패로 단정하지 않고 unknown으로 둔다.
 */
export function parseSubmitResponse(status: number, body: unknown, sent: SurveyAnswers): SubmitResult {
  if (status === 201) {
    const submission = parseSavedSurvey(body, sent);
    return submission
      ? { state: "saved", submission }
      : { state: "unknown", message: UNKNOWN_MESSAGE };
  }

  if (!isRecord(body) || typeof body.code !== "string") {
    return { state: "unknown", message: UNKNOWN_MESSAGE };
  }
  const fieldErrors = parseFieldErrors(body.field_errors);
  if (fieldErrors === null) return { state: "unknown", message: UNKNOWN_MESSAGE };

  if (status === 400 && body.code === "INVALID_SURVEY") {
    return { state: "invalid", message: errorMessage(body, INVALID_MESSAGE), fieldErrors };
  }
  if (status === 401 && body.code === "UNAUTHORIZED") {
    return { state: "unauthorized", message: errorMessage(body, UNAUTHORIZED_MESSAGE) };
  }
  if (status === 500 && body.code === "SAVE_FAILED") {
    return { state: "save-failed", message: errorMessage(body, SAVE_FAILED_MESSAGE) };
  }
  return { state: "unknown", message: UNKNOWN_MESSAGE };
}
