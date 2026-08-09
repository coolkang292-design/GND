/**
 * 홈 친구 목록 도메인 순수 함수 (2026-08-07).
 *
 * 설계: `docs/superpowers/specs/2026-08-07-home-friend-board-and-challenge-consolidation-design.md`
 *
 * 이 모듈은 I/O를 하지 않는다. 조회는 `lib/friends.ts`가 하고, 여기서는
 * **무엇을 어떤 순서로 보여줄지**만 정한다.
 *
 * ⚠️ 순위·등수를 계산하지 않는다 (사용자 확정 2026-08-07). 성과순 정렬은
 *    등수를 안 적어도 자리 자체가 등수라 같은 것이다 — 정렬 기준은
 *    "누구를 지금 콕 찌를 수 있나"다. 자세한 이유는 설계 §6.2.
 */

import { getLevelProgress } from "./progression";
import { currentStreak, workoutDayKeys } from "./streak";
import { dayKey, weekRange } from "./time";

/** 접었을 때 보이는 친구 수. '전체 보기'가 이 수를 넘을 때만 뜬다. */
export const FRIEND_PREVIEW_COUNT = 3;

/**
 * 세션 질의 행 상한.
 *
 * ⚠️ 누적 집계라 자를 수 없는데도 상한을 **명시**하는 이유는, 상한을 안 적으면
 * 서버 기본값에 걸려 **오류 없이 숫자만 조용히 틀리기** 때문이다. 상한에 닿으면
 * `truncated`로 알려 화면이 그 사실을 말할 수 있게 한다.
 * 2026-08-07 운영 실측 완료 세션 총계는 79건이다(설계 §8.4).
 */
export const FRIEND_SESSION_ROW_LIMIT = 2000;

/** 조회를 정규화한 순수 표현 — DB 컬럼명이 여기까지 오지 않는다 */
export type FriendSessionRow = {
  userId: string;
  completedAt: string; // ISO
  durationMinutes: number | null;
};

/**
 * 친구 상태 3단계.
 *
 * ⚠️ `active`가 빠지면 화면이 자기모순이 된다 — 홈 위쪽 진행 중 카드가
 * "15분째 운동 중"을 띄우는 동안 목록이 같은 사람을 "운동 전 + 콕"으로 그린다.
 */
export type FriendStatus = "done" | "active" | "idle";

export type FriendActivity = {
  workoutCount: number;
  totalMinutes: number;
  streak: number;
  weekDays: number;
  workedOutToday: boolean;
  lastWorkoutAt: Date | null;
};

export const EMPTY_ACTIVITY: FriendActivity = {
  workoutCount: 0,
  totalMinutes: 0,
  streak: 0,
  weekDays: 0,
  workedOutToday: false,
  lastWorkoutAt: null,
};

export type FriendRow = FriendActivity & {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  totalXp: number;
  /** 현재 레벨의 캐릭터 이미지 — 성장 카드·프로필 시트와 같은 원천(2026-08-07 사용자 요청) */
  characterPath: string;
  stageName: string;
  /** null = 아직 안 왔거나 조회 실패. **0개와 구별한다** — 화면은 "—"로 그린다. */
  badgeCount: number | null;
  /**
   * 행에 그릴 배지 키 (최대 `FRIEND_BADGE_PREVIEW`개).
   *
   * ⚠️ **최신순이 아니라 등급순이다** (2026-08-09 사용자 지시 "배지 퀄리티 좋은거
   * 먼저"). 희귀도 → 티어 → 최신 — `compareBadgeShowcase`가 정한다.
   *
   * 이미지 경로는 `/badges/<key>.png`다. **카탈로그에 있는 키만** 담긴다 —
   * 없는 키가 섞이면 화면에 깨진 이미지가 뜬다.
   */
  badgeKeys: string[];
  status: FriendStatus;
  /**
   * 이 행이 **나**인가 (2026-08-07 사용자 지시).
   *
   * 화면은 이 값으로 **콕 버튼을 뺀다** — 자기 자신은 찌를 수 없다. 서버
   * `poke_user`도 같은 이유로 막지만, 누를 수 없는 버튼을 그려 놓고 에러 토스트로
   * 알리는 것은 화면이 거짓말을 하는 것이다.
   */
  isMe: boolean;
};

/** 행에 그릴 배지 썸네일 수. 나머지는 "+N"으로 접는다. */
export const FRIEND_BADGE_PREVIEW = 3;

