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
import { XpHistory, XpHistoryList } from "@/components/profile/xp-history";
import { PointHistory, PointHistoryList } from "@/components/profile/point-history";
import { HistorySheet } from "@/components/profile/history-sheet";
import { BadgeSheet } from "@/components/profile/badge-sheet";
import { BadgeShowcase } from "@/components/profile/badge-showcase";
import { NextGoalCard } from "@/components/profile/next-goal-card";
import { PointSummary } from "@/components/profile/point-summary";
import { getBadgeCatalog, getMyBadgeMetrics, getMyBadges } from "@/lib/badges";
import {
  getMyWallet,
  getRecentPointTransactions,
  type PointTransactionRow,
} from "@/lib/points";
import {
  buildAchievements,
  selectNextGoal,
  type Achievement,
} from "@/lib/domain/achievements";
import { badgeShelf, type BadgeMetricKey, type BadgeShelfItem } from "@/lib/domain/badges";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
  pointTransactions: PointTransactionRow[];
  balance: number;
  streakDays: number;
  shelf: BadgeShelfItem[];
  achievements: Achievement[];
}

/** 내 정보 성장 허브 — 7단계·현재 단계·혜택·다음 단계·타임라인·XP 내역. */
export function GrowthHub() {
  const { userId, loading, configured } = useAuth();
  const [data, setData] = useState<HubData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stageGuideOpen, setStageGuideOpen] = useState(false);
  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);
  const [xpSheetOpen, setXpSheetOpen] = useState(false);
  const [pointSheetOpen, setPointSheetOpen] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const [summary, rewards, unlocks, transactions, wallet, pointTransactions, catalog, earned, sessions, metrics] =
          await Promise.all([
            getProgressSummary(),
            getLevelRewards(),
            getMyUnlocks(),
            getRecentXpTransactions(),
            getMyWallet(),
            getRecentPointTransactions(),
            getBadgeCatalog(),
            getMyBadges(),
            supabase
              .from("workout_sessions")
              .select("completed_at")
              .eq("status", "completed")
              .is("deleted_at", null)
              .not("completed_at", "is", null),
            getMyBadgeMetrics(),
          ]);
        if (sessions.error) throw sessions.error;
        const instants = (sessions.data ?? []).map(
          (r) => new Date(r.completed_at as string),
        );
        const streakDays = currentStreak(
          workoutDayKeys(instants, DEFAULT_TIMEZONE),
          dayKey(new Date(), DEFAULT_TIMEZONE),
        );
        if (!cancelled)
          setData({
            summary, rewards, unlocks, transactions, pointTransactions,
            balance: wallet.balance,
            streakDays,
            shelf: badgeShelf(catalog, earned),
            achievements: buildAchievements(catalog, earned, metrics as Record<BadgeMetricKey, number>),
          });
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

  const { summary, rewards, unlocks, transactions, pointTransactions, balance, streakDays, shelf, achievements } = data;

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

      <PointSummary balance={balance} streakDays={streakDays} />

      <NextGoalCard goal={selectNextGoal(achievements)} />

      <BadgeShowcase shelf={shelf} onOpenAll={() => setBadgeSheetOpen(true)} />

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

      <XpHistory rows={transactions} onOpenAll={() => setXpSheetOpen(true)} />

      <PointHistory
        rows={pointTransactions}
        onOpenAll={() => setPointSheetOpen(true)}
      />

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

      {xpSheetOpen && (
        <HistorySheet
          title="최근 XP 획득"
          count={transactions.length}
          onClose={() => setXpSheetOpen(false)}
        >
          <XpHistoryList rows={transactions} />
        </HistorySheet>
      )}

      {pointSheetOpen && (
        <HistorySheet
          title="최근 포인트 획득"
          count={pointTransactions.length}
          onClose={() => setPointSheetOpen(false)}
        >
          <PointHistoryList rows={pointTransactions} />
        </HistorySheet>
      )}

      {badgeSheetOpen && (
        <BadgeSheet achievements={achievements} onClose={() => setBadgeSheetOpen(false)} />
      )}
    </>
  );
}
