import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelGrowthView } from "./level-growth-card";
import {
  CONFIRM_DAYS,
  MIN_CONFIRMED_EXERCISES,
  type ExerciseLevelGrowth,
  type LevelGrowthSummary,
} from "@/lib/domain/level-growth";

const day = (d: string, value: number) => ({ day: d, value, best: { weight: 16, reps: 12, seconds: null } });
const ex = (over: Partial<ExerciseLevelGrowth>): ExerciseLevelGrowth => ({
  exerciseKey: "덤벨 숄더 프레스",
  kind: "w",
  baseline: 23.33,
  baselineSamples: [day("2026-10-16", 23.33), day("2026-10-24", 23.33), day("2026-11-07", 21.87)],
  current: 25.07,
  currentSamples: [day("2026-11-13", 25.07)],
  currentDayCount: 1,
  growthPct: 7.44,
  status: "provisional",
  ...over,
});
const summary = (over: Partial<LevelGrowthSummary>): LevelGrowthSummary => ({
  exercises: [],
  confirmedCount: 0,
  value: null,
  provisionalCount: 0,
  provisionalValue: null,
  unmatched: [],
  ...over,
});
const html = (s: LevelGrowthSummary, open = false) =>
  renderToStaticMarkup(
    <LevelGrowthView result={{ state: "ready", level: 19, enteredAt: "2026-11-08T23:22:08Z", summary: s }} defaultOpen={open} />,
  );

describe("LevelGrowthView", () => {
  it("확정 수치가 있으면 그 값과 비교 종목 수를 보여 준다", () => {
    const out = html(summary({ value: 5.04, confirmedCount: 3 }));
    expect(out).toContain("내 성장 · Lv.19");
    expect(out).toContain("+5.0%");
    expect(out).toContain("기준: Lv.19 진입 전 운동 기록");
    expect(out).toContain("비교한 운동: 3종목");
    expect(out).not.toContain("측정 준비 중");
  });

  it("확정이 없으면 '측정 준비 중'이고, 잠정값은 참고라고 밝힌다", () => {
    const out = html(summary({ provisionalValue: 4.0, provisionalCount: 3 }));
    expect(out).toContain("측정 준비 중");
    expect(out).toContain("참고");
    expect(out).toContain("+4.0%");
  });

  it("잠정값도 없으면 숫자를 하나도 쓰지 않는다", () => {
    const out = html(summary({}));
    expect(out).toContain("측정 준비 중");
    expect(out).not.toMatch(/[+-]?\d+\.\d%/);
  });

  it("옛 문구(얼마나 세졌나)는 없다", () => {
    expect(html(summary({ value: 5, confirmedCount: 2 }))).not.toContain("얼마나 세졌나");
  });

  it("펼치면 종목별 기준·현재·날짜·상태가 보인다", () => {
    const out = html(summary({ exercises: [ex({})], provisionalCount: 1 }), true);
    expect(out).toContain("덤벨 숄더 프레스");
    expect(out).toContain("잠정");
    expect(out).toContain("+7.4%");
    expect(out).toContain("10/16");
    expect(out).toContain("11/13");
    expect(out).toContain("2일 더 기록하면 성장률을 확정할 수 있어요.");
  });

  it("기준선이 없는 새 종목은 0%가 아니라 비교 불가로 적는다", () => {
    const out = html(
      summary({ unmatched: [{ exerciseKey: "덤벨 벤치프레스", kind: "w", currentDayCount: 1 }] }),
      true,
    );
    expect(out).toContain("덤벨 벤치프레스");
    expect(out).toContain("아직 비교할 기준 기록이 없어요");
  });

  it("레벨 진입 이력이 없으면 준비 중만 보인다", () => {
    const out = renderToStaticMarkup(<LevelGrowthView result={{ state: "no_entry", level: 1 }} />);
    expect(out).toContain("측정 준비 중");
    expect(out).toContain("레벨이 오르면");
  });

  it("접혀 있으면 종목 행이 없고, defaultOpen이면 있다", () => {
    const s = summary({ exercises: [ex({})], provisionalCount: 1 });
    expect(html(s, false)).not.toContain("growth-exercise");
    expect(html(s, false)).not.toContain("덤벨 숄더 프레스");
    expect(html(s, true)).toContain("growth-exercise");
  });

  it("확정 수치가 있으면 잠정 참고 줄은 없다", () => {
    const out = html(summary({ value: 5.04, confirmedCount: 3, provisionalValue: 4.0, provisionalCount: 3 }));
    expect(out).not.toContain("참고");
    expect(out).not.toContain("growth-provisional");
  });

  it("확정 조건 안내는 상수를 따른다", () => {
    const out = html(summary({}));
    const text = out.replace(/<!-- -->/g, "");
    expect(text).toContain(`${CONFIRM_DAYS}일 기록한 종목이 ${MIN_CONFIRMED_EXERCISES}개 이상`);
  });

  it("기준 기록이 비어 있으면 '아직'이 아니라 못 찾았다고 적는다", () => {
    const out = html(
      summary({ exercises: [ex({ baselineSamples: [], currentSamples: [] })], provisionalCount: 1 }),
      true,
    );
    expect(out).toContain("기준 기록을 찾지 못했어요");
    expect(out).toContain("아직 기록이 없어요"); // 현재 레벨 쪽만
    expect(out.match(/아직 기록이 없어요/g)).toHaveLength(1);
  });
});
