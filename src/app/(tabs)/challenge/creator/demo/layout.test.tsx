import { afterEach, describe, expect, it, vi } from "vitest";
import CreatorDemoLayout from "./layout";

// 가짜 회원 20명이 실제 사용자에게 보이면 안 된다 — 운영·Preview 빌드에서 404여야 한다.
describe("Creator Studio preview route guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not found in production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => CreatorDemoLayout({ children: null })).toThrow();
  });

  it("renders with the preview banner in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => CreatorDemoLayout({ children: null })).not.toThrow();
  });
});
