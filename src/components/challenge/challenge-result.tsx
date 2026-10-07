"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RankingPodium } from "@/components/challenge/ranking-podium";
import { ChallengeHero } from "@/components/challenge/detail/challenge-hero";
import { DetailTabs } from "@/components/challenge/detail/detail-tabs";
import {
  goalLabel,
  myScoreTrend,
  type ChallengeParticipantProfile,
  type PeriodSessionRow,
} from "@/lib/challenge";
import { getMyRewardLedgers } from "@/lib/challenge-rewards";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import {
  bestRecords,
  dailyBars,
  dailyTotals,
  periodRewards,
  resultShareText,
  weeklyAchievement,
  type PeriodRewards,
  type PlanInput,
} from "@/lib/domain/challenge-report";
import {
  METRICS,
  formatMetric,
  metricTotalsByUser,
  minutesKnown,
  rankMetric,
} from "@/lib/domain/challenge-metrics";
import { goalRate, rankParticipants, type ParticipantInput } from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";
import { FinalRanking } from "./result/final-ranking";
import { RecordAnalysis, type MyReport } from "./result/record-analysis";
import { ResultHeader } from "./result/result-header";
import { ResultOverview, type MetricCell } from "./result/result-overview";

/*
  2026-10-07 최종 시안: 종료 상세 = 히어로 + `결과 요약 · 최종 랭킹 · 기록 분석 · 피드` 4탭.
  종합 점수·순위 계산은 그대로다 — `rankParticipants`(종합점수, 동점 같은 등수)만 쓴다.
  종목 4종 순위는 `challenge-metrics.ts`(진행 중 랭킹과 같은 함수, 종료일까지).
*/

type Tab = "summary" | "final" | "analysis" | "feed";

