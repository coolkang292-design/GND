"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { RankingPodium } from "@/components/challenge/ranking-podium";
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
  restRanking,
  resultShareText,
  weeklyAchievement,
  type PeriodRewards,
  type PlanInput,
} from "@/lib/domain/challenge-report";
import {
  goalRate,
  rankParticipants,
  type GoalType,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";
import { MyResultReport, type MyReport } from "./result/my-result-report";
import { ResultSummary } from "./result/result-summary";
import type { StatCardData } from "./result/stat-card";

/*
  2026-10-07: 사용자 시안(「챌린지 종료!」 / 「나의 챌린지 결과」)으로 다시 그렸다.
  순위·점수 계산은 그대로다 — 순위는 `rankParticipants`(종합점수, 동점 같은 등수),
  점수는 `scoreParticipant`를 지난다(홈·탭·시상대가 같은 자로 잰다).
  옛 참가자별 상세 카드(목표별 실적·참여율)는 시안에 없어 지웠고(D2), 4위 이하는
  시상대 아래 한 줄 목록이다.
*/

const GOAL_ICON: Record<GoalType, IconName> = {
  weight_reps: "sets",
  weight_days: "dumbbell",
  cardio_distance: "shoe",
  cardio_time: "clock",
  bodyweight_reps: "sets",
  bodyweight_time: "timer",
  bodyweight_days: "body",
  cardio_days: "shoe",
  tabata_count: "interval",
  volume: "dumbbell",
  workout_days: "calendar",
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export function ResultView({
  challenge,
  participants,
  goals,
  sessionRows,
  plans,
  timeZone,
  profileOf,
  myUserId,
  onBack,
  onProfileClick,
  onCreate,
}: {
  challenge: { id: string; name: string; start_date: string; end_date: string };
  /** 목표 있는 참여자만 — `buildParticipantInput`으로 조립된 것 */
  participants: ParticipantInput[];
  goals: UserGoal[];
  /** 점수와 같은 RPC 행(`get_challenge_period_sessions`) */
  sessionRows: readonly PeriodSessionRow[];
  /** 내 계획 — 일별 활동의 회색 막대 */
  plans: readonly PlanInput[];
  timeZone: string;
  profileOf: (id: string) => ChallengeParticipantProfile | undefined;
  myUserId: string;
  onBack: () => void;
  /** ⚠️ 시트를 여기서 띄우지 않는다 — 화면에 시트가 둘이 된다 */
  onProfileClick: (p: ChallengeParticipantProfile) => void;
  onCreate: () => void;
}) {
  const [view, setView] = useState<"summary" | "report">("summary");
  const [rewards, setRewards] = useState<PeriodRewards | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  /** 4위 이하 목록 펼침 — 참가자가 수십 명일 수 있다 */
  const [restOpen, setRestOpen] = useState(false);
  const { start_date: start, end_date: end } = challenge;
  const periodDays = inclusiveDays(start, end);
  const ranked = useMemo(() => rankParticipants(participants), [participants]);
  const total = ranked.length;

  // 레벨·보상 칸 재료 — 실패해도 결과 화면은 뜬다(그 칸만 숨는다)
  useEffect(() => {
    let cancelled = false;
    getMyRewardLedgers(start)
      .then((l) => {
        if (!cancelled) {
          setRewards(periodRewards({ ...l, startDate: start, endDate: end, timeZone }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challenge.id, start, end, timeZone]);

  const mine = useMemo(() => {
    const r = ranked.find((x) => x.userId === myUserId);
    const input = participants.find((p) => p.userId === myUserId);
    if (!r || !input) return null;
    const myGoals = goals.filter((g) => g.user_id === myUserId);
    const totals = dailyTotals(
      sessionRows.filter((s) => s.userId === myUserId),
      start,
      end,
      timeZone,
    );
    const all = [...totals.values()];
    const goalResults = myGoals.map((g) => {
      const actual = input.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
      const target = Number(g.target_value);
      return {
        key: g.id,
        type: g.goal_type,
        label: goalLabel(g.goal_type, g.qualifier),
        actual,
        target,
        unit: g.unit ?? "",
        rate: goalRate(target, actual),
      };
    });
    const minutes = all.some((t) => t.minutes != null)
      ? all.reduce((s, t) => s + (t.minutes ?? 0), 0)
      : null;
    // 시안의 2×2 — 내 목표를 앞에서 4장까지, 모자라면 기간 기록(링 없음)으로 채운다
    const filler: StatCardData[] = [
      { key: "f-sessions", icon: "flame", label: "운동 횟수", value: fmt(all.reduce((s, t) => s + t.sessions, 0)), unit: "회", sub: "기간 기록", rate: null },
      { key: "f-minutes", icon: "clock", label: "운동 시간", value: minutes === null ? "-" : fmt(minutes), unit: minutes === null ? "" : "분", sub: "기간 기록", rate: null },
      { key: "f-km", icon: "shoe", label: "유산소 거리", value: fmt(all.reduce((s, t) => s + t.cardioKm, 0)), unit: "km", sub: "기간 기록", rate: null },
      { key: "f-kg", icon: "dumbbell", label: "총 볼륨", value: fmt(all.reduce((s, t) => s + t.volumeKg, 0)), unit: "kg", sub: "기간 기록", rate: null },
    ];
    const stats: StatCardData[] = [
      ...goalResults.slice(0, 4).map((g) => ({
        key: g.key,
        icon: GOAL_ICON[g.type],
        label: g.label,
        value: fmt(g.actual),
        unit: g.unit,
        sub: `목표 ${g.target.toLocaleString()}${g.unit}`,
        rate: g.rate,
      })),
      ...filler,
    ].slice(0, 4);
    const report: MyReport = {
      ranked: r,
      total,
      goals: goalResults,
      bars: dailyBars(totals, plans, start, end),
      records: bestRecords(totals),
      trend: myScoreTrend({
        rows: sessionRows,
        userId: myUserId,
        goals: myGoals,
        startDate: start,
        endDate: end,
        timeZone,
      }),
    };
    return {
      workoutDays: input.workoutDays,
      stats,
      // 주간 목표 횟수 — buildParticipantInput과 같은 기본값 5
      weeks: weeklyAchievement([...totals.keys()], start, end, myGoals[0]?.planned_days ?? 5),
      report,
    };
  }, [ranked, participants, goals, sessionRows, plans, myUserId, start, end, timeZone, total]);

  // ⚠️ navigator.share는 클릭 안에서 바로 부른다(await 뒤로 미루면 브라우저가 거절한다)
  async function handleShare() {
    if (!mine) return;
    const text = resultShareText({
      challengeName: challenge.name,
      rank: mine.report.ranked.rank,
      total,
      overall: mine.report.ranked.overall,
      workoutDays: mine.workoutDays,
      periodDays,
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

  const rest = restRanking(ranked, myUserId, restOpen);
  const workoutDaysOf = new Map(participants.map((p) => [p.userId, p.workoutDays]));
  const podium = (
    <>
      <RankingPodium
        ranked={ranked}
        profileOf={profileOf}
        myUserId={myUserId}
        onProfileClick={onProfileClick}
        metaOf={(id) => {
          const r = ranked.find((x) => x.userId === id);
          return (
            <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
              <span className="flex items-center gap-0.5">
                <Icon name="clock" size={11} />
                {workoutDaysOf.get(id) ?? 0}일
              </span>
              <span className="flex items-center gap-0.5">
                <Icon name="calendar" size={11} />
                {Math.round(r?.achievement ?? 0)}%
              </span>
            </span>
          );
        }}
      />
      {rest.rows.length > 0 && (
        <ol className="mt-2 flex flex-col">
          {rest.rows.map((r, i) => {
            const mine = r.userId === myUserId;
            return (
              <li
                key={r.userId}
                data-testid="rest-rank"
                className={`flex items-center gap-2 px-2 py-2 text-[13px] ${
                  rest.gapBeforeLast && i === rest.rows.length - 1
                    ? "mt-1 border-t border-dashed border-line-strong"
                    : "border-t border-line"
                } ${mine ? "rounded-card-sm bg-accent-weak text-accent" : ""}`}
              >
                <span className="w-9 font-mono font-extrabold text-muted">{r.rank}위</span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {mine ? "나" : (profileOf(r.userId)?.nickname ?? "?")}
                </span>
                <span className="font-mono font-extrabold">{r.overall.toFixed(1)}점</span>
              </li>
            );
          })}
        </ol>
      )}
      {(rest.hiddenCount > 0 || restOpen) && ranked.length > 10 && (
        <button
          type="button"
          onClick={() => setRestOpen((v) => !v)}
          className="mt-1 w-full py-2 text-center text-[12.5px] font-bold text-muted"
        >
          {restOpen ? "접기" : `전체 ${total}명 보기`}
        </button>
      )}
    </>
  );

  if (view === "report" && mine) {
    return (
      <MyResultReport
        me={mine.report}
        rewards={rewards}
        onBack={() => setView("summary")}
        onShare={() => void handleShare()}
        onCreate={onCreate}
      />
    );
  }
  return (
    <ResultSummary
      challengeName={challenge.name}
      periodDays={periodDays}
      podium={podium}
      mine={mine ? { stats: mine.stats, weeks: mine.weeks } : null}
      rewards={rewards}
      shareNote={shareNote}
      onBack={onBack}
      onShare={() => void handleShare()}
      onOpenReport={() => setView("report")}
    />
  );
}
