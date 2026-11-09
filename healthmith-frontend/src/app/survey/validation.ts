import {
  BODY_PARTS,
  FREE_PURPOSE,
  MAX_INTENSITY,
  MIN_INTENSITY,
  PURPOSE_TYPES,
  type BodyPart,
  type FieldErrors,
  type FormField,
  type PurposeType,
  type SurveyAnswers,
  type SurveyFormInput,
} from "./types";

export type ValidationResult =
  | { ok: true; answers: SurveyAnswers }
  | { ok: false; errors: FieldErrors };

const INTENSITY_PATTERN = /^\d+$/;

/** 서버 field_errors 경로 → 화면 칸. 모르는 경로는 null (전체 안내로만 표시). */
export function fieldFromServerPath(path: string): FormField | null {
  switch (path) {
    case "answers.physical_limitations":
    case "answers.physical_limitations.present":
      return "limitations";
    case "answers.physical_limitations.body_parts":
      return "limitationParts";
    case "answers.purpose":
    case "answers.purpose.type":
      return "purpose";
    case "answers.purpose.custom_text":
      return "customText";
    case "answers.intensity":
      return "intensity";
    case "answers.priority_body_parts":
      return "priorityParts";
    default:
      return null;
  }
}

export function isBodyPart(value: unknown): value is BodyPart {
  return typeof value === "string" && (BODY_PARTS as readonly string[]).includes(value);
}

export function isPurposeType(value: unknown): value is PurposeType {
  return typeof value === "string" && (PURPOSE_TYPES as readonly string[]).includes(value);
}

function hasDuplicate(parts: readonly string[]): boolean {
  return new Set(parts).size !== parts.length;
}

/**
 * 화면 입력을 검사하고 API 요청 answers로 바꾼다.
 * 값을 자동으로 고치지 않는다: 누락을 기본값으로 채우거나, 겹친 부위를 지우거나, 자유 입력을 자르지 않는다.
 */
export function validateSurvey(input: SurveyFormInput): ValidationResult {
  const errors: FieldErrors = {};

  if (input.limitationsPresent === null) {
    errors.limitations = "신체 제약이 있는지 골라 주세요.";
  } else if (input.limitationsPresent) {
    if (input.limitationParts.length === 0) {
      errors.limitationParts = "불편한 부위를 하나 이상 골라 주세요.";
    } else if (!input.limitationParts.every(isBodyPart) || hasDuplicate(input.limitationParts)) {
      errors.limitationParts = "부위를 다시 골라 주세요.";
    }
  }

  if (input.purposeType === null || !isPurposeType(input.purposeType)) {
    errors.purpose = "운동 목적을 골라 주세요.";
  } else if (input.purposeType === FREE_PURPOSE && input.customText.trim() === "") {
    errors.customText = "운동 목적을 직접 적어 주세요.";
  }

  const intensityText = input.intensity.trim();
  const intensity = INTENSITY_PATTERN.test(intensityText) ? Number(intensityText) : Number.NaN;
  if (!Number.isInteger(intensity) || intensity < MIN_INTENSITY || intensity > MAX_INTENSITY) {
    errors.intensity = `운동 강도는 ${MIN_INTENSITY}부터 ${MAX_INTENSITY}까지의 정수로 입력해 주세요.`;
  }

  if (input.priorityParts.length === 0) {
    errors.priorityParts = "운동하고 싶은 부위를 하나 이상 골라 주세요.";
  } else if (!input.priorityParts.every(isBodyPart) || hasDuplicate(input.priorityParts)) {
    errors.priorityParts = "부위를 다시 골라 주세요.";
  } else if (
    input.limitationsPresent === true &&
    input.priorityParts.some((part) => input.limitationParts.includes(part))
  ) {
    errors.priorityParts = "운동할 수 없는 부위가 우선 부위에 포함되어 있습니다. 우선 부위를 수정해 주세요.";
  }

  if (Object.keys(errors).length > 0 || input.limitationsPresent === null || input.purposeType === null) {
    return { ok: false, errors };
  }

  const purposeType = input.purposeType;
  return {
    ok: true,
    answers: {
      physical_limitations: {
        present: input.limitationsPresent,
        body_parts: input.limitationsPresent ? [...input.limitationParts] : [],
      },
      purpose: {
        type: purposeType,
        // 원문을 그대로 보낸다. 공백 검사에만 trim을 쓴다.
        custom_text: purposeType === FREE_PURPOSE ? input.customText : null,
      },
      intensity,
      priority_body_parts: [...input.priorityParts],
    },
  };
}

/** Server Function으로 넘어온 값은 브라우저가 바꿀 수 있으므로 모양부터 다시 확인한다. */
export function parseFormInput(value: unknown): SurveyFormInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  const { limitationsPresent, limitationParts, purposeType, customText, intensity, priorityParts } = record;
  if (limitationsPresent !== null && typeof limitationsPresent !== "boolean") return null;
  if (!Array.isArray(limitationParts) || !limitationParts.every(isBodyPart)) return null;
  if (purposeType !== null && !isPurposeType(purposeType)) return null;
  if (typeof customText !== "string" || typeof intensity !== "string") return null;
  if (!Array.isArray(priorityParts) || !priorityParts.every(isBodyPart)) return null;
  return { limitationsPresent, limitationParts, purposeType, customText, intensity, priorityParts };
}