/** 세션 행 → 사람별 활동. 기록이 없는 사람은 맵에 없다(호출부가 EMPTY로 채운다). */
export function foldFriendSessions(
  rows: FriendSessionRow[],
  now: Date,
  timeZone: string,
): Map<string, FriendActivity> {
  const byUser = new Map<string, { instants: Date[]; minutes: number }>();
  for (const row of rows) {
    const acc = byUser.get(row.userId) ?? { instants: [], minutes: 0 };
    acc.instants.push(new Date(row.completedAt));
    // duration_minutes는 null일 수 있다(집계 전 세션). 0으로 접는다.
    acc.minutes += row.durationMinutes ?? 0;
    byUser.set(row.userId, acc);
  }

  const todayKey = dayKey(now, timeZone);
  const { start, end } = weekRange(now, timeZone);
  const result = new Map<string, FriendActivity>();

  for (const [userId, acc] of byUser) {
    const keys = workoutDayKeys(acc.instants, timeZone);
    const weekKeys = new Set(
      acc.instants
        .filter((d) => d >= start && d < end)
        .map((d) => dayKey(d, timeZone)),
    );
    const last = acc.instants.reduce<Date | null>(
      (latest, d) => (latest === null || d > latest ? d : latest),
      null,
    );
    result.set(userId, {
      workoutCount: acc.instants.length,
      totalMinutes: acc.minutes,
      streak: currentStreak(keys, todayKey),
      weekDays: weekKeys.size,
      workedOutToday: keys.includes(todayKey),
      lastWorkoutAt: last,
    });
  }
  return result;
}

export type FriendCrewInput = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  totalXp: number;
};

/**
 * 배지 조회 결과. `total`은 종류 수, `showcaseKeys`는 썸네일로 그릴 몇 개.
 *
 * ⚠️ 옛 이름은 `recentKeys`(최신순)였다. 2026-08-09에 **등급순**으로 바뀌면서
 * 이름도 같이 바꿨다 — `recentKeys`인 채로 두면 다음 사람이 최신순이라 믿는다.
 * 순서는 `compareBadgeShowcase`(희귀도 → 티어 → 최신)가 정한다.
 */
export type FriendBadges = { total: number; showcaseKeys: string[] };

/**
 * 친구 행 조립 + 정렬.
 *
 * ⚠️ 레벨은 `total_xp`로 다시 계산한다. `user_progress.current_level` 캐시값을
 * 쓰면 같은 사람이 홈에선 Lv.7, 프로필 시트에선 Lv.8로 보일 수 있다
 * (`lib/progression.ts:157`이 같은 이유로 재계산한다).
 */
export function buildFriendRows(input: {
  crew: FriendCrewInput[];
  activity: Map<string, FriendActivity>;
  badges: Map<string, FriendBadges>;
  activeUserIds: Set<string>;
}): FriendRow[] {
  const rows = input.crew.map((member) => assembleRow(member, input, false));
  return sortFriendRows(rows);
}

/**
 * 내 행 (2026-08-07 사용자 지시 — "친구리스트 최상단에 각 유저 본인의 정보도 표시").
 *
 * ⚠️ **친구 배열에 섞지 않는다.** `buildFriendRows`에 나를 넣으면 세 가지가 한꺼번에
 * 틀어진다 — 헤딩의 `친구 N명`이 나를 한 명으로 세고, 접힌 3행 중 한 자리를 내가
 * 차지해 친구 하나가 밀려나며, `pokeableFriendCount`가 찌를 수 없는 나를 센다.
 * 그래서 별도 함수로 만들어 화면이 목록 **위에 고정**해 그린다(정렬 대상이 아니다).
 *
 * ⚠️ 다만 **재는 자는 친구와 같아야 한다** — 같은 `getLevelProgress`, 같은
 * `foldFriendSessions`, 같은 배지 정의. 내 숫자만 다른 경로로 만들면 같은 화면에서
 * 나와 친구를 비교할 수 없다. 세션 질의도 친구와 똑같이 `visibility='group'`으로
 * 좁혀서 내 비공개 세션이 내 행만 부풀리지 않게 한다(`lib/friends.ts` 참조).
 *
 * ⚠️ 2026-08-07 오전에 사용자가 확정했던 "목록에 '나'를 넣지 않는다"를 **사용자가
 * 직접 뒤집었다**(인수인계서 §7). 그때의 근거는 "순위가 없으니 비교 기준으로서의
 * 존재 이유가 사라졌다"였는데, 이번 지시는 순위가 아니라 **내 숫자를 친구와 같은
 * 화면에서 같은 자로 보는 것**이다. 임의로 되돌리지 마라.
 */
export function buildMyRow(input: {
  me: FriendCrewInput;
  activity: Map<string, FriendActivity>;
  badges: Map<string, FriendBadges>;
  activeUserIds: Set<string>;
}): FriendRow {
  return assembleRow(input.me, input, true);
}

/** 행 조립 — 나와 친구가 **같은 함수**를 지나야 두 숫자를 같은 자로 잰 것이 된다 */
function assembleRow(
  member: FriendCrewInput,
  source: {
    activity: Map<string, FriendActivity>;
    badges: Map<string, FriendBadges>;
    activeUserIds: Set<string>;
  },
  isMe: boolean,
): FriendRow {
  const activity = source.activity.get(member.id) ?? EMPTY_ACTIVITY;
  const badge = source.badges.get(member.id);
  const progress = getLevelProgress(member.totalXp);
  return {
    ...activity,
    userId: member.id,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    totalXp: member.totalXp,
    level: progress.currentLevel,
    characterPath: progress.characterPath,
    stageName: progress.stageName,
    badgeCount: badge === undefined ? null : badge.total,
    badgeKeys: badge?.showcaseKeys ?? [],
    status: friendStatus(
      activity.workedOutToday,
      source.activeUserIds.has(member.id),
    ),
    isMe,
  };
}

