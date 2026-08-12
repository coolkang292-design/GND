import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CurrentStageCard } from "./current-stage-card";
import { GrowthTimeline } from "./growth-timeline";
import { LevelRewards } from "./level-rewards";
import { NextStagePreview } from "./next-stage-preview";
import { StageCarousel } from "./stage-carousel";
import { StageGuideSheet } from "./stage-guide-sheet";
import { XpGuideSheet } from "./xp-guide-sheet";
import type { LevelReward, ProgressSummary } from "@/lib/progression";

function summary(over: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    totalXp: 740,
    currentLevel: 4,
    currentStage: 1,
    stageName: "개노답",
    characterPath: "/characters/char-1.png",
    nextLevelRequiredXp: 800,
    xpToNextLevel: 60,
    levelProgressPercent: 70,
    streakShieldCount: 0,
    hasReceivedTodayWorkoutXp: false,
    ...over,
  };
}

describe("CurrentStageCard", () => {
  it("단계·레벨·진행률·남은 XP를 표시한다", () => {
    const html = renderToStaticMarkup(
      <CurrentStageCard summary={summary()} onGuideClick={() => {}} />,
    );
    expect(html).toContain("개노답 Lv.4");
    expect(html).toContain("다음 레벨까지 60 XP");
    expect(html).toContain('aria-valuenow="70"');
    expect(html).toContain("7단계 안내");
  });

  it("최고 레벨이면 남은 XP 대신 달성 문구", () => {
    const html = renderToStaticMarkup(
      <CurrentStageCard
        summary={summary({
          currentLevel: 35,
          currentStage: 7,
          stageName: "전설이개",
          nextLevelRequiredXp: null,
          xpToNextLevel: 0,
          levelProgressPercent: 100,
        })}
        onGuideClick={() => {}}
      />,
    );
    expect(html).toContain("최고 단계");
    expect(html).not.toContain("다음 레벨까지");
  });
});

describe("LevelRewards — 修正2 준비 중 혜택", () => {
  const rewards: LevelReward[] = [
    { level: 1, rewardKey: "a_done", rewardLabel: "해금된 보상", rewardStatus: "active" },
    { level: 3, rewardKey: "b_soon", rewardLabel: "아직 없는 기능", rewardStatus: "coming_soon" },
    { level: 5, rewardKey: "c_future", rewardLabel: "미래 보상", rewardStatus: "active" },
    { level: 2, rewardKey: "d_hidden", rewardLabel: "숨김 보상", rewardStatus: "data_only" },
  ];

  it("레벨을 넘겼어도 coming_soon은 '해금됨'이 아니라 '준비 중'", () => {
    const html = renderToStaticMarkup(
      <LevelRewards
        rewards={rewards}
        unlocks={new Set(["a_done", "b_soon"])}
        currentLevel={4}
        currentStage={1}
      />,
    );
    const soonIndex = html.indexOf("아직 없는 기능");
    expect(soonIndex).toBeGreaterThan(-1);
    // 해당 항목 뒤에 붙는 배지가 "준비 중"이어야 한다
    expect(html.slice(soonIndex, soonIndex + 260)).toContain("준비 중");
    expect(html.slice(soonIndex, soonIndex + 260)).not.toContain("해금됨");
  });

  it("달성한 active 보상은 해금됨, 미달성은 달성 조건을 보여준다", () => {
    const html = renderToStaticMarkup(
      <LevelRewards
        rewards={rewards}
        unlocks={new Set(["a_done"])}
        currentLevel={4}
        currentStage={1}
      />,
    );
    expect(html).toContain("해금됨");
    expect(html).toContain("Lv.5 달성 시");
  });

  it("data_only 보상은 아예 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <LevelRewards
        rewards={rewards}
        unlocks={new Set()}
        currentLevel={4}
        currentStage={1}
      />,
    );
    expect(html).not.toContain("숨김 보상");
  });
});

describe("NextStagePreview", () => {
  it("다음 단계와 해금 조건·남은 XP를 보여준다", () => {
    const html = renderToStaticMarkup(
      <NextStagePreview currentStage={1} totalXp={740} />,
    );
    expect(html).toContain("눈떴개");
    expect(html).toContain("Lv.6 달성 시 해금");
    expect(html).toContain("260 XP 남음"); // 1000 - 740
  });

  it("최고 단계(7)면 렌더하지 않는다", () => {
    expect(
      renderToStaticMarkup(<NextStagePreview currentStage={7} totalXp={26000} />),
    ).toBe("");
  });
});

