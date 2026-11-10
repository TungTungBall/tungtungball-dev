import { describe, expect, it } from "vitest";
import { jointAngle, parsePoseRule, RepetitionCounter, type Landmark, type PoseRule } from "@/lib/healthmith/pose-counter";
// 상태 머신 검사 전용 각도/시간. 실제 운동의 안전·합격 기준이 아니다.
const rule: PoseRule = { joints: [0, 1, 2], contracted_angle: 90, extended_angle: 150, min_visibility: .8, stable_frames: 2, min_cycle_ms: 500, max_gap_ms: 250, movement_degrees: 3 };
function pose(angle: number): Landmark[] {
  return [{ x: 1, y: 0, z: 0, visibility: 1, in_frame: true }, { x: 0, y: 0, z: 0, visibility: 1, in_frame: true }, { x: Math.cos(angle * Math.PI / 180), y: Math.sin(angle * Math.PI / 180), z: 0, visibility: 1, in_frame: true }];
}
describe("관절 각도와 반복 판정", () => {
  it("3차원 각도와 길이 0·비유한 좌표를 처리한다", () => {
    expect(jointAngle(...pose(90) as [Landmark, Landmark, Landmark])).toBeCloseTo(90);
    expect(jointAngle(...pose(180) as [Landmark, Landmark, Landmark])).toBeCloseTo(180);
    const p = pose(90); expect(jointAngle(p[0], p[0], p[2])).toBeNull();
    p[0].x = NaN; expect(jointAngle(p[0], p[1], p[2])).toBeNull();
  });
  it("펼침→수축→펼침을 안정적으로 관측했을 때 한 번만 센다", () => {
    const counter = new RepetitionCounter(rule);
    const angles = [160, 160, 120, 80, 80, 120, 160, 160, 160, 160];
    expect(angles.map((a, i) => counter.update(pose(a), i * 100).completed).filter(Boolean)).toHaveLength(1);
  });
  it("중간 자세 시작·임계값 진동·미완료 동작은 횟수를 올리지 않는다", () => {
    for (const angles of [[80, 80, 160, 160], [149, 151, 149, 151, 80, 80], [160, 160, 120, 120, 160, 160]]) {
      const counter = new RepetitionCounter(rule);
      expect(angles.some((a, i) => counter.update(pose(a), i * 100).completed)).toBe(false);
    }
  });
  it("신뢰도 저하·화면 이탈·프레임 공백 후에는 처음부터 다시 확인한다", () => {
    for (const bad of ["visibility", "frame", "gap"]) {
      const counter = new RepetitionCounter(rule);
      [160, 160, 80, 80].forEach((a, i) => counter.update(pose(a), i * 100));
      const p = pose(160);
      if (bad === "visibility") p[1].visibility = .1;
      if (bad === "frame") p[1].in_frame = false;
      counter.update(p, bad === "gap" ? 1000 : 400);
      expect(counter.update(pose(160), 1100).completed).toBe(false);
      expect(counter.update(pose(160), 1200).completed).toBe(false);
    }
  });
  it("중복/역순 프레임·너무 빠른 반복·reset으로 횟수를 조작할 수 없다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80, 80, 160, 160].forEach((a, i) => expect(counter.update(pose(a), i * 10).completed).toBe(false));
    expect(counter.update(pose(160), 40).completed).toBe(false);
    counter.reset();
    expect(counter.update(pose(160), 1000).completed).toBe(false);
  });
  it.each(["missing", "confidence"])("짧은 %s 누락은 확인한 자세만 유지하고 유실 중에는 횟수를 올리지 않는다", (reason) => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80, 80].forEach((a, i) => counter.update(pose(a), i * 100));
    const missing = reason === "missing" ? [] : pose(160);
    if (reason === "confidence") missing[1].visibility = .1;
    expect(counter.update(missing, 400).completed).toBe(false);
    expect(counter.update(pose(160), 500).completed).toBe(false);
    expect(counter.update(pose(160), 600).completed).toBe(true);
    expect(counter.update(pose(160), 700).completed).toBe(false);
  });
  it("누락 프레임이 계속 와도 마지막 유효 프레임부터 공백 상한을 계산한다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80, 80].forEach((a, i) => counter.update(pose(a), i * 100));
    for (const t of [400, 500, 600, 700, 800]) expect(counter.update([], t).completed).toBe(false);
    expect(counter.update(pose(160), 900).completed).toBe(false);
    expect(counter.update(pose(160), 1000).completed).toBe(false);
  });
  it("화면 밖 관절은 짧은 누락 유예 없이 판정을 초기화한다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80, 80].forEach((a, i) => counter.update(pose(a), i * 100));
    const p = pose(160); p[1].in_frame = false;
    counter.update(p, 400);
    expect(counter.update(pose(160), 500).completed).toBe(false);
    expect(counter.update(pose(160), 600).completed).toBe(false);
  });
  it("누락 전후의 프레임을 연속 자세 확인으로 합치지 않는다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80].forEach((a, i) => counter.update(pose(a), i * 100));
    counter.update([], 300);
    counter.update(pose(80), 400);
    expect(counter.update(pose(160), 500).completed).toBe(false);
    expect(counter.update(pose(160), 600).completed).toBe(false);
  });
  it("1회 후 짧은 서버 대기에도 펼침 기준점을 보존해 다음 왕복을 센다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 120, 80, 80, 120, 160].forEach((a, i) => counter.update(pose(a), i * 100));
    expect(counter.update(pose(160), 700).completed).toBe(true);
    counter.suspend();
    const results = [80, 80, 120, 160, 160].map((a, i) => counter.update(pose(a), 800 + i * 100));
    expect(results.filter((r) => r.completed)).toHaveLength(1);
  });
  it("서버 대기가 공백 상한보다 길면 이전 왕복과 연결하지 않는다", () => {
    const counter = new RepetitionCounter(rule);
    [160, 160, 80, 80, 160, 160].forEach((a, i) => counter.update(pose(a), i * 100));
    counter.suspend();
    const results = [80, 80, 160, 160].map((a, i) => counter.update(pose(a), 1000 + i * 100));
    expect(results.some((r) => r.completed)).toBe(false);
  });
  it("미등록·잘못된 관절/각도/신뢰도/시간 규칙을 활성화하지 않는다", () => {
    expect(parsePoseRule(rule)).toEqual(rule);
    for (const bad of [null, {}, { ...rule, joints: [0, 0, 2] }, { ...rule, contracted_angle: 170 }, { ...rule, min_visibility: 0 }, { ...rule, stable_frames: 0 }, { ...rule, max_gap_ms: -1 }]) expect(parsePoseRule(bad)).toBeNull();
  });
});