export function ResultView({
  challenge,
  members,
  participants,
  goals,
  sessionRows,
  plans,
  timeZone,
  profileOf,
  myUserId,
  onBack,
  onProfileClick,
  onDiscover,
}: {
  challenge: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    recruit_image_url: string | null;
  };
  /** 참가자 명단 전원(목표 없는 사람 포함) — 히어로·종목 랭킹 */
  members: readonly ChallengeParticipantProfile[];
  /** 목표 있는 참여자만 — `buildParticipantInput`으로 조립된 것(종합 점수) */
  participants: ParticipantInput[];
  goals: UserGoal[];
  /** 점수와 같은 RPC 행(`get_challenge_period_sessions`) */
  sessionRows: readonly PeriodSessionRow[];
  /** 내 계획 — 기록 분석 일별 활동의 회색 막대 */
  plans: readonly PlanInput[];
  timeZone: string;
  profileOf: (id: string) => ChallengeParticipantProfile | undefined;
  myUserId: string;
  onBack: () => void;
  /** ⚠️ 시트를 여기서 띄우지 않는다 — 화면에 시트가 둘이 된다 */
  onProfileClick: (p: ChallengeParticipantProfile) => void;
  /** `다음 챌린지 참여하기` → 둘러보기 (사용자 결정 2026-10-07) */
  onDiscover: () => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [rewards, setRewards] = useState<PeriodRewards | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const { start_date: start, end_date: end } = challenge;
  const periodDays = inclusiveDays(start, end);
  const ranked = useMemo(() => rankParticipants(participants), [participants]);
  const total = ranked.length;
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const minutesOk = minutesKnown(sessionRows);
  const totals = useMemo(
    () => metricTotalsByUser(sessionRows, memberIds, start, end, timeZone),
    [sessionRows, memberIds, start, end, timeZone],
  );

  // 레벨·보상 칸 재료 — 실패해도 결과 화면은 뜬다(그 칸만 숨는다)
  useEffect(() => {
    let cancelled = false;
    getMyRewardLedgers(start)
      .then((l) => {
        if (!cancelled) setRewards(periodRewards({ ...l, startDate: start, endDate: end, timeZone }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challenge.id, start, end, timeZone]);

  const myRanked = ranked.find((r) => r.userId === myUserId) ?? null;

  const report = useMemo<MyReport | null>(() => {
    const input = participants.find((p) => p.userId === myUserId);
    if (!myRanked || !input) return null;
    const myGoals = goals.filter((g) => g.user_id === myUserId);
    const days = dailyTotals(sessionRows.filter((s) => s.userId === myUserId), start, end, timeZone);
    return {
      ranked: myRanked,
      total,
      goals: myGoals.map((g) => {
        const actual = input.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
        const target = Number(g.target_value);
        return {
          key: g.id,
          label: goalLabel(g.goal_type, g.qualifier),
          actual,
          target,
          unit: g.unit ?? "",
          rate: goalRate(target, actual),
        };
      }),
      bars: dailyBars(days, plans, start, end),
      records: bestRecords(days),
      trend: myScoreTrend({ rows: sessionRows, userId: myUserId, goals: myGoals, startDate: start, endDate: end, timeZone }),
      // 주간 목표 횟수 — buildParticipantInput과 같은 기본값 5
      weeks: weeklyAchievement([...days.keys()], start, end, myGoals[0]?.planned_days ?? 5),
    };
  }, [myRanked, participants, goals, sessionRows, plans, myUserId, start, end, timeZone, total]);

  // 결과 요약의 종목 4칸 — 값 + 내 순위
  const cells: MetricCell[] = METRICS.map((m) => {
    const mine = rankMetric(totals, m.key).find((r) => r.userId === myUserId);
    const unknown = m.key === "minutes" && !minutesOk;
    return {
      key: m.key,
      label: m.label,
      // 기록 없음(순위 없음)은 `0kg`이 아니라 `-` — 순위 칸과 같은 말을 한다
      value: unknown || !mine || mine.rank === null ? "-" : formatMetric(m.key, mine.value),
      rank: unknown ? null : (mine?.rank ?? null),
    };
  });

  // ⚠️ navigator.share는 클릭 안에서 바로 부른다(await 뒤로 미루면 브라우저가 거절한다)
  async function handleShare() {
    if (!myRanked) return;
    const t = totals.get(myUserId);
    const text = resultShareText({
      challengeName: challenge.name,
      rank: myRanked.rank,
      total,
      overall: myRanked.overall,
      workoutDays: participants.find((p) => p.userId === myUserId)?.workoutDays ?? 0,
      periodDays,
      records: t
        ? METRICS.filter((m) => m.key !== "minutes" || minutesOk)
            .map((m) => formatMetric(m.key, t[m.key]))
            .join(" · ")
        : undefined,
    });
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareNote("결과를 복사했어요 — 붙여 넣어 공유하세요");
    } catch {
      setShareNote("공유하지 못했어요 — 화면을 캡처해 공유해 주세요");
    }
  }

  const podium = (
    <RankingPodium
      ranked={ranked}
      profileOf={profileOf}
      myUserId={myUserId}
      onProfileClick={onProfileClick}
      metaOf={(id) => {
        const t = totals.get(id);
        if (!t) return null;
        return (
          <span className="mt-0.5 text-[10.5px] text-muted">
            {formatMetric("sessions", t.sessions)}
            {minutesOk && ` | ${formatMetric("minutes", t.minutes)}`}
          </span>
        );
      }}
    />
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "결과 요약" },
    { key: "final", label: "최종 랭킹" },
    ...(report ? [{ key: "analysis" as const, label: "기록 분석" }] : []),
    { key: "feed", label: "피드" },
  ];

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader title="챌린지 결과" onBack={onBack} onShare={myRanked ? () => void handleShare() : undefined} />
      <ChallengeHero
        name={challenge.name}
        startDate={start}
        endDate={end}
        recruitImageUrl={challenge.recruit_image_url}
        status="ended"
        members={members}
      />
      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "summary" && (
        <ResultOverview
          mine={
            myRanked
              ? { rank: myRanked.rank, overall: myRanked.overall, avatarUrl: profileOf(myUserId)?.avatar_url ?? null }
              : null
          }
          cells={cells}
          podium={podium}
          onOpenFinal={() => setTab("final")}
        />
      )}

      {tab === "final" && (
        <FinalRanking
          overall={ranked}
          totals={totals}
          minutesAvailable={minutesOk}
          myUserId={myUserId}
          profileOf={profileOf}
          onCertify={myRanked ? () => void handleShare() : undefined}
          certifyNote={shareNote}
          onDiscover={onDiscover}
        />
      )}

      {tab === "analysis" && report && <RecordAnalysis me={report} rewards={rewards} />}

      {tab === "feed" && (
        <section className="flex flex-col items-center gap-1.5 rounded-card border border-line bg-surface px-4 py-6 text-center shadow-card">
          <Icon name="feed" size={22} className="text-muted" />
          <p className="text-[14px] font-extrabold">챌린지가 끝나 활동 피드가 닫혔어요</p>
          <p className="text-[12px] text-muted">기간 중 기록은 최종 랭킹과 기록 분석에 남아 있어요.</p>
        </section>
      )}

      {shareNote && tab !== "final" && (
        <p role="status" className="text-center text-[12px] font-bold text-accent">
          {shareNote}
        </p>
      )}
    </div>
  );
}
