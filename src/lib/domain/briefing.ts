/**
 * 아침 브리핑 발송 판정 — 순수 함수 (스펙 §3).
 * 멱등성의 최종 보장은 DB unique(dedupe_key)가 한다. 여기서는
 * no_history/opted_out/hour_mismatch만 거른다(already_sent는 upsert 충돌로 판정).
 */
import { currentStreak, streakStage, workoutDayKeys } from "./streak";
import {
  EXPIRED_MESSAGES,
  pickByDay,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
} from "./streak-messages";
import { dayKey, hourOfDay } from "./time";
import type { StreakStage } from "./streak";

export const DEFAULT_BRIEF_HOUR = 9;

export type BriefingUser = {
  userId: string;
  timezone: string;
  completedAts: Date[]; // 본인 완료 순간 전체
  morningBrief: boolean; // notification_settings.morning_brief (행 없음 = true)
};

export type Briefing = {
  userId: string;
  title: string;
  body: string | null;
  dedupeKey: string;
};

export type BriefingSkip = {
  userId: string;
  reason: "no_history" | "opted_out" | "hour_mismatch";
};

/** 브리핑용 제목 조립 — 카피 데이터는 홈 카드와 공용, 조립만 채널별 (스펙 §2) */
function briefingTitle(
  stage: StreakStage,
  streak: number,
  todayKey: string,
): string {
  if (stage === "today_done") return pickByDay(TODAY_DONE_MESSAGES, todayKey);
  if (stage === "expired") return pickByDay(EXPIRED_MESSAGES, todayKey);
  const variants = STAGE_MESSAGES[stage];
  if (variants) return `🔥 ${pickByDay(variants, todayKey)(streak)}`;
  return `🔥 스트릭 ${streak}일 유지 중이에요`; // 방어 — none은 호출 전 제외됨
}

/**
 * 유저별 아침 브리핑 발송 판정 (스킵 사유 포함).
 * invocationHourOverride는 **전 유저의 시각 판정을 하나의 값으로 강제**한다
 * (수동 검증·향후 크론 슬롯용) — 프로덕션 다중 tz 판정은 override를 생략해야
 * 유저별 hourOfDay(now, timezone) 게이트가 동작한다.
 */
export function buildBriefings(
  users: BriefingUser[],
  // 크루 집계 문구를 없애면서 쓰지 않게 됐다(2026-07-28). 라우트가 이미 넘기고
  // 있어 시그니처는 그대로 둔다 — 지우면 호출부까지 흔들린다.
  _completedAtsByUser: Map<string, Date[]>,
  now: Date,
  invocationHourOverride?: number,
): { briefings: Briefing[]; skipped: BriefingSkip[] } {
  const briefings: Briefing[] = [];
  const skipped: BriefingSkip[] = [];

  for (const u of users) {
    if (u.completedAts.length === 0) {
      skipped.push({ userId: u.userId, reason: "no_history" });
      continue;
    }
    if (!u.morningBrief) {
      skipped.push({ userId: u.userId, reason: "opted_out" });
      continue;
    }
    const hour = invocationHourOverride ?? hourOfDay(now, u.timezone);
    if (hour !== DEFAULT_BRIEF_HOUR) {
      skipped.push({ userId: u.userId, reason: "hour_mismatch" });
      continue;
    }

    const todayKey = dayKey(now, u.timezone);
    const keys = workoutDayKeys(u.completedAts, u.timezone);
    const stage = streakStage(keys, todayKey);
    const streak = currentStreak(keys, todayKey);

    briefings.push({
      userId: u.userId,
      title: briefingTitle(stage, streak, todayKey),
      // 크루 집계 문구를 없앴다(2026-07-28). 타입은 null 허용으로 남긴다 —
      // 알림 INSERT와 푸시 페이로드가 body를 그대로 넘기고 있다.
      body: null,
      dedupeKey: `morning_briefing:${u.userId}:${todayKey}`,
    });
  }
  return { briefings, skipped };
}
