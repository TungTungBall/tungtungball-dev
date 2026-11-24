export type BodyPart = "상체" | "하체" | "허리";
export type Purpose = "체력" | "감량" | "근력" | "자세" | "자유 입력";
export type Soreness = "없음" | BodyPart | "기타";
import type { GemState } from "./gem-data";
export type { GemState } from "./gem-data";

export const bodyParts: BodyPart[] = ["상체", "하체", "허리"];
export const purposes: Purpose[] = ["체력", "감량", "근력", "자세", "자유 입력"];
export const sorenessOptions: Soreness[] = ["없음", ...bodyParts, "기타"];

// Figma 시안 확인용 자료다. 지원 운동 선정이나 실제 생성 응답이 아니다.
export const previewStages: { name: string; exercise: string; target: number; instruction: string; gem: GemState }[] = [
  { name: "광석 채굴", exercise: "스쿼트", target: 10, instruction: "허벅지의 수축과 이완에 집중해요.", gem: "mined" },
  { name: "광석 쪼개기", exercise: "팔 올리기", target: 12, instruction: "어깨 주변 근육의 움직임을 느껴요.", gem: "split" },
  { name: "광석 세척", exercise: "제자리 걷기", target: 20, instruction: "다리를 올릴 때 허벅지에 집중해요.", gem: "washed" },
  { name: "광석 가공", exercise: "스쿼트", target: 10, instruction: "올라올 때 허벅지가 단단해져요.", gem: "cut" },
  { name: "보석 연마", exercise: "팔 올리기", target: 12, instruction: "팔을 내리며 근육이 풀어져요.", gem: "polished" },
];

export { gemStates } from "./gem-data";

export const previewScreens = [
  { id: "M01", title: "첫 여정의 시작", href: "/", label: "홈" },
  { id: "M02", title: "내 몸에 맞는 시작", href: "/preparation/body", label: "사전조사 1" },
  { id: "M03", title: "오늘의 목표", href: "/preparation/goals", label: "사전조사 2" },
  { id: "M04", title: "오늘의 운동 설계도", href: "/routine", label: "커리큘럼" },
  { id: "M05", title: "세공을 시작할 준비", href: "/camera", label: "카메라 준비" },
  { id: "M06", title: "광석 채굴", href: "/workout", label: "운동 게임" },
  { id: "M07", title: "잠시, 불을 낮추고", href: "/workout/paused", label: "일시정지" },
  { id: "M08", title: "오늘도 빛을 벼렸어요", href: "/workout/complete", label: "운동 완료" },
  { id: "M09", title: "오늘의 여정은 어땠나요", href: "/feedback", label: "운동 후 설문" },
  { id: "M10", title: "쌓여가는 나의 보석들", href: "/records?state=populated", label: "나의 기록" },
  { id: "M11", title: "빛과 시야를 열어주세요", href: "/camera/permission", label: "카메라 권한" },
  { id: "M12", title: "막힌 길에서 다시 준비해요", href: "/recovery", label: "복구 상태" },
];
