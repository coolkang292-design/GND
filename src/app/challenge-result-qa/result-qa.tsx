"use client";

import { ResultView } from "@/components/challenge/challenge-result";
import type { ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

const NAMES = ["나", "스칼레또", "낭만송곳니", "새벽러너", "철봉왕", "하체요정", "주말전사", "런데이"];

/** 예시 데이터 — 사람마다 운동 빈도가 다르게. 실제 사용자 데이터가 아니다 */
export function ResultQA({ count }: { count: number }) {
  const users = Array.from({ length: count }, (_, i) => (i === 0 ? "me" : `p${i}`));
  const rows: PeriodSessionRow[] = [];
  users.forEach((u, ui) => {
    for (let d = 1; d <= 28; d++) {
      if ((d + ui) % ((ui % 5) + 2) === 0) continue;
      rows.push({
        userId: u,
        completedAt: `2026-09-${String(d).padStart(2, "0")}T01:00:00Z`,
        durationMinutes: 20 + ((d * 7 + ui * 3) % 70),
        exercises: [
          {
            exerciseType: "weight",
            exerciseName: "스쿼트",
            bodyPart: "하체",
            sets: Array.from({ length: 2 + (d % 4) }, () => ({
              weightKg: 60,
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
            sets: [
              { weightKg: null, reps: null, distanceMeters: 1000 + d * 100, durationSeconds: 900, isCompleted: true },
            ],
          },
        ],
      });
    }
  });
  const goal = (user_id: string, goal_type: string, target_value: number, unit: string): UserGoal =>
    ({ id: `${user_id}-${goal_type}`, user_id, goal_type, target_value, qualifier: null, planned_days: 4, unit }) as unknown as UserGoal;
  const goals = users.flatMap((u) => [
    goal(u, "workout_days", 20, "일"),
    goal(u, "cardio_distance", 30, "km"),
    goal(u, "weight_days", 18, "일"),
  ]);
  const mine = (u: string) => rows.filter((r) => r.userId === u);
  const km = (u: string) =>
    mine(u).reduce((s, r) => s + (r.exercises[1].sets[0].distanceMeters ?? 0) / 1000, 0);
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
  const profileOf = (id: string) => {
    const i = users.indexOf(id);
    return {
      id,
      nickname: NAMES[i] ?? `참가자${i + 1}`,
      avatar_url: null,
    } as unknown as ChallengeParticipantProfile;
  };
  const plans = [2, 5, 8, 9, 12, 15, 16, 19, 22, 23, 26].map((d) => ({
    planDate: `2026-09-${String(d).padStart(2, "0")}`,
    setCount: 6 + (d % 5),
  }));

  return (
    <main className="mx-auto max-w-[430px] px-4 pt-3">
      <ResultView
        challenge={{ id: `qa-${count}`, name: "GND 9월 챌린지", start_date: "2026-09-01", end_date: "2026-09-28" }}
        participants={participants}
        goals={goals}
        sessionRows={rows}
        plans={plans}
        timeZone="Asia/Seoul"
        profileOf={profileOf}
        myUserId="me"
        onBack={() => history.back()}
        onProfileClick={() => {}}
        onCreate={() => window.alert("새 챌린지 만들기 흐름이 열립니다")}
      />
    </main>
  );
}
