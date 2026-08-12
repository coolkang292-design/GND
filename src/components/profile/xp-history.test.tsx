// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { XpTransactionRow } from "@/lib/progression";
import { XpHistoryList } from "./xp-history";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

function row(metadata: Record<string, number | boolean>): XpTransactionRow {
  return {
    id: "xp-1",
    amount: 100,
    reason: "workout_completed",
    metadata,
    createdAt: "2026-08-10T10:00:00Z",
  };
}

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — XP 내역의 꼬리표도 "타바타"가 아니라
 * "전신 인터벌"이다. 판정에 쓰는 메타데이터 key(`is_tabata`)는 그대로다.
 */
describe("XpHistoryList — 전신 인터벌 꼬리표", () => {
  it("is_tabata인 내역에 '전신 인터벌' 꼬리표를 붙인다", () => {
    render(<XpHistoryList rows={[row({ is_tabata: true, base_xp: 100 })]} />);

    expect(screen.getByText("전신 인터벌")).toBeTruthy();
  });

  it("옛 용어 '타바타'는 남지 않는다", () => {
    // 제거 검증 — 새 문구만 찾으면 옛 문구가 사라졌는지 확인한 게 아니다.
    const { container } = render(
      <XpHistoryList rows={[row({ is_tabata: true, base_xp: 100 })]} />,
    );

    expect(container.textContent ?? "").not.toContain("타바타");
  });

  it("일반 운동 내역에는 꼬리표를 붙이지 않는다", () => {
    render(<XpHistoryList rows={[row({ base_xp: 100 })]} />);

    expect(screen.queryByText("전신 인터벌")).toBeNull();
  });
});
