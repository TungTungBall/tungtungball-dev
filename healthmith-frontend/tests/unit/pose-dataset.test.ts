import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parsePoseRule, RepetitionCounter, type Landmark } from "@/lib/healthmith/pose-counter";
import demoRules from "../../datasets/pose/demo-rules.json";
import checks from "../../datasets/pose/repetition-checks.json";
import mendeley from "../../datasets/pose/mendeley-clips.json";
import demo from "../../datasets/pose/demo-clips.json";

type Point = [number, number, number, number, 0 | 1];
type Frame = [number, Point[]];
type Dataset = { version: number; first_landmark: number; clips: { id: string; frames: Frame[] }[] };

function loadDataset(name: string): Dataset {
  const file = new URL(`../../datasets/pose/${name}-landmarks.json.gz`, import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as Dataset;
}

const datasets = [loadDataset("mendeley"), loadDataset("demo")];
const clips = new Map(datasets.flatMap((data) => data.clips.map(({ id, frames }) => [id, frames])));

describe("공개 영상에서 추출한 MediaPipe 회귀 데이터", () => {
  it("모든 클립이 출처 목록에 있고 영상 없이 순서와 추적 누락을 재현한다", () => {
    const manifest = [...mendeley.clips, ...demo.clips];
    expect(datasets.map(({ version, first_landmark }) => [version, first_landmark])).toEqual([[1, 11], [1, 11]]);
    expect([...clips.keys()]).toEqual(manifest.map(({ id }) => id));
    expect(new Set(manifest.map(({ exercise }) => exercise)).size).toBeGreaterThanOrEqual(14);
    for (const [id, frames] of clips) {
      const ordered = frames.every(([time], i) => Number.isInteger(time) && time > (frames[i - 1]?.[0] ?? -1));
      expect(ordered, `${id} timestamp`).toBe(true);

      const detected = frames.filter(([, points]) => points.length > 0);
      expect(detected.length, `${id} detected frames`).toBeGreaterThan(0);
      const validPoints = detected.every(([, points]) => points.length === 22 && points.every(
        ([x, y, z, visibility, inFrame]) => [x, y, z].every(Number.isFinite)
          && visibility >= 0 && visibility <= 1 && (inFrame === 0 || inFrame === 1),
      ));
      expect(validPoints, `${id} body landmarks`).toBe(true);
    }
    expect(new Set(mendeley.clips.map(({ sha256 }) => sha256)).size).toBe(mendeley.clips.length);
    const calibration = new Set(mendeley.clips.filter(({ split }) => split === "calibration").map(({ subject }) => subject));
    expect(mendeley.clips.some(({ split, subject }) => split === "holdout" && calibration.has(subject))).toBe(false);
  });

  it.each(checks)("$id의 수동 횟수를 기존 반복 판정기로 재현한다", ({ id, start_ms, end_ms, repetitions }) => {
    const rule = parsePoseRule(demoRules.squat);
    if (!rule) throw new Error("스쿼트 시연 규칙이 유효하지 않습니다.");
    const frames = clips.get(id);
    if (!frames) throw new Error(`클립이 없습니다: ${id}`);
    const window = frames.filter(([time]) => time >= start_ms && time < end_ms);
    expect(window.some(([, body]) => body.length > 0)).toBe(true);
    const counter = new RepetitionCounter(rule);
    let counted = 0;
    for (const [time, body] of window) {
      const points: Landmark[] = [];
      body.forEach(([x, y, z, visibility, inFrame], i) => {
        points[11 + i] = { x, y, z, visibility, in_frame: inFrame === 1 };
      });
      if (counter.update(points, time).completed) counted++;
    }
    expect(counted).toBe(repetitions);
  });
});
