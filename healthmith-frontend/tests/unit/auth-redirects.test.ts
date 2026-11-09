import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirects";

describe("OAuth 복귀 경로", () => {
  it.each([undefined, null, "https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/%0aevil", "/%zz", "/auth/callback", "/login", ["/survey"]])("외부·잘못된 경로 %s를 사전조사로 제한한다", (value) => {
    expect(safeNextPath(value)).toBe("/survey");
  });
  it("사이트 내부 경로와 query를 보존한다", () => {
    expect(safeNextPath("/records?state=empty")).toBe("/records?state=empty");
    expect(safeNextPath("/")).toBe("/");
  });
});