/**
 * 진행 중이면 `active`가 오늘 완료보다 **뒤**다 — 오늘 이미 마쳤는데 또 하는
 * 중일 수 있고, 그 사람에게 필요한 말은 "운동 중"이 아니라 "완료"다.
 */
function friendStatus(workedOutToday: boolean, isActive: boolean): FriendStatus {
  if (workedOutToday) return "done";
  return isActive ? "active" : "idle";
}

/**
 * 정렬 — **최근 운동순 → 닉네임.** 순위표가 아니다.
 *
 * ⚠️ 2026-08-07(사용자 화면 확인)에 "오늘 안 한 친구 먼저"를 **뺐다.** 그 순서의
 * 유일한 근거는 *찌를 수 있는 사람이 접힌 3행 안에 있어야 한다*는 것이었는데,
 * 같은 날 콕이 **모든 친구에게** 열리면서 그 근거가 사라졌다. 근거가 없어진
 * 규칙을 남겨 두면 다음 사람이 이유를 못 찾고 그대로 베낀다.
 *
 * 남은 기준은 "요즘 활발한 순"이라 성과 서열이 아니다. 기록이 없는 사람은 뒤로 간다.
 */
export function sortFriendRows(rows: FriendRow[]): FriendRow[] {
  return [...rows].sort((a, b) => {
    // ⚠️ null을 -Infinity로 접으면 안 된다. 기록 없는 사람끼리 비교할 때
    //    -Infinity - -Infinity = NaN이 되고, 비교 함수가 NaN을 돌려주면
    //    정렬 결과가 **정의되지 않는다**(닉네임 갈래로 못 넘어간다).
    const at = a.lastWorkoutAt?.getTime() ?? null;
    const bt = b.lastWorkoutAt?.getTime() ?? null;
    if (at !== bt) {
      if (at === null) return 1; // 기록 없는 사람은 뒤로
      if (bt === null) return -1;
      return bt - at;
    }
    return a.nickname.localeCompare(b.nickname, "ko");
  });
}

/** 접힘/펼침 — 데이터를 이미 손에 들고 있으므로 추가 조회가 없다 */
export function visibleFriendRows(
  rows: FriendRow[],
  expanded: boolean,
): FriendRow[] {
  return expanded ? rows : rows.slice(0, FRIEND_PREVIEW_COUNT);
}

/** '전체 보기'를 렌더할지 — 누를 게 없는데 링크만 있는 상태를 만들지 않는다 */
export function canExpandFriendRows(rows: FriendRow[]): boolean {
  return rows.length > FRIEND_PREVIEW_COUNT;
}

/**
 * 아직 찌를 수 있는 친구 수 — 안내 문구용.
 *
 * ⚠️ **상대의 오늘 운동 여부를 보지 않는다** (2026-08-07 사용자 지시).
 * 서버 `poke_user`에도 "상대가 오늘 안 했어야 한다"는 규칙이 **없다**
 * (`0028`이 건 조건은 *내가* 오늘 했는가 하나뿐이다). 옛 크루 카드의 화면 규칙을
 * 그대로 옮겼던 것인데, 그 탓에 **오늘 운동을 마친 친구는 영영 못 찌르는** 상태였다.
 * 이제 조건은 두 개뿐이다 — 내가 오늘 운동했는가, 그 친구를 24시간 안에 찔렀는가.
 */
export function pokeableFriendCount(
  rows: FriendRow[],
  poked: Set<string>,
): number {
  return rows.filter((r) => !poked.has(r.userId)).length;
}

/**
 * 오늘 내가 운동을 마쳤는가 — 콕 활성 조건.
 *
 * ⚠️ **친구 목록의 세션 질의로 판정하면 안 된다.** 그 질의는 `visibility='group'`으로
 * 좁혀 있는데 서버 `poke_requires_workout`(0028)은 **내 세션 전부**를 본다. 좁힌
 * 값으로 판정하면 *서버는 허용하는데 버튼만 흐릿한* 막다른 길이 생긴다.
 * 그래서 필터 없는 내 전체 완료 기록(`completedAts`)을 받는다.
 */
export function workedOutToday(
  completedAts: Date[],
  now: Date,
  timeZone: string,
): boolean {
  const today = dayKey(now, timeZone);
  return completedAts.some((d) => dayKey(d, timeZone) === today);
}

/**
 * 누적 분 → 표시 문구. 누적이라 값이 커서 분으로만 적으면 읽히지 않는다.
 * 60분 미만은 분, 이상은 시간(내림)으로 적는다.
 */
export function formatTotalMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}분`;
  return `${Math.floor(safe / 60)}시간`;
}
