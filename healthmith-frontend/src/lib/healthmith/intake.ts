/** 새 화면의 입력 모델. 현재 업무 API에 보내는 DTO와 의도적으로 분리한다. */
export const LIMITATION_PARTS = ["목", "어깨", "팔꿈치", "손목", "허리", "고관절", "무릎", "발목"] as const;
export type LimitationPart = typeof LIMITATION_PARTS[number];
export const PRIORITY_PARTS = ["팔", "다리", "코어", "어깨", "가슴", "목"] as const;
export const EXPERIENCES = ["처음 시작해요", "가끔 해봤어요", "꾸준히 해왔어요"] as const;
export const LEVELS = ["기초 동작부터 배울래요", "가벼운 루틴은 할 수 있어요", "여러 세트를 할 수 있어요"] as const;
export const GOALS = ["체력 기르기", "근력 키우기", "체중 관리", "운동 습관"] as const;
export const INTENSITIES = ["가볍게", "보통", "강하게"] as const;
export const SEVERITIES = ["약함", "보통", "심함"] as const;
export type LimitationDetail = { side: string | null; severity: typeof SEVERITIES[number] | null };
export type IntakeInput = {
  goal: string | null; experience: string | null; level: string | null;
  minutes: number | null; days: number | null; limitationsPresent: boolean | null;
  limitations: Partial<Record<LimitationPart, LimitationDetail>>;
  intensity: typeof INTENSITIES[number] | null; priorities: (typeof PRIORITY_PARTS[number])[];
};
export const emptyIntake = (): IntakeInput => ({goal: null, experience: null, level: null, minutes: null, days: null, limitationsPresent: null, limitations: {}, intensity: null, priorities: []});
export const sidesFor = (part: LimitationPart) => part === "목" || part === "허리" ? ["중앙"] : ["왼쪽", "오른쪽", "양쪽"];
export function intakeStepError(input: IntakeInput, step: number): string | null {
  if (step === 0 && !GOALS.some(v => v === input.goal)) return "운동 목표를 하나 골라 주세요.";
  if (step === 1 && !EXPERIENCES.some(v => v === input.experience)) return "운동 경험을 골라 주세요.";
  if (step === 3 && (!input.minutes || ![10, 20, 30, 45, 60].includes(input.minutes) || !input.days || !Number.isInteger(input.days) || input.days < 1 || input.days > 7)) return "한 번 운동 시간과 주당 횟수를 모두 골라 주세요.";
  if (step === 4) {
    if (input.limitationsPresent === null) return "제한 부위가 있는지 골라 주세요. 없다면 ‘없음’을 선택해 주세요.";
    const parts = Object.keys(input.limitations) as LimitationPart[];
    if (input.limitationsPresent && !parts.length) return "불편한 부위를 하나 이상 골라 주세요.";
    if (input.limitationsPresent) for (const part of parts) {
      const detail = input.limitations[part];
      if (!LIMITATION_PARTS.includes(part) || !sidesFor(part).includes(detail?.side ?? "") || !SEVERITIES.some(v => v === detail?.severity)) return `${part}의 위치와 불편 정도를 골라 주세요.`;
    }
  }
  return null;
}
