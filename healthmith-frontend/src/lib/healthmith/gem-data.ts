export type GemState = "ore" | "mined" | "split" | "washed" | "cut" | "polished" | "pristine" | "cracked" | "fragments" | "stained" | "deformed" | "matte";

export const gemStates: { state: GemState; name: string; description: string; group: "progress" | "condition" }[] = [
  { state: "ore", name: "잠든 원석", description: "시작 전 · 암석 속 광물", group: "progress" },
  { state: "mined", name: "채굴한 광석", description: "1단계 · 붉은 광맥이 드러남", group: "progress" },
  { state: "split", name: "쪼개진 광석", description: "2단계 · 원석과 보석 분리", group: "progress" },
  { state: "washed", name: "세척한 원석", description: "3단계 · 이물질이 씻겨짐", group: "progress" },
  { state: "cut", name: "가공한 보석", description: "4단계 · 보석의 형태 형성", group: "progress" },
  { state: "polished", name: "연마된 보석", description: "5단계 · 완성된 루비", group: "progress" },
  { state: "pristine", name: "정상 · 빛나는 보석", description: "균형 잡힌 면과 선명한 광택", group: "condition" },
  { state: "cracked", name: "금이 간 보석", description: "중앙의 갈라진 선과 균열", group: "condition" },
  { state: "fragments", name: "잘게 쪼개진 보석", description: "여러 파편으로 분리된 형태", group: "condition" },
  { state: "stained", name: "얼룩이 남은 보석", description: "표면에 남은 황갈색 이물질", group: "condition" },
  { state: "deformed", name: "찌그러진 보석", description: "비대칭 윤곽과 어긋난 면", group: "condition" },
  { state: "matte", name: "광택이 없는 보석", description: "채도를 낮춘 면과 무광 표면", group: "condition" },
];
