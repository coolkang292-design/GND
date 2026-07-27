import { describe, expect, it } from "vitest";
import { RELEASE_NOTES, latestRelease, releaseById } from "./release-notes";

describe("release-notes", () => {
  it("항목이 하나 이상 있고 id가 고유하다", () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(0);
    const ids = RELEASE_NOTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("최신순으로 정렬돼 있다 (맨 앞이 가장 최근 날짜)", () => {
    for (let i = 1; i < RELEASE_NOTES.length; i++) {
      expect(
        RELEASE_NOTES[i - 1].date >= RELEASE_NOTES[i].date,
      ).toBe(true);
    }
  });

  it("latestRelease는 맨 앞 항목을 준다", () => {
    expect(latestRelease()).toBe(RELEASE_NOTES[0]);
  });

  it("releaseById는 일치하는 항목을, 없으면 null을 준다", () => {
    expect(releaseById(RELEASE_NOTES[0].id)).toBe(RELEASE_NOTES[0]);
    expect(releaseById("nope")).toBeNull();
  });

  it("각 항목은 제목·요약·하이라이트를 갖는다", () => {
    for (const r of RELEASE_NOTES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.highlights.length).toBeGreaterThan(0);
    }
  });
});
