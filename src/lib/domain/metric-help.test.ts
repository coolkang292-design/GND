import { describe, expect, it } from "vitest";
import {
  METRIC_HELP,
  metricHelpFor,
  type MetricHelpKey,
} from "./metric-help";

describe("METRIC_HELP", () => {
  it("모든 항목이 이름·뜻·계산을 갖는다", () => {
    for (const [key, help] of Object.entries(METRIC_HELP)) {
      expect(help.label, key).toBeTruthy();
      expect(help.meaning, key).toBeTruthy();
      expect(help.howMeasured, key).toBeTruthy();
    }
  });

  it("설명이 동어반복이 아니다", () => {
    // "활성 사용자: 활성 사용자입니다" 같은 설명은 없느니만 못하다.
    //
    // ⚠️ **글자 수로 품질을 재려 들지 마라.** 한 번 그렇게 짰다가 "완료 운동 ÷
    //    활성 사용자"처럼 짧고 정확한 설명이 걸려서, 임계값을 넘기려고 문장을
    //    늘리게 됐다. 그건 테스트가 글을 나쁘게 만드는 것이다. 겹치는지만 본다.
    for (const [key, help] of Object.entries(METRIC_HELP)) {
      expect(help.meaning, key).not.toBe(help.label);
      expect(help.howMeasured, key).not.toBe(help.meaning);
      expect(help.caveat ?? "있음", key).not.toBe("");
    }
  });

  it("뜻과 계산이 온전한 문장이다", () => {
    // 조각난 명사구를 두면 화면에서 설명이 아니라 메모처럼 읽힌다
    for (const [key, help] of Object.entries(METRIC_HELP)) {
      expect(help.meaning.trim(), key).toMatch(/[.!?]$/);
      expect(help.howMeasured.trim(), key).toMatch(/[.!?]$/);
    }
  });

  it("지표 이름이 서로 겹치지 않는다", () => {
    // 겹치면 설명 목록에 같은 이름이 두 줄로 뜬다
    const labels = Object.values(METRIC_HELP).map((h) => h.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("metricHelpFor", () => {
  it("요청한 순서대로 낸다", () => {
    const got = metricHelpFor(["dau", "wau", "mau"]);
    expect(got.map((h) => h.key)).toEqual(["dau", "wau", "mau"]);
    expect(got[0].label).toBe("DAU · 오늘");
  });

  it("없는 키는 던진다 — 설명 없는 지표가 조용히 생기지 않게", () => {
    expect(() =>
      metricHelpFor(["없는-지표" as MetricHelpKey]),
    ).toThrow("지표 설명이 없는 키");
  });

  it("빈 목록은 빈 결과다", () => {
    expect(metricHelpFor([])).toEqual([]);
  });
});
