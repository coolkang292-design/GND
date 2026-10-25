import type { ChallengeActivityItem, ChallengeParticipantProfile, PeriodSessionRow } from "@/lib/challenge";
import type { CreatorParticipant } from "@/lib/domain/creator-studio";
import type { GoalType } from "@/lib/domain/goal-score";
import type { Challenge, UserGoal } from "@/lib/types";

/**
 * Creator Studio 미리보기 데이터 (2026-10-25, 개발 서버 전용).
 *
 * 운영 DB에 가짜 계정을 만들지 않고 화면 4개를 "회원이 많은 상태"로 확인하려고 만든다.
 * 진짜 화면과 **같은 계산 함수**(buildCreatorSnapshot · buildCreatorMemberDetail ·
 * buildDailyProofRates)에 이 데이터를 넣는다 — 화면용 숫자를 여기서 따로 만들지 않는다.
 *
 * ⚠️ 날짜만 오늘 기준으로 움직이고 무늬는 고정(시드 난수)이다. 같은 날 열면 같은 화면이다.
 * ⚠️ 아무 DB에도 쓰지 않는다. 운영 빌드에서는 경로가 404다(`demo/layout.tsx`).
 */
export const DEMO_CHALLENGE_ID = "demo"; // `isDemoChallenge`(creator-return.ts)와 같은 값
const HOST = "demo-host";

type Plan = {
  nickname: string;
  avatar: string;
  /** 시작일 기준 합류일(음수 = 시작 전 합류) */
  join: number;
  goals: GoalType[];
  /** d일째(0=시작일) 운동했는가 */
  did: (d: number, rnd: () => number) => boolean;
  live?: boolean;
};

const always = (p: number) => (_d: number, r: () => number) => r() < p;
const rising = (from: number, to: number) => (d: number, r: () => number) => r() < from + ((to - from) * d) / 20;
const withToday = (f: Plan["did"]) => (d: number, r: () => number) => (d === 20 ? (r(), true) : f(d, r));

// 20명 — 화면이 보여 줘야 할 상태를 일부러 하나씩 깔아 둔다.
const PLANS: Plan[] = [
  { nickname: "지은", avatar: "🏃‍♀️", join: -3, goals: ["workout_days", "cardio_time"], did: withToday(always(0.85)) },
  { nickname: "민수", avatar: "🏋️", join: -4, goals: ["workout_days", "weight_days"], did: (d, r) => d <= 16 && (d === 16 || r() < 0.65) }, // 3일째 멈춤
  { nickname: "소라", avatar: "🧘‍♀️", join: -2, goals: [], did: always(0.4) }, // 목표 미설정
  { nickname: "현우", avatar: "🚴", join: -5, goals: ["workout_days"], did: withToday((d) => [0, 2, 4].includes(d % 7)) },
  { nickname: "유진", avatar: "🌱", join: 18, goals: ["workout_days"], did: () => false }, // 이틀 전 합류
  { nickname: "태훈", avatar: "💪", join: -1, goals: ["workout_days", "weight_days"], did: (d, r) => d === 19 || (d < 19 && r() < 0.5) },
  { nickname: "하늘", avatar: "🏊", join: -6, goals: ["workout_days", "cardio_time"], did: (d, r) => d < 20 && r() < 0.6, live: true }, // 지금 운동 중
  { nickname: "서연", avatar: "🙂", join: -2, goals: ["workout_days"], did: () => false }, // 한 번도 인증 안 함
  { nickname: "도윤", avatar: "🔥", join: -7, goals: ["workout_days", "weight_days"], did: withToday(always(0.75)) },
  { nickname: "지호", avatar: "⚡", join: 5, goals: ["workout_days"], did: always(0.5) },
  { nickname: "수아", avatar: "🌸", join: -1, goals: ["workout_days", "cardio_time"], did: always(0.3) },
  { nickname: "예준", avatar: "🏀", join: -3, goals: ["workout_days"], did: withToday(always(0.7)) },
  { nickname: "하린", avatar: "🍀", join: 12, goals: ["workout_days", "cardio_time"], did: withToday(always(0.6)) },
  { nickname: "시우", avatar: "🎯", join: -2, goals: ["workout_days"], did: always(0.45) },
  { nickname: "다은", avatar: "🌙", join: -4, goals: ["workout_days"], did: rising(0.15, 0.85) },
  { nickname: "준서", avatar: "🦾", join: -3, goals: ["workout_days", "weight_days"], did: rising(0.1, 0.8) },
  { nickname: "채원", avatar: "🌊", join: -1, goals: ["workout_days"], did: always(0.55) },
  { nickname: "건우", avatar: "🐣", join: 19, goals: [], did: () => false }, // 어제 합류, 목표 전
  { nickname: "나연", avatar: "🎵", join: -5, goals: ["workout_days", "cardio_time"], did: withToday(always(0.65)) },
  { nickname: "우진", avatar: "🚀", join: -2, goals: ["workout_days"], did: withToday(rising(0.2, 0.9)) },
];

