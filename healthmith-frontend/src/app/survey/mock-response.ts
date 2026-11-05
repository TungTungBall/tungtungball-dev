import type { SubmitResult, SurveyAnswers } from "./types";

// 임시 응답 (개발자2, 1단계). 저장 API #16·로그인 세션 #15가 병합되면 submit.ts의 실제 호출로 바꾸고 이 파일을 지운다.
// 실제 DB에 저장하지 않는다. 화면은 source: "mock"을 보고 '임시 응답'임을 함께 표시한다.

export const MOCK_SUBMISSION_ID = "00000000-0000-4000-8000-000000000000";

export async function mockSubmitSurvey(answers: SurveyAnswers): Promise<SubmitResult> {
  return {
    state: "saved",
    source: "mock",
    submission: {
      id: MOCK_SUBMISSION_ID,
      answers,
      generation_request_status: "prepared",
      created_at: new Date().toISOString(),
    },
  };
}
