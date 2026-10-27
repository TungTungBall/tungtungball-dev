import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps enabled conditional classes and drops disabled ones", () => {
    expect(cn("rounded", { "font-bold": true, hidden: false }, undefined)).toBe("rounded font-bold");
  });

  it("lets caller classes override conflicting Tailwind utilities", () => {
    expect(cn("px-4 py-2", "px-6")).toBe("py-2 px-6");
  });
});
