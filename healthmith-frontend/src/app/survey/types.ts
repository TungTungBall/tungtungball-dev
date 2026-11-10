// 사전조사 화면에서 쓰는 타입과 선택지.
// API·DB와 주고받는 키는 docs/API.md 그대로 snake_case, 화면 상태는 camelCase로 쓴다 (CODE-STYLE 1번).

/** 사전조사 부위. 2026-11-05 개발자1·2 결정으로 `기타`는 넣지 않는다 (API·SQL 허용 목록과 같음). */
export const BODY_PARTS = ["상체", "하체", "허리"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const PURPOSE_TYPES = ["체력", "감량", "근력", "자세", "자유 입력"] as const;
export type PurposeType = (typeof PURPOSE_TYPES)[number];

export const FREE_PURPOSE: PurposeType = "자유 입력";
export const MIN_INTENSITY = 1;
export const MAX_INTENSITY = 10;

/** POST /api/survey-submissions 요청의 answers (API 경계, snake_case). */
export type SurveyAnswers = {
  physical_limitations: { present: boolean; body_parts: BodyPart[] };
  purpose: { type: PurposeType; custom_text: string | null };
  intensity: number;
  priority_body_parts: BodyPart[];
};

/** 201 응답 본문. user_id는 응답에 없다. */
export type SavedSurvey = {
  id: string;
  answers: SurveyAnswers;
  generation_request_status: "prepared";
  created_at: string;
};

/** GET/PATCH 상세 응답. version은 수정 시 낙관적 동시성 검사에 쓴다. */
export type SurveyDetail = SavedSurvey & { version: number };

/** 화면 입력 상태. 아직 고르지 않은 값은 null이며 기본값으로 채우지 않는다. */
export type SurveyFormInput = {
  limitationsPresent: boolean | null;
  limitationParts: BodyPart[];
  purposeType: PurposeType | null;
  customText: string;
  intensity: string;
  priorityParts: BodyPart[];
};

/** 오류를 붙이는 화면 칸. 서버 field_errors[].field 경로를 이 이름으로 바꿔 표시한다. */
export type FormField = "limitations" | "limitationParts" | "purpose" | "customText" | "intensity" | "priorityParts";

export type FieldErrors = Partial<Record<FormField, string>>;

export type ServerFieldError = { field: string; code: string; message: string };

/** 제출 결과. 화면은 message 문장이 아니라 state·code로 분기한다. */
export type SubmitResult =
  | { state: "saved"; submission: SavedSurvey }
  | { state: "invalid"; message: string; fieldErrors: ServerFieldError[] }
  | { state: "unauthorized"; message: string }
  | { state: "save-failed"; message: string }
  | { state: "unknown"; message: string };

export type DetailResult =
  | { state: "loaded"; submission: SurveyDetail }
  | { state: "unauthorized"; message: string }
  | { state: "conflict"; message: string }
  | { state: "failed"; message: string };
