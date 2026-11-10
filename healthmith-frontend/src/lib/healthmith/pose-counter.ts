import { isRecord, positive } from "./workout-contract";

export type PoseRule = { joints: [number, number, number]; contracted_angle: number; extended_angle: number; min_visibility: number; stable_frames: number; min_cycle_ms: number; max_gap_ms: number; movement_degrees: number };
export type CameraRule = PoseRule | { method: "push-up-motion" };
export type Landmark = { x: number; y: number; z: number; visibility: number; in_frame: boolean };

/** 운동별 검토한 기준만 등록한다. 운동명으로 판정 규칙을 추측하지 않는다. */
export function parsePoseRule(v: unknown): PoseRule | null {
  if (!isRecord(v) || !Array.isArray(v.joints) || v.joints.length !== 3 || new Set(v.joints).size !== 3
    || !v.joints.every((n) => Number.isInteger(n) && n >= 0 && n <= 32)
    || typeof v.contracted_angle !== "number" || typeof v.extended_angle !== "number"
    || !(v.contracted_angle > 0 && v.contracted_angle < v.extended_angle && v.extended_angle < 180)
    || typeof v.min_visibility !== "number" || v.min_visibility <= 0 || v.min_visibility > 1
    || !positive(v.stable_frames) || !positive(v.min_cycle_ms) || !positive(v.max_gap_ms)
    || typeof v.movement_degrees !== "number" || v.movement_degrees <= 0 || v.movement_degrees >= v.extended_angle - v.contracted_angle) return null;
  return { joints: v.joints as [number, number, number], contracted_angle: v.contracted_angle, extended_angle: v.extended_angle,
    min_visibility: v.min_visibility, stable_frames: v.stable_frames, min_cycle_ms: v.min_cycle_ms, max_gap_ms: v.max_gap_ms, movement_degrees: v.movement_degrees };
}

export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number | null {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const size = Math.hypot(...u) * Math.hypot(...v);
  if (!Number.isFinite(size) || size < 1e-8) return null;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i], 0) / size))) * 180 / Math.PI;
}

export class RepetitionCounter {
  private phase: "unready" | "extended" | "contracted" = "unready";
  private stable = 0;
  private lastTime = -Infinity;
  private lastValidTime = -Infinity;
  private cycleStart = 0;
  private lastAngle: number | null = null;
  constructor(private readonly rule: PoseRule) {}
  reset() { this.phase = "unready"; this.stable = 0; this.lastAngle = null; this.lastValidTime = -Infinity; }
  suspend() { this.stable = 0; this.lastAngle = null; }
  update(points: Landmark[], time: number): { completed: boolean; tracking: boolean; moving: boolean } {
    const empty = { completed: false, tracking: false, moving: false };
    if (!Number.isFinite(time) || time <= this.lastTime) return empty;
    if (time - this.lastValidTime > this.rule.max_gap_ms) this.reset();
    this.lastTime = time;
    const joints = this.rule.joints.map((i) => points[i]);
    if (joints.some((p) => p && (!p.in_frame || ![p.x, p.y, p.z].every(Number.isFinite)))) {
      this.reset(); return empty;
    }
    if (joints.some((p) => !p || !Number.isFinite(p.visibility) || p.visibility < this.rule.min_visibility)) {
      // 짧은 추적 누락 동안 확인한 자세만 유지한다. 누락된 동작을 보간하지 않는다.
      this.stable = 0; return empty;
    }
    const angle = jointAngle(joints[0], joints[1], joints[2]);
    if (angle === null) { this.reset(); return empty; }
    this.lastValidTime = time;
    const moving = this.lastAngle !== null && Math.abs(angle - this.lastAngle) >= this.rule.movement_degrees;
    if (this.lastAngle === null || moving) this.lastAngle = angle;
    const contracted = angle <= this.rule.contracted_angle, extended = angle >= this.rule.extended_angle;
    const reached = this.phase === "extended" ? contracted : extended;
    this.stable = reached ? this.stable + 1 : 0;
    let completed = false;
    if (this.stable >= this.rule.stable_frames) {
      this.stable = 0;
      if (this.phase === "unready") { this.phase = "extended"; this.cycleStart = time; }
      else if (this.phase === "extended") this.phase = "contracted";
      else {
        completed = time - this.cycleStart >= this.rule.min_cycle_ms;
        this.phase = "extended"; this.cycleStart = time;
      }
    }
    return { completed, tracking: true, moving };
  }
}
