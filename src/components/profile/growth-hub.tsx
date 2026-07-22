"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CurrentStageCard } from "@/components/profile/current-stage-card";
import { GrowthTimeline } from "@/components/profile/growth-timeline";
import { LevelRewards } from "@/components/profile/level-rewards";
import { NextStagePreview } from "@/components/profile/next-stage-preview";
import { StageCarousel } from "@/components/profile/stage-carousel";
import { StageGuideSheet } from "@/components/profile/stage-guide-sheet";
import { XpGuideSheet } from "@/components/profile/xp-guide-sheet";
import { XpHistory } from "@/components/profile/xp-history";
import {
  getLevelRewards,
  getMyUnlocks,
  getProgressSummary,
  getRecentXpTransactions,
  type LevelReward,
  type ProgressSummary,
  type XpTransactionRow,
} from "@/lib/progression";

interface HubData {
  summary: ProgressSummary;
  rewards: LevelReward[];
  unlocks: Set<string>;
  transactions: XpTransactionRow[];
}

/** 내 정보 성장 허브 — 7단계·현재 단계·혜택·다음 단계·타임라인·XP 내역. */
export function GrowthHub() {
  const { userId, loading, configured } = useAuth();
  const [data, setData] = useState<HubData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stageGuideOpen, setStageGuideOpen] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [summary, rewards, unlocks, transactions] = await Promise.all([
          getProgressSummary(),
          getLevelRewards(),
          getMyUnlocks(),
          getRecentXpTransactions(),
        ]);
        if (!cancelled) setData({ summary, rewards, unlocks, transactions });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, reloadKey]);

  // 修正14: 오류를 색만으로 알리지 않고 문구 + "다시 시도" 버튼을 함께 준다.
  if (failed) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-sm font-bold">성장 정보를 불러오지 못했어요</p>
        <p className="mt-1 text-[11.5px] text-muted">
          네트워크 상태를 확인한 뒤 다시 시도해주세요. 운동 기록은 영향을 받지
          않아요.
        </p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setReloadKey((k) => k + 1);
          }}
          className="mt-3 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          다시 시도
        </button>
      </section>
    );
  }

  if (!data) {
    return (
      <section
        aria-busy="true"
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <p className="text-[12.5px] text-muted">성장 정보를 불러오는 중…</p>
      </section>
    );
  }

  const { summary, rewards, unlocks, transactions } = data;

  return (
    <>
      <StageCarousel
        currentStage={summary.currentStage}
        onHelpClick={() => setStageGuideOpen(true)}
      />

      <CurrentStageCard
        summary={summary}
        onGuideClick={() => setStageGuideOpen(true)}
      />

      <LevelRewards
        rewards={rewards}
        unlocks={unlocks}
        currentLevel={summary.currentLevel}
        currentStage={summary.currentStage}
      />

      <NextStagePreview
        currentStage={summary.currentStage}
        totalXp={summary.totalXp}
      />

      <GrowthTimeline
        currentLevel={summary.currentLevel}
        totalXp={summary.totalXp}
      />

      <XpHistory rows={transactions} />

      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="h-12 w-full rounded-card border border-line bg-surface text-sm font-extrabold text-accent shadow-card"
      >
        XP 획득 방법 보기
      </button>

      {guideOpen && <XpGuideSheet onClose={() => setGuideOpen(false)} />}

      {stageGuideOpen && (
        <StageGuideSheet
          currentStage={summary.currentStage}
          totalXp={summary.totalXp}
          onClose={() => setStageGuideOpen(false)}
        />
      )}
    </>
  );
}
