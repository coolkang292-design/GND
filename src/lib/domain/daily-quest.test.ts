import { describe, expect, it } from "vitest";
import {
  QUEST_EYEBROW,
  QUEST_PUSH_TITLE,
  dailyQuestCopy,
  planQuestCopy,
  splitQuestTitle,
  questNamesLine,
  questPushCopy,
  shouldAutoSetQuest,
} from "./daily-quest";
import { MAX_DAILY_WORKOUT_XP_NOW } from "./xp";

const TODAY = "2026-11-06";

describe("dailyQuestCopy — 도착 알림 + 클리어 혜택", () => {
  it("'오늘의 퀘스트가 도착했어요'로 시작한다", () => {
    const c = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 3 });
    expect(c.eyebrow).toBe(QUEST_EYEBROW);
    expect(c.eyebrow).toContain("오늘의 퀘스트가 도착했어요");
  });

  it("XP는 **실제로 받을 수 있는 최대치** 상수를 쓴다 (받을 수 없는 XP를 약속하지 않는다)", () => {
    const c = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 3 });
    expect(c.hooks[0]).toBe(`⚡ 최대 +${MAX_DAILY_WORKOUT_XP_NOW} XP`);
    expect(MAX_DAILY_WORKOUT_XP_NOW).toBe(160);
  });

  it("연속 중이면 내일 숫자를, 끊겼으면 숫자 없이 '다시 1일'을 말한다 (0일째 금지)", () => {
    const on = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 5 });
    expect(on.hooks).toContain("🔥 6일 연속");

    const off = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 0 });
    expect(off.hooks).toContain("🔥 다시 1일");
    expect(off.hooks.join(" ")).not.toContain("0일");
    expect(off.hooks.join(" ")).not.toContain("1일 연속");
  });

  it("연속을 아직 모르면(null) 그 줄을 아예 뺀다 — 0으로 채워 거짓을 말하지 않는다", () => {
    const c = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: null });
    expect(c.hooks.some((h) => h.includes("🔥"))).toBe(false);
    expect(c.hooks).toEqual(["⚡ 최대 +160 XP"]);
  });

  it("종목이 담겼으면 이름까지, 아직이면 '세팅할게요'", () => {
    const applied = dailyQuestCopy({
      kind: "repeat", todayKey: TODAY, streak: 1, applied: true,
      names: ["벤치프레스", "랫풀다운"],
    });
    expect(applied.lead).toBe("지난 운동으로 오늘 목록을 세팅해 뒀어요 · 벤치프레스 · 랫풀다운");

    const pending = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 1 });
    expect(pending.lead).toBe("지난 운동을 바탕으로 추천했어요");
  });

  it("내가 직접 짠 계획이면 '세팅해 뒀어요'가 아니라 '오늘 계획한 운동'이라고 말한다", () => {
    const c = dailyQuestCopy({
      kind: "repeat", todayKey: TODAY, streak: 1, applied: true, planned: true,
      names: ["스쿼트", "레그프레스"],
    });
    expect(c.lead).toBe("오늘 계획한 운동이에요 · 스쿼트 · 레그프레스");
    expect(c.lead).not.toContain("세팅");
  });

  it("걷기·인터벌 퀘스트는 각자의 말을 한다", () => {
    expect(dailyQuestCopy({ kind: "walk", todayKey: TODAY, streak: 0 }).lead).toContain("10분");
    expect(dailyQuestCopy({ kind: "interval", todayKey: TODAY, streak: 0 }).lead).toContain("4분");
  });

  it("제목은 날짜로 도는 결정적 로테이션이다 (렌더마다 바뀌지 않는다)", () => {
    const a = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 2 }).title;
    const b = dailyQuestCopy({ kind: "repeat", todayKey: TODAY, streak: 2 }).title;
    expect(a).toBe(b);
    const titles = new Set(
      ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].map(
        (d) => dailyQuestCopy({ kind: "repeat", todayKey: d, streak: 2 }).title,
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });
});

describe("questNamesLine", () => {
  it("3개까지, 넘으면 '외 N'", () => {
    expect(questNamesLine(["a", "b", "c"])).toBe("a · b · c");
    expect(questNamesLine(["a", "b", "c", "d", "e"])).toBe("a · b · c 외 2");
    expect(questNamesLine([])).toBe("");
    expect(questNamesLine(["  ", "a"])).toBe("a");
  });
});

