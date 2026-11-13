import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelGrowthView } from "./level-growth-card";
import type { GrowthRecord, StageGrowth } from "@/lib/domain/level-growth";
import type { StageGrowthResult } from "@/lib/level-growth";

const rec = (name: string, pct: number, over: Partial<GrowthRecord> = {}): GrowthRecord => ({
  exerciseKey: name,
  kind: "w",
  baseline: 80,
  baselineDay: "2026-10-16",
  baselineBest: { weight: 60, reps: 10, seconds: null },
  current: 88,
  currentDay: "2026-11-13",
  currentBest: { weight: 66, reps: 10, seconds: null },
  growthPct: pct,
  ...over,
});
const summary = (over: Partial<StageGrowth>): StageGrowth => ({
  growths: [],
  unchangedCount: 0,
  unmatched: [],
  comparableCount: 0,
  previousStageExerciseCount: null,
  ...over,
});
const ready = (s: StageGrowth): StageGrowthResult => ({
  state: "ready",
  level: 17,
  stageIndex: 4,
  stageName: "꾸준러",
  enteredAt: "2026-11-01T00:00:00Z",
  summary: s,
});
/** 정적 렌더가 텍스트 노드 사이에 넣는 주석을 걷어 낸다 */
const html = (r: StageGrowthResult, open = false) =>
  renderToStaticMarkup(<LevelGrowthView result={r} defaultOpen={open} />).replace(/<!-- -->/g, "");

describe("LevelGrowthView", () => {
  it("다음 단계 필요4종목에 성장3개면 빈자리0을 포함한 평균과3/4를 표시한다", () => {
    const out = html(ready(summary({ previousStageExerciseCount: 18,
      growths: [rec("벤치", 10), rec("스쿼트", 8), rec("풀업", 6)] })));
    expect(out).toContain("진화 평가 평균");
    expect(out).toContain("+6.0%");
    expect(out).toContain("성장 종목 3 / 4");
    expect(out).toContain("0.0%");
    expect(out).toContain("상위 4종목 기준");
    expect(out).toContain("현재 진화는 경험치 기준이에요");
  });
  it("시동러 진입까지는 성장 평균을 진화 조건으로 표시하지 않는다", () => {
    const r = ready(summary({ previousStageExerciseCount: 18, growths: [rec("벤치", 10)] }));
    const out = html({ ...r, stageIndex: 2, stageName: "꿈틀러", level: 10 });
    expect(out).toContain("시동러까지는 경험치만으로 진화해요");
    expect(out).not.toContain("진화 평가 평균");
  });
  it("제목은 단계 이름, 기준 문구, 성장한 종목 수 — 종합 %는 없다", () => {
    const out = html(ready(summary({ growths: [rec("벤치", 10), rec("스쿼트", 5)] })));
    expect(out).toContain("내 성장 · 4단계 꾸준러");
    expect(out).toContain("기준: 4단계에 들어올 때까지의 종목별 최고 기록");
    expect(out).toContain("성장한 운동 2종목");
    expect(out).toContain("+10.0%");
    expect(out).toContain("+5.0%");
    expect(out).toContain("이전 단계 최고 기록 60kg × 10회 → 지금 66kg × 10회");
    expect(out).not.toContain("growth-value");
    expect(out).not.toContain("측정 준비 중");
  });

  it("옛 문구(얼마나 세졌나)와 확정·잠정 표기는 없다", () => {
    const out = html(ready(summary({ growths: [rec("벤치", 10)] })), true);
    expect(out).not.toContain("얼마나 세졌나");
    expect(out).not.toContain("잠정");
    expect(out).not.toContain("확정");
  });

  it("성장한 운동이 없으면 빈 상태 문구만 있고 숫자를 쓰지 않는다", () => {
    const out = html(ready(summary({ comparableCount: 2, unchangedCount: 2 })));
    expect(out).toContain(
      "아직 이번 단계에서 성장한 운동이 없어요. 지난 단계의 최고 기록을 넘기면 여기에 나타나요.",
    );
    expect(out).not.toContain("성장한 운동 0종목");
    expect(out).not.toMatch(/[+-]?\d+\.\d%/);
    expect(out).not.toContain("growth-toggle");
  });

  it("상위 3개는 접혀 있어도 보이고, 나머지는 펼쳐야 보인다", () => {
    const s = summary({
      growths: [rec("A운동", 40), rec("B운동", 30), rec("C운동", 20), rec("D운동", 10), rec("E운동", 5)],
    });
    const closed = html(ready(s), false);
    expect(closed.match(/data-testid="growth-record"/g)).toHaveLength(3);
    expect(closed).toContain("A운동");
    expect(closed).toContain("C운동");
    expect(closed).not.toContain("D운동");
    expect(closed).toContain("성장 기록 모두 보기");
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain("h-11");

    const open = html(ready(s), true);
    expect(open.match(/data-testid="growth-record"/g)).toHaveLength(5);
    expect(open).toContain("E운동");
    expect(open).toContain("성장 기록 접기");
    expect(open).toContain('aria-expanded="true"');
  });

  it("3개 이하이고 비교 불가도 없으면 토글이 없다", () => {
    const out = html(ready(summary({ growths: [rec("A운동", 10)] })));
    expect(out).not.toContain("growth-toggle");
  });

  it("비교 불가 종목은 펼치면 0%가 아니라 별도 구역에 적는다", () => {
    const s = summary({ unmatched: [{ exerciseKey: "덤벨 벤치프레스", kind: "w", reason: "no_baseline" as const }] });
    const closed = html(ready(s), false);
    expect(closed).not.toContain("덤벨 벤치프레스");
    expect(closed).toContain("growth-toggle");
    const out = html(ready(s), true);
    expect(out).toContain("이번 단계에서 비교하지 않는 운동");
    expect(out).toContain("덤벨 벤치프레스");
    expect(out).toContain("아직 비교할 이전 기록이 없어요. 다음 단계부터 비교해 드려요.");
    expect(out).not.toMatch(/0\.0%/);
  });

  it("기준선이 없으면(no_baseline) 준비 중 문구만 보이고 숫자가 없다", () => {
    const out = html({ state: "no_baseline", level: 3, stageIndex: 1, stageName: "개노답" });
    expect(out).toContain("내 성장 · 1단계 개노답");
    expect(out).toContain("측정 준비 중");
    expect(out).toContain("다음 진화 이후부터");
    expect(out).not.toMatch(/\d+\.\d%/);
    expect(out).not.toContain("얼마나 세졌나");
  });

  it("비교하지 않는 운동 구역: 사유별 문구가 나오고 성장 종목 수에는 들지 않는다", () => {
    const s = summary({
      growths: [rec("벤치", 10)],
      unmatched: [
        { exerciseKey: "오버헤드 프레스", kind: "w", reason: "jump" },
        { exerciseKey: "스쿼트", kind: "w", reason: "no_baseline" },
      ],
    });
    const out = html(ready(s), true);
    expect(out).toContain("이번 단계에서 비교하지 않는 운동");
    expect(out).toContain("오버헤드 프레스");
    expect(out).toContain("기록 차이가 너무 커서(기구나 무게 입력이 달라졌을 수 있어요)");
    expect(out).toContain("아직 비교할 이전 기록이 없어요. 다음 단계부터 비교해 드려요.");
    expect(out).toContain("성장한 운동 1종목");
    expect(out.match(/data-testid="growth-record"/g)).toHaveLength(1);
    expect(out.match(/data-testid="growth-unmatched"/g)).toHaveLength(2);
    expect(out).not.toContain("비교할 이전 기록이 없는 운동");
  });
});