const GOAL: Partial<Record<GoalType, { target: number; unit: string; qualifier: number | null }>> = {
  workout_days: { target: 12, unit: "일", qualifier: null },
  cardio_time: { target: 180, unit: "분", qualifier: null },
  weight_days: { target: 8, unit: "일", qualifier: 1 },
};

/** mulberry32 — 회원마다 고정된 무늬 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shift(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type CreatorDemo = {
  challenge: Pick<
    Challenge,
    "id" | "name" | "status" | "start_date" | "end_date" | "invite_code" | "created_by" | "recruit_image_url" | "recruit_note"
  >;
  participants: CreatorParticipant[];
  profiles: ChallengeParticipantProfile[];
  goals: UserGoal[];
  sessions: PeriodSessionRow[];
  activity: ChallengeActivityItem[];
};

/**
 * 오늘이 3주차(시작 20일째)인 4주 챌린지와 회원 20명.
 * `nowMs`는 오늘 운동 시각에만 쓴다 — 미래 시각이면 "방금 전"으로 뭉개진다(2026-10-25 화면 확인).
 */
export function buildCreatorDemo(todayKey: string, nowMs: number = Date.now()): CreatorDemo {
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const kstMidnight = Date.UTC(ty, tm - 1, td) - 9 * 3_600_000;
  let todayOrder = 0;
  const todayAt = (hoursAgo: number) =>
    new Date(Math.max(kstMidnight + 5 * 60_000, nowMs - hoursAgo * 3_600_000)).toISOString();
  const start = shift(todayKey, -20);
  const end = shift(start, 27);
  const participants: CreatorParticipant[] = [
    { user_id: HOST, role: "host", status: "joined", joined_at: `${shift(start, -10)}T01:00:00Z` },
  ];
  const profiles: ChallengeParticipantProfile[] = [];
  const goals: UserGoal[] = [];
  const sessions: PeriodSessionRow[] = [];
  const activity: ChallengeActivityItem[] = [];

  PLANS.forEach((plan, idx) => {
    const id = `demo-${String(idx + 1).padStart(2, "0")}`;
    const rnd = seeded(idx * 7919 + 17);
    participants.push({ user_id: id, role: "member", status: "joined", joined_at: `${shift(start, plan.join)}T02:00:00Z` });
    profiles.push({ id, nickname: plan.nickname, avatar_url: plan.avatar });
    plan.goals.forEach((type, g) => {
      const spec = GOAL[type]!;
      goals.push({
        id: `${id}-goal-${g}`, user_id: id, challenge_id: DEMO_CHALLENGE_ID, group_id: "demo-group",
        goal_type: type, target_value: spec.target, unit: spec.unit, planned_days: 3, qualifier: spec.qualifier,
        created_at: `${start}T00:00:00Z`, updated_at: `${start}T00:00:00Z`,
      } as UserGoal);
    });

    const cardio = plan.goals.includes("cardio_time");
    for (let d = Math.max(0, plan.join); d <= 20; d++) {
      if (!plan.did(d, rnd)) continue;
      const day = shift(start, d);
      // 지난 날은 09:30 KST, 오늘은 지금보다 앞선 시각(자정 이후)으로 — 미래 시각을 만들지 않는다
      const completedAt = d === 20 ? todayAt(0.4 + 0.9 * todayOrder++) : `${day}T00:30:00Z`;
      sessions.push({
        userId: id,
        completedAt,
        durationMinutes: 40 + Math.round(rnd() * 30),
        exercises: [
          {
            exerciseType: "weight", exerciseName: "스쿼트", bodyPart: "하체",
            sets: [1, 2, 3].map(() => ({ weightKg: 40, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true })),
          },
          ...(cardio && d % 2 === 0
            ? [{
                exerciseType: "cardio" as const, exerciseName: "러닝", bodyPart: null,
                sets: [{ weightKg: null, reps: null, distanceMeters: 3000, durationSeconds: 1500, isCompleted: true }],
              }]
            : []),
        ],
      });
      if (d >= 13) {
        activity.push({
          session_id: `${id}-${day}`, user_id: id, nickname: plan.nickname, avatar_url: plan.avatar,
          status: "completed", title: cardio && d % 2 === 0 ? "러닝 + 하체" : "하체 웨이트",
          workout_type: null, started_at: completedAt, completed_at: completedAt,
          has_photo: rnd() < 0.6, cheer_count: Math.floor(rnd() * 4), my_cheers: 0, is_mine: false,
        });
      }
    }
    if (plan.live) {
      activity.push({
        session_id: `${id}-live`, user_id: id, nickname: plan.nickname, avatar_url: plan.avatar,
        status: "active", title: "수영", workout_type: null, started_at: todayAt(0.3), completed_at: null,
        has_photo: false, cheer_count: 1, my_cheers: 0, is_mine: false,
      });
    }
  });

  return {
    challenge: {
      id: DEMO_CHALLENGE_ID, name: "4주 같이 운동하기", status: "active", start_date: start, end_date: end,
      invite_code: null, created_by: HOST, recruit_image_url: null,
      recruit_note: "미리보기 데이터 — 실제 회원이 아니에요",
    },
    participants, profiles, goals, sessions, activity,
  };
}
