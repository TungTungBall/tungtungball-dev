import { describe, expect, it } from "vitest";
import { FRAME_HEIGHT, FRAME_WIDTH, PushUpMotionCounter } from "../../public/push-up-motion.mjs";

function frame(bodyY: number, cameraY = 0) {
  const pixels = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT);
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const sceneY = y - cameraY;
      const body = x >= 30 && x < 90 && sceneY >= bodyY && sceneY < bodyY + 30;
      const patternY = body ? sceneY - bodyY : sceneY;
      const texture = ((x * 61 + patternY * 127 + (x ^ patternY) * 97) & 63);
      pixels[y * FRAME_WIDTH + x] = (body ? 150 : 40) + texture;
    }
  }
  return pixels;
}

const descent = [15, 15, 18, 21, 24, 27, 30, 33];
const cycle = [...descent, 30, 27, 24, 21, 18, 15, 15];
function count(positions: number[], wholeFrame = false) {
  const counter = new PushUpMotionCounter();
  return positions.filter((y, i) => counter.update(
    wholeFrame ? frame(15, y - 15) : frame(y),
    i * 70,
  ).completed).length;
}

describe("푸시업 화면 움직임 판정", () => {
  it("중앙 피사체가 내려갔다 돌아오는 두 동작을 각각 한 번 센다", () => {
    expect(count([...cycle, ...cycle])).toBe(2);
  });
  it("정지와 올라오지 않은 동작은 세지 않는다", () => {
    expect(count(Array(30).fill(15))).toBe(0);
    expect(count(descent)).toBe(0);
  });
  it("배경까지 함께 움직인 왕복은 카메라 흔들림으로 처리한다", () => {
    expect(count(cycle, true)).toBe(0);
  });
  it("영상이 끊긴 전후의 내려가기와 올라오기를 합치지 않는다", () => {
    const counter = new PushUpMotionCounter();
    descent.forEach((y, i) => counter.update(frame(y), i * 70));
    const rest = cycle.slice(descent.length);
    expect(rest.some((y, i) => counter.update(frame(y), 1000 + i * 70).completed)).toBe(false);
  });
});
