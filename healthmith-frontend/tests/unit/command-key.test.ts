import { afterEach, expect, it, vi } from "vitest";
import { commandKey, finishCommand } from "@/lib/healthmith/command-key";
afterEach(() => vi.unstubAllGlobals());
it("결과를 확인하지 못한 시작은 같은 키를 유지하고, 성공 뒤 새 운동은 새 키를 쓴다", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => values.get(k), setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  const first = commandKey("start:confirmed-curriculum:2");
  expect(commandKey("start:confirmed-curriculum:2")).toBe(first);
  finishCommand("start:confirmed-curriculum:2");
  expect(commandKey("start:confirmed-curriculum:2")).not.toBe(first);
});
