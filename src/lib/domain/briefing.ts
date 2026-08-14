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
import { dayKey, minuteOfDay } from "./time";
import {
  DEFAULT_BRIEF_MINUTE,
  estimateNotifyMinute,
  sameSlot,
} from "./notify-time";
import type { StreakStage } from "./streak";

export const DEFAULT_BRIEF_HOUR = 9;

export type BriefingUser = {
  userId: string;
  timezone: string;
  completedAts: Date[]; // 본인 완료 순간 전체
  /**
   * 본인 세션 **시작** 순간 전체 — 알림 시각 추정의 재료 (2026-08-13).
   *
   * ⚠️ `completedAts`로 대신하지 마라. 완료 시각으로 재면 "평소 운동 시간"이
   * 운동이 끝난 시각이 되어 알림이 늘 늦는다.
   */
  startedAts: Date[];
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
  /**
   * ⚠️ 옛 이름은 `hour_mismatch`였다. 2026-08-13에 판정이 **시(hour)**에서
   * **30분 슬롯**으로 바뀌면서 같이 고쳤다 — 옛 이름을 남기면 로그를 읽는 사람이
   * 아직 정시 판정인 줄 안다.
   */
  reason: "no_history" | "opted_out" | "slot_mismatch";
};

/** 브리핑용 제목 조립 — 카피 데이터는 홈 카드와 공용, 조립만 채널별 (스펙 §2) */
function briefingTitle(
  stage: StreakStage,
  streak: number,
  todayKey: string,
): string {
  if (stage === "today_done")
    return pickByDay(TODAY_DONE_MESSAGES, todayKey)(streak);
  if (stage === "expired") return pickByDay(EXPIRED_MESSAGES, todayKey);
  const variants = STAGE_MESSAGES[stage];
  if (variants) return `🔥 ${pickByDay(variants, todayKey)(streak)}`;
  return `🔥 스트릭 ${streak}일 유지 중이에요`; // 방어 — none은 호출 전 제외됨
}

/**
 * 유저별 브리핑 발송 판정 (스킵 사유 포함).
 *
 * ⚠️ **2026-08-13에 "전원 09:00"에서 "각자 평소 운동 시작 30분 전"으로 바뀌었다.**
 * 설계: `docs/superpowers/specs/2026-08-13-personalized-briefing-time-design.md`
 *
 * 발송 시각은 `estimateNotifyMinute`가 정하고, 추정이 없으면(기록 부족)
 * `DEFAULT_BRIEF_MINUTE`(09:00)로 떨어진다 — `null`은 "보내지 않음"이 아니다.
 *
 * ⚠️ **크론이 30분마다 돌아야 한다.** 하루 한 번만 돌면 그 슬롯에 걸린 사람만
 * 받는다. `vercel.json`의 주기와 `SLOT_MINUTES`는 한 벌이다.
 *
 * `invocationHourOverride`는 **수동 검증 전용**이다. 넘기면 전원을 그 시각의
 * 정각 슬롯으로 강제한다 — 프로덕션 크론은 넘기지 않는다(옛 크론이 `?hour=9`를
 * 넘겨 개인화 게이트를 스스로 껐던 것이 이번 작업의 출발점이다).
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
    // 이 사람에게 보낼 분 — 평소 시작 30분 전, 추정이 없으면 09:00.
    const notifyMinute =
      estimateNotifyMinute(u.startedAts, u.timezone, now) ??
      DEFAULT_BRIEF_MINUTE;
    // 수동 검증용 오버라이드는 그 시각의 **정각 슬롯**을 뜻한다.
    const nowMinute =
      invocationHourOverride !== undefined
        ? invocationHourOverride * 60
        : minuteOfDay(now, u.timezone);
    if (!sameSlot(nowMinute, notifyMinute)) {
      skipped.push({ userId: u.userId, reason: "slot_mismatch" });
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