describe("shouldAutoSetQuest — 자동 세팅 조건", () => {
  const base = {
    kind: "repeat" as const,
    draftExerciseCount: 0,
    workoutStarted: false,
    alreadyDoneToday: false,
  };

  it("지난 운동이 있고(repeat) 목록이 비었으면 자동 세팅한다", () => {
    expect(shouldAutoSetQuest(base)).toBe(true);
  });

  it("걷기도 열자마자 세팅한다 — 운동 시작 한 번이면 시작되게 (2026-11-06)", () => {
    expect(shouldAutoSetQuest({ ...base, kind: "walk" })).toBe(true);
  });

  it("인터벌은 자동으로 담지 않는다 — 시트를 열어야 한다", () => {
    expect(shouldAutoSetQuest({ ...base, kind: "interval" })).toBe(false);
    expect(shouldAutoSetQuest({ ...base, kind: null })).toBe(false);
  });

  it("사용자가 만든 목록·시작한 운동은 덮지 않는다", () => {
    expect(shouldAutoSetQuest({ ...base, draftExerciseCount: 1 })).toBe(false);
    expect(shouldAutoSetQuest({ ...base, workoutStarted: true })).toBe(false);
  });

  it("하루 한 번만 — 사용자가 비웠으면 다시 채우지 않는다", () => {
    expect(shouldAutoSetQuest({ ...base, alreadyDoneToday: true })).toBe(false);
  });
});

describe("questPushCopy — 알림", () => {
  it("제목은 항상 '오늘의 퀘스트가 도착했어요'", () => {
    for (const kind of ["repeat", "walk", "interval"] as const) {
      expect(questPushCopy(kind, TODAY).title).toBe(QUEST_PUSH_TITLE);
    }
    expect(QUEST_PUSH_TITLE).toContain("오늘의 퀘스트가 도착했어요");
  });

  it("지난 운동·걷기는 '열면 운동이 세팅돼 있어요', 인터벌은 그 말을 하지 않는다 (거짓 금지)", () => {
    expect(questPushCopy("repeat", TODAY).body).toContain("열면 운동이 세팅돼 있어요");
    expect(questPushCopy("walk", TODAY).body).toContain("열면 운동이 세팅돼 있어요");
    expect(questPushCopy("interval", TODAY).body).not.toContain("세팅돼 있어요");
  });

  it("혜택은 화면 카드와 같은 XP 상수", () => {
    for (const kind of ["repeat", "walk", "interval"] as const) {
      expect(questPushCopy(kind, TODAY).body).toContain(`최대 +${MAX_DAILY_WORKOUT_XP_NOW} XP`);
    }
  });
});

describe("planQuestCopy — 인터벌·프로그램 계획을 퀘스트 카드로", () => {
  it("인터벌 계획: 코스 요약과 '계획한' 문구, 거짓 약속 없음", () => {
    const copy = planQuestCopy({ interval: true, title: null, detail: "푸시업 · 버드독", streak: 3 });
    expect(copy.title).toBe("오늘은 전신 인터벌이에요");
    expect(copy.headline[1]).toBe("오늘 인터벌 완료");
    expect(copy.lead).toBe("오늘 계획한 인터벌예요 · 푸시업 · 버드독");
    expect(copy.hooks).toEqual([expect.stringContaining("최대"), "🔥 4일 연속"]);
  });

  it("프로그램 회차: 제목을 쓰고, 없으면 기본 제목", () => {
    expect(planQuestCopy({ interval: false, title: "3주차 1회차", detail: "스쿼트", streak: null }).title).toBe("3주차 1회차");
    expect(planQuestCopy({ interval: false, title: null, detail: "", streak: null }).title).toBe("오늘 프로그램 회차");
  });

  it("연속 일수가 모르면 줄을 빼고, 끊겼으면 숫자를 말하지 않는다", () => {
    expect(planQuestCopy({ interval: true, title: null, detail: "", streak: null }).hooks).toHaveLength(1);
    expect(planQuestCopy({ interval: true, title: null, detail: "", streak: 0 }).hooks[1]).toBe("🔥 다시 1일");
  });
});

describe("splitQuestTitle — 제목을 두 줄로", () => {
  it("쉼표에서 나눈다: 앞줄 흰색 · 뒷줄 라임", () => {
    expect(splitQuestTitle("딱 4분, 심장을 깨워라!")).toEqual(["딱 4분,", "심장을 깨워라!"]);
  });
  it("쉼표가 없으면 단어 절반쯤에서 자른다", () => {
    expect(splitQuestTitle("오늘 한 번 더 가자")).toEqual(["오늘 한 번", "더 가자"]);
  });
  it("한 단어면 뒷줄이 비고, 빈 문자열도 터지지 않는다", () => {
    expect(splitQuestTitle("파이팅")).toEqual(["파이팅", ""]);
    expect(splitQuestTitle("")).toEqual(["", ""]);
  });
  it("실제 제목은 전부 쉼표가 있어 두 줄로 읽힌다", () => {
    for (const kind of ["repeat", "walk", "interval"] as const) {
      for (let day = 1; day <= 28; day += 1) {
        const key = `2026-11-${String(day).padStart(2, "0")}`;
        const [a, b] = splitQuestTitle(dailyQuestCopy({ kind, todayKey: key, streak: 1 }).title);
        expect(a.length).toBeGreaterThan(0);
        expect(b.length).toBeGreaterThan(0);
      }
    }
  });
});
