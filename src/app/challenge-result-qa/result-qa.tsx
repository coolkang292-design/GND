"use client";

import { useState } from "react";
import { ResultView } from "@/components/challenge/challenge-result";
import { CompetitionTab } from "@/components/challenge/competition/competition-tab";
import { RankingScreen } from "@/components/challenge/competition/ranking-screen";
import type { RankingKey } from "@/components/challenge/competition/metric-selector";
import { ChallengeHero } from "@/components/challenge/detail/challenge-hero";
import { DetailTabs } from "@/components/challenge/detail/detail-tabs";
import type { ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

const NAMES = ["나", "스칼레또", "낭만송곳니", "아라짱", "운동하는김씨", "지훈이", "헬린이123", "민수"];

/**
 * 예시 데이터 — 사람마다 운동 빈도가 다르게. **실제 사용자 데이터가 아니다.**
 * state=active: 진행 중 상세(히어로·탭·랭킹 탭·랭킹 화면) / state=ended: 종료 결과 화면.
 * min=0: 0117 적용 전 응답(운동 시간 키 없음)을 흉내 낸다.
 */
export function ResultQA({ count, state, withMinutes }: { count: number; state: "active" | "ended"; withMinutes: boolean }) {
  const [activeTab, setActiveTab] = useState<"overview" | "ranking" | "feed" | "mission">("ranking");
  const [rankingView, setRankingView] = useState<RankingKey | null>(null);
  const users = Array.from({ length: count }, (_, i) => (i === 0 ? "me" : `p${i}`));
  const lastDay = state === "ended" ? 28 : 20;
  const rows: PeriodSessionRow[] = [];
  users.forEach((u, ui) => {
    for (let d = 1; d <= lastDay; d++) {
      if ((d + ui) % ((ui % 5) + 2) === 0) continue;
      rows.push({
        userId: u,
        completedAt: `2026-09-${String(d).padStart(2, "0")}T01:00:00Z`,
        ...(withMinutes ? { durationMinutes: 20 + ((d * 7 + ui * 3) % 70) } : {}),
        exercises: [
          {
            exerciseType: "weight",
            exerciseName: "스쿼트",
            bodyPart: "하체",
            sets: Array.from({ length: 2 + ((d + ui) % 4) }, () => ({
              weightKg: 60 - ui,
              reps: 10,
              distanceMeters: null,
              durationSeconds: null,
              isCompleted: true,
            })),
          },
          {
            exerciseType: "cardio",
            exerciseName: "러닝",
            bodyPart: null,
            sets: [{ weightKg: null, reps: null, distanceMeters: 1000 + d * 100 + ui * 37, durationSeconds: 900, isCompleted: true }],
          },
        ],
      });
    }
  });
  const goal = (user_id: string, goal_type: string, target_value: number, unit: string): UserGoal =>
    ({ id: `${user_id}-${goal_type}`, user_id, goal_type, target_value, qualifier: null, planned_days: 4, unit }) as unknown as UserGoal;
  const goals = users.flatMap((u) => [goal(u, "workout_days", 20, "일"), goal(u, "cardio_distance", 30, "km"), goal(u, "weight_days", 18, "일")]);
  const mine = (u: string) => rows.filter((r) => r.userId === u);
  const km = (u: string) => mine(u).reduce((s, r) => s + (r.exercises[1].sets[0].distanceMeters ?? 0) / 1000, 0);
  const participants = users.map((u) => ({
    userId: u,
    goals: [
      { type: "workout_days" as const, target: 20, actual: mine(u).length },
      { type: "cardio_distance" as const, target: 30, actual: km(u) },
      { type: "weight_days" as const, target: 18, actual: Math.round(mine(u).length * 0.7) },
    ],
    workoutDays: mine(u).length,
    plannedDays: 16,
  }));
  const members = users.map(
    (id, i) => ({ id, nickname: NAMES[i] ?? `참가자${i + 1}`, avatar_url: null }) as unknown as ChallengeParticipantProfile,
  );
  const profileOf = (id: string) => members.find((m) => m.id === id);
  const plans = [2, 5, 8, 9, 12, 15, 16, 19, 22, 23, 26].map((d) => ({
    planDate: `2026-09-${String(d).padStart(2, "0")}`,
    setCount: 6 + (d % 5),
  }));
  const challenge = { id: `qa-${count}`, name: "9월 개노답 탈출 챌린지", start_date: "2026-09-01", end_date: "2026-09-30", recruit_image_url: null };

  if (state === "ended") {
    return (
      <main className="mx-auto max-w-[430px] px-4 pt-3">
        <ResultView
          challenge={{ ...challenge, end_date: "2026-09-28" }}
          members={members}
          participants={participants}
          goals={goals}
          sessionRows={rows}
          plans={plans}
          timeZone="Asia/Seoul"
          profileOf={profileOf}
          myUserId="me"
          onBack={() => history.back()}
          onProfileClick={() => {}}
          onDiscover={() => window.alert("둘러보기 탭이 열립니다")}
        />
      </main>
    );
  }

  const today = "2026-09-20";
  return (
    <main className="mx-auto flex max-w-[430px] flex-col gap-3 px-4 pt-3 pb-10">
      {rankingView ? (
        <RankingScreen
          rows={rows}
          members={members}
          myUserId="me"
          startDate={challenge.start_date}
          endDate={challenge.end_date}
          endKey={today}
          todayKey={today}
          timeZone="Asia/Seoul"
          myGoals={goals.filter((g) => g.user_id === "me")}
          initial={rankingView}
          overallRanked={null}
          onBack={() => setRankingView(null)}
        />
      ) : (
        <>
          <p className="text-center text-[15px] font-extrabold">챌린지 상세</p>
          <ChallengeHero
            name={challenge.name}
            startDate={challenge.start_date}
            endDate={challenge.end_date}
            recruitImageUrl={null}
            status="active"
            dday={10}
            members={members}
          />
          <DetailTabs
            tabs={[
              { key: "overview", label: "개요" },
              { key: "ranking", label: "랭킹" },
              { key: "feed", label: "피드" },
              { key: "mission", label: "미션" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
          {activeTab === "ranking" && (
            <CompetitionTab
              rows={rows}
              members={members}
              myUserId="me"
              startDate={challenge.start_date}
              endKey={today}
              todayKey={today}
              timeZone="Asia/Seoul"
              todayDone
              streak={3}
              liveRanking={false}
              onOpenRanking={setRankingView}
            />
          )}
          {activeTab !== "ranking" && <p className="py-10 text-center text-[12px] text-muted">(QA: 이 탭은 실제 상세에서 확인)</p>}
        </>
      )}
    </main>
  );
}