describe("GrowthTimeline", () => {
  it("현재 레벨을 강조하고 앞뒤 구간을 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <GrowthTimeline currentLevel={4} totalXp={740} />,
    );
    expect(html).toContain("Lv.4");
    expect(html).toContain("현재");
    expect(html).toContain("Lv.1");
    expect(html).toContain("Lv.8");
    expect(html).not.toContain("Lv.9"); // 기본은 창(window)만
  });

  it("단계가 바뀌는 레벨에 진화 배지를 붙인다", () => {
    const html = renderToStaticMarkup(
      <GrowthTimeline currentLevel={4} totalXp={740} />,
    );
    expect(html).toContain("눈떴개 진화"); // Lv.6
  });
});

describe("StageGuideSheet — '7단계 안내'가 실제로 설명한다", () => {
  it("7단계 전부를 이름·레벨구간·설명과 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <StageGuideSheet currentStage={1} totalXp={110} onClose={() => {}} />,
    );
    for (const name of [
      "개노답",
      "눈떴개",
      "일단하개",
      "물고가개",
      "미쳐보개",
      "판을짜개",
      "전설이개",
    ]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("Lv.1~5");
    expect(html).toContain("Lv.31~35");
    expect(html).toContain("생각은 많지만 아직 움직이지 않는 상태");
    expect(html).toContain("레벨 5개마다 한 단계씩 진화");
  });

  it("현재 단계는 '현재' 배지, 잠긴 단계는 남은 XP를 보여준다", () => {
    const html = renderToStaticMarkup(
      <StageGuideSheet currentStage={1} totalXp={110} onClose={() => {}} />,
    );
    expect(html).toContain("현재");
    expect(html).toContain("890 XP 남음"); // 눈떴개 1000 - 110
  });

  it("접근성: dialog 역할과 제목 연결", () => {
    const html = renderToStaticMarkup(
      <StageGuideSheet currentStage={3} totalXp={4000} onClose={() => {}} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="stage-guide-title"');
    expect(html).toContain('id="stage-guide-title"');
  });
});

describe("StageCarousel", () => {
  it("헤더 ? 버튼으로 안내를 열 수 있다", () => {
    const html = renderToStaticMarkup(
      <StageCarousel currentStage={1} onHelpClick={() => {}} />,
    );
    expect(html).toContain('aria-label="7단계 진화 안내 보기"');
  });

  it("잠긴 단계는 저채도·자물쇠, 현재 단계는 aria-current", () => {
    const html = renderToStaticMarkup(
      <StageCarousel currentStage={1} onHelpClick={() => {}} />,
    );
    expect(html).toContain("grayscale");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("· 잠김 · 안내 보기");
  });
});

describe("XpGuideSheet — 修正17 지급되는 것만 획득 가능", () => {
  const html = renderToStaticMarkup(<XpGuideSheet onClose={() => {}} />);

  it("지금 획득 가능 항목과 하루 상한 160 XP를 안내한다", () => {
    expect(html).toContain("지금 획득 가능");
    expect(html).toContain("운동 완료");
    // 명칭 통일 (2026-08-12) — 화면에서는 "타바타" 대신 "전신 인터벌"로 부른다
    expect(html).toContain("전신 인터벌 완료");
    expect(html).toContain(
      "전신 인터벌은 세트 기록 없이 완료 자체로 인정돼요.",
    );
    expect(html).not.toContain("타바타");
    expect(html).toContain("160 XP");
    expect(html).not.toContain("180 XP");
  });

  it("주간 목표·계획 완료는 준비 중으로만 안내한다", () => {
    const weekly = html.indexOf("주간 목표 달성");
    const plan = html.indexOf("계획한 운동 완료");
    expect(weekly).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(-1);
    expect(html.slice(weekly)).toContain("준비 중");
    expect(html.slice(plan)).toContain("준비 중");
    // 준비 중 항목이 "지금 획득 가능" 섹션보다 뒤에 있어야 한다
    expect(weekly).toBeGreaterThan(html.indexOf("지금 획득 가능"));
  });

  it("하루 1회 제한과 기록 반영을 함께 안내한다", () => {
    expect(html).toContain("하루 1회 제한");
    expect(html).toContain("한국시간 기준 하루 한 번");
  });
});
