import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { XpResultModal } from "./xp-result-modal";
import { buildXpEvents } from "@/lib/domain/xp-events";
import type { WorkoutXpResult } from "@/lib/workout";

const base: WorkoutXpResult = {
  idempotentReplay: false,
  awarded: true,
  xpAwarded: 160,
  breakdown: { baseXp: 100, durationXp: 40, planXp: 0, recordXp: 10, photoXp: 10 },
  newTotalXp: 960,
  previousLevel: 5,
  newLevel: 6,
  previousStage: 1,
  newStage: 2,
  levelUp: false,
  stageUp: false,
  unlockedRewards: [],
};

function render(result: WorkoutXpResult) {
  return renderToStaticMarkup(
    <XpResultModal events={buildXpEvents(result)} onClose={() => {}} />,
  );
}

describe("XpResultModal", () => {
  it("XP만 받으면 한 단계·'확인'으로 끝나고 건너뛰기를 안 보여준다", () => {
    const html = render(base);
    expect(html).toContain("+160 XP");
    expect(html).toContain("1 / 1");
    expect(html).toContain(">확인<");
    expect(html).not.toContain("다음");
    expect(html).not.toContain("모두 확인");
  });

  it("XP 항목별 내역을 보여준다 (0인 계획 XP는 뺀다)", () => {
    const html = render(base);
    expect(html).toContain("운동 완료");
    expect(html).toContain("시간 보너스");
    expect(html).toContain("기록 완성");
    expect(html).toContain("인증 사진");
    expect(html).not.toContain("계획 완료");
  });

  it("레벨업·진화·보상이 있으면 4단계 큐가 되고 첫 화면은 XP", () => {
    const html = render({
      ...base,
      levelUp: true,
      stageUp: true,
      unlockedRewards: [{ key: "stage_evolve_2", label: "눈떴개 캐릭터 진화" }],
    });
    expect(html).toContain("1 / 4");
    expect(html).toContain("+160 XP");
    expect(html).toContain("모두 확인"); // 건너뛰기 제공
    expect(html).toContain(">다음<");
    // 뒤 단계 내용은 아직 나오지 않는다 (한 번에 쏟지 않음 — 修正16)
    expect(html).not.toContain("레벨 업!");
    expect(html).not.toContain("단계 진화!");
  });

  it("멱등 재생이면 아무것도 렌더하지 않는다", () => {
    const html = render({
      idempotentReplay: true,
      awarded: false,
      originalXpAwarded: 160,
      currentTotalXp: 160,
      currentLevel: 1,
      currentStage: 1,
      rejectionReason: "XP_ALREADY_AWARDED",
    });
    expect(html).toBe("");
  });

  it("당일 2번째 운동(XP 0)이면 모달을 띄우지 않는다", () => {
    const html = render({
      ...base,
      awarded: false,
      xpAwarded: 0,
      breakdown: { baseXp: 0, durationXp: 0, planXp: 0, recordXp: 0, photoXp: 0 },
    });
    expect(html).toBe("");
  });

  it("접근성: dialog 역할과 제목 연결", () => {
    const html = render(base);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="xp-result-title"');
    expect(html).toContain('id="xp-result-title"');
  });
});
