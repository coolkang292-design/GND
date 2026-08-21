/**
 * 아침 브리핑 발송 판정 — 순수 함수 (스펙 §3).
 * 멱등성의 최종 보장은 DB unique(dedupe_key)가 한다. 여기서는
 * no_history/opted_out/hour_mismatch만 거른다(already_sent는 upsert 충돌로 판정).
 */
import { currentStreak, streakStage, workoutDayKeys } from "./streak";
import {
  dailyMessage,
  EXPIRED_MESSAGES,
  pickByDay,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
} from "./streak-messages";
import { dayKey, minuteOfDay } from "./time";
import {
  DEFAULT_BRIEF_MINUTE,
  estimateNotifyMinute,
  isDue,
} from "./notify-time";
import { pickSuggestionKind, suggestionCopy } from "./workout-suggestion";
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
  // ── 계획 없는 날 제안 (2026-08-16) ──
  /** 가입 시각 — 신규 걷기 창(`NEW_USER_GRACE_DAYS`) 판정 */
  signedUpAt: Date;
  /** 오늘(이 사람 타임존 기준) `workout_plans`에 행이 있나 */
  hasPlanToday: boolean;
  /** active 챌린지에 joined로 들어가 있나 */
  isInActiveChallenge: boolean;
  /** 가장 최근 완료 세션이 인터벌이었나 */
  lastSessionWasInterval: boolean;
};

export type Briefing = {
  userId: string;
  title: string;
  body: string | null;
  dedupeKey: string;
  /**
   * 알림 유형 (2026-08-16). 제안이 있는 날은 `workout_suggestion`이 되고,
   * 푸시 목적지가 `/record?suggest=1`로 바뀐다(`push.ts`).
   *
   * ⚠️ `dedupe_key`는 유형과 **무관하게** 그대로다 — 유니크 인덱스가 키 하나에만
   *    걸려 있어서, 키를 바꾸면 전환일에 두 통째가 뚫린다.
   */
  type: "morning_briefing" | "workout_suggestion";
};

export type BriefingSkip = {
  userId: string;
  /**
   * ⚠️ 이름이 두 번 바뀌었다. `hour_mismatch`(정시 판정) → `slot_mismatch`(30분 슬롯
   * 정확 일치) → **`not_due`**(예정 시각이 지났고 따라잡기 창 안인가, 2026-08-16).
   * 옛 이름을 남기면 로그를 읽는 사람이 판정 방식을 오해한다.
   */
  reason: "no_history" | "opted_out" | "not_due";
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
    // ⚠️ opt-out이 **가장 앞**이다. 제안도 같은 채널이므로 똑같이 존중한다 —
    //    순서를 뒤집으면 "알림 껐는데 오네"가 된다.
    if (!u.morningBrief) {
      skipped.push({ userId: u.userId, reason: "opted_out" });
      continue;
    }

    const todayKey = dayKey(now, u.timezone);
    const keys = workoutDayKeys(u.completedAts, u.timezone);
    const hasHistory = u.completedAts.length > 0;
    const kind = pickSuggestionKind({
      hasPlanToday: u.hasPlanToday,
      didWorkoutToday: keys.includes(todayKey),
      hasHistory,
      lastSessionWasInterval: u.lastSessionWasInterval,
      isInActiveChallenge: u.isInActiveChallenge,
      signedUpDayKey: dayKey(u.signedUpAt, u.timezone),
      todayKey,
    });

    /*
      ⚠️⚠️ **옛 코드는 여기서 무조건 스킵했다** — `completedAts.length === 0`이면
      `no_history`. 그래서 신규 유저는 알림을 **한 통도** 못 받았다(2026-08-16 실측).

      ⚠️ 스킵 **사유를 늘리지 마라.** `briefing.test.ts`가 `skipped`를 통째로
         비교한다. `no_history`의 뜻을 "기록 0건이고 제안도 없음"으로 넓힌다.
    */
    if (!hasHistory && kind === null) {
      skipped.push({ userId: u.userId, reason: "no_history" });
      continue;
    }

    // 이 사람에게 보낼 분 — 평소 시작 30분 전, 추정이 없으면 09:00.
    const notifyMinute =
      estimateNotifyMinute(u.startedAts, u.timezone, now) ??
      DEFAULT_BRIEF_MINUTE;
    // 수동 검증용 오버라이드는 그 시각의 **정각**을 뜻한다.
    const nowMinute =
      invocationHourOverride !== undefined
        ? invocationHourOverride * 60
        : minuteOfDay(now, u.timezone);
    // ⚠️ **"정확히 그 슬롯인가"로 판정하지 마라** (2026-08-16에 고쳤다). 발사가
    //    한 번만 실패해도 그날 알림이 통째로 사라진다 — `isDue` 주석의 실측 참조.
    //    하루 한 번은 DB의 `unique(dedupe_key)`가 보장하므로 다시 시도해도 안전하다.
    if (!isDue(nowMinute, notifyMinute)) {
      skipped.push({ userId: u.userId, reason: "not_due" });
      continue;
    }

    const stage = streakStage(keys, todayKey);
    const streak = currentStreak(keys, todayKey);
    const copy = kind ? suggestionCopy(kind, todayKey, streak) : null;

    briefings.push({
      userId: u.userId,
      type: copy ? "workout_suggestion" : "morning_briefing",
      // 제안이 있으면 제안이 제목을 가져간다. 없으면 지금 그대로 스트릭 문구.
      title: copy ? copy.title : briefingTitle(stage, streak, todayKey),
      /*
        본문 — 제안이 있으면 제안이 채우고, 없으면 **홈 `나의 오늘` 카드와 같은
        한 줄**이 들어간다 (2026-08-21 사용자 지시: *"해당 메시지는 각 크루에게
        하루 한 번 배포되는 메시지와 동일하게 align"*).

        ⚠️ 제목(`briefingTitle`)과 **다른 갈래여야 한다.** 제목은 스트릭 상태와
        재촉을 말하고(`STAGE_MESSAGES`), 본문은 "성공은 반복에서 온다 / 쉬었어도
        돌아오면 된다"를 말한다. 둘을 같은 갈래로 채우면 알림 하나가 같은 말을
        두 번 한다(2026-07-23에 홈 카드에서 실제로 그랬다).

        ⚠️ 홈과 **같은 `todayKey`**를 넘기므로 두 화면의 문장이 저절로 맞는다.
        한쪽만 다른 날짜·다른 함수를 쓰면 "오늘의 말"이 둘로 갈린다.

        ⚠️ 옛 코드는 여기가 **항상 null**이었다(크루 집계 문구를 없앤 2026-07-28 이후).
      */
      body: copy ? copy.body : dailyMessage({ stage, streak, todayKey }),
      // ⚠️ 유형이 달라져도 키는 그대로다 — 위 `Briefing.type` 주석 참조.
      dedupeKey: `morning_briefing:${u.userId}:${todayKey}`,
    });
  }
  return { briefings, skipped };
}
