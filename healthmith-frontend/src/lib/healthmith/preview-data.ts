export type BodyPart = "상체" | "하체" | "허리";
export type Purpose = "체력" | "감량" | "근력" | "자세" | "자유 입력";
export type Soreness = "없음" | BodyPart | "기타";
export type GemState = "ore" | "mined" | "split" | "washed" | "cut" | "polished" | "pristine" | "cracked" | "fragments" | "stained" | "deformed" | "matte";

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

export const gemStates: { state: GemState; name: string; description: string; group: "progress" | "condition" }[] = [
  { state: "ore", name: "잠든 원석", description: "시작 전 · 암석 속 광물", group: "progress" },
  { state: "mined", name: "채굴한 광석", description: "1단계 · 녹색 광맥이 드러남", group: "progress" },
  { state: "split", name: "쪼개진 광석", description: "2단계 · 원석과 보석 분리", group: "progress" },
  { state: "washed", name: "세척한 원석", description: "3단계 · 이물질이 씻겨짐", group: "progress" },
  { state: "cut", name: "가공한 보석", description: "4단계 · 보석의 형태 형성", group: "progress" },
  { state: "polished", name: "연마된 보석", description: "5단계 · 완성된 에메랄드", group: "progress" },
  { state: "pristine", name: "정상 · 빛나는 보석", description: "균형 잡힌 면과 선명한 광택", group: "condition" },
  { state: "cracked", name: "금이 간 보석", description: "중앙의 갈라진 선과 균열", group: "condition" },
  { state: "fragments", name: "잘게 쪼개진 보석", description: "여러 파편으로 분리된 형태", group: "condition" },
  { state: "stained", name: "얼룩이 남은 보석", description: "표면에 남은 황갈색 이물질", group: "condition" },
  { state: "deformed", name: "찌그러진 보석", description: "비대칭 윤곽과 어긋난 면", group: "condition" },
  { state: "matte", name: "광택이 없는 보석", description: "채도를 낮춘 면과 무광 표면", group: "condition" },
];

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
