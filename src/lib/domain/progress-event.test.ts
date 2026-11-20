import { describe, expect, it } from "vitest";
import {
  mergeProgressEvents,
  notificationProgressKind,
  parseProgressEvent,
  progressBadgeText,
  roParticle,
  stripLeadingEmoji,
  type ProgressEvent,
} from "./progress-event";

const evolution: ProgressEvent = {
  kind: "evolution",
  level: 16,
  prevLevel: 15,
  stage: 4,
  stageName: "꾸준러",
  prevStage: 3,
  prevStageName: "시동러",
};
const levelUp: ProgressEvent = {
  kind: "level_up",
  level: 5,
  prevLevel: 4,
  stage: 2,
  stageName: "꿈틀러",
  prevStage: 2,
  prevStageName: "꿈틀러",
};

describe("parseProgressEvent — DB가 준 값을 믿지 않고 모양을 확인한다", () => {
  it("올바른 값은 그대로 돌려준다", () => {
    expect(parseProgressEvent(evolution)).toEqual(evolution);
    expect(parseProgressEvent(levelUp)).toEqual(levelUp);
  });

  it("null·빈 값·엉뚱한 모양은 null이다", () => {
    expect(parseProgressEvent(null)).toBeNull();
    expect(parseProgressEvent(undefined)).toBeNull();
    expect(parseProgressEvent("진화")).toBeNull();
    expect(parseProgressEvent({})).toBeNull();
    expect(parseProgressEvent({ ...evolution, kind: "badge" })).toBeNull();
    expect(parseProgressEvent({ ...evolution, level: "16" })).toBeNull();
    expect(parseProgressEvent({ ...evolution, stage: 0 })).toBeNull(); // 단계는 1~7
    expect(parseProgressEvent({ ...evolution, stage: 8 })).toBeNull();
  });

  it("단계 이름이 없어도(null) 이벤트는 살린다 — 그림과 레벨은 보여줄 수 있다", () => {
    const e = parseProgressEvent({ ...evolution, stageName: null, prevStageName: undefined });
    expect(e?.stageName).toBeNull();
    expect(e?.prevStageName).toBeNull();
  });
});

describe("roParticle — 단계 이름 뒤 조사 (꾸준러로 / 대장으로 / 전설로)", () => {
  it.each([
    ["꾸준러", "로"], // 받침 없음
    ["시동러", "로"],
    ["불꽃러", "로"],
    ["꿈틀러", "로"],
    ["전설", "로"], // ㄹ 받침은 '로'
    ["대장", "으로"], // ㅇ 받침
    ["개노답", "으로"], // ㅂ 받침
  ])("%s → %s", (word, expected) => {
    expect(roParticle(word)).toBe(expected);
  });

  it("한글이 아니면 '로'로 둔다", () => {
    expect(roParticle("Lv")).toBe("로");
  });
});

describe("progressBadgeText — 시안의 '꾸준러로 진화 / Lv.16 달성'", () => {
  it("진화: 단계 이름을 강조 조각으로, 나머지는 '로 진화', 아래 줄은 'Lv.N 달성'", () => {
    expect(progressBadgeText(evolution)).toEqual({ accent: "꾸준러", rest: "로 진화", sub: "Lv.16 달성" });
  });

  it("받침 있는 단계도 맞는 조사를 쓴다 — 대장으로 진화", () => {
    expect(progressBadgeText({ ...evolution, stage: 6, stageName: "대장" })).toEqual({
      accent: "대장",
      rest: "으로 진화",
      sub: "Lv.16 달성",
    });
  });

  it("레벨업: 'Lv.5 레벨업' / 'Lv.4 → Lv.5'", () => {
    expect(progressBadgeText(levelUp)).toEqual({ accent: "Lv.5", rest: " 레벨업", sub: "Lv.4 → Lv.5" });
  });

  it("진화인데 단계 이름을 모르면 '다음 단계'로 말한다 — 빈 칸을 그리지 않는다", () => {
    expect(progressBadgeText({ ...evolution, stageName: null })).toEqual({
      accent: "다음 단계",
      rest: "로 진화",
      sub: "Lv.16 달성",
    });
  });
});

describe("notificationProgressKind — 알림함이 진화와 레벨업을 가른다", () => {
  it("level_up 유형에서 제목에 '진화'가 있으면 진화, 없으면 레벨업", () => {
    expect(notificationProgressKind({ type: "level_up", title: "🎉 낭만송곳니님이 진화했어요!" })).toBe("evolution");
    expect(notificationProgressKind({ type: "level_up", title: "⬆️ 낭만송곳니님이 레벨업!" })).toBe("level_up");
  });

  it("다른 유형은 제목에 '진화'가 있어도 null이다 (부정 확인)", () => {
    expect(notificationProgressKind({ type: "badge_earned", title: "진화 배지" })).toBeNull();
    expect(notificationProgressKind({ type: "record_beaten", title: "기록 갱신" })).toBeNull();
  });
});

describe("stripLeadingEmoji — 아이콘이 따로 있으니 제목 앞 이모지는 뗀다", () => {
  it.each([
    ["🎉 낭만송곳니님이 진화했어요!", "낭만송곳니님이 진화했어요!"],
    ["⬆️ 낭만송곳니님이 레벨업!", "낭만송곳니님이 레벨업!"],
    ["낭만송곳니님이 진화했어요!", "낭만송곳니님이 진화했어요!"], // 이모지가 없으면 그대로
  ])("%s", (input, expected) => {
    expect(stripLeadingEmoji(input)).toBe(expected);
  });

  it("제목 가운데의 이모지는 건드리지 않는다", () => {
    expect(stripLeadingEmoji("🎉 오늘은 💪 하는 날")).toBe("오늘은 💪 하는 날");
  });
});

describe("mergeProgressEvents — 같은 날 묶인 카드는 가장 큰 사건 하나를 보여준다", () => {
  it("진화가 레벨업을 이긴다", () => {
    expect(mergeProgressEvents([levelUp, evolution])).toEqual(evolution);
    expect(mergeProgressEvents([evolution, levelUp])).toEqual(evolution);
  });

  it("같은 종류면 레벨이 높은 쪽이다", () => {
    const higher = { ...levelUp, level: 6, prevLevel: 5 };
    expect(mergeProgressEvents([levelUp, higher])).toEqual(higher);
  });

  it("값이 하나도 없으면 null이다", () => {
    expect(mergeProgressEvents([null, null])).toBeNull();
    expect(mergeProgressEvents([])).toBeNull();
  });
});
