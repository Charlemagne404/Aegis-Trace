import { describe, expect, it } from "vitest";
import {
  detectBrowserPlatform,
  isLivePlatform,
  normalizePlatform,
  platformLabel
} from "./platform";

describe("platform helpers", () => {
  it("normalizes desktop platform names", () => {
    expect(normalizePlatform("Windows 11 Pro")).toBe("windows");
    expect(normalizePlatform("Darwin")).toBe("macos");
    expect(normalizePlatform("MacIntel")).toBe("macos");
    expect(normalizePlatform("Linux x86_64")).toBe("linux");
    expect(normalizePlatform("Plan 9")).toBe("unknown");
  });

  it("only treats Windows and macOS as live native adapters for now", () => {
    expect(isLivePlatform("windows")).toBe(true);
    expect(isLivePlatform("macos")).toBe(true);
    expect(isLivePlatform("linux")).toBe(false);
    expect(platformLabel("macos")).toBe("macOS");
  });

  it("detects the test browser platform without requiring a native runtime", () => {
    expect(["windows", "macos", "linux", "unknown"]).toContain(detectBrowserPlatform());
  });
});
