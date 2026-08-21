/**
 * 프로필 이력 타임라인 — 가입 · 레벨업 · 배지를 한 줄로 엮는다 (2026-08-19).
 *
 * 사용자 요청: *"이 회원이 언제 가입을 했고 언제 어떤 배지를 획득했으며 언제
 * 레벨업을 했는지 … 누적으로 몇 시간을 운동했고 며칠을 했으며 몇 km를 달렸는지"*
 *
 * ⚠️ 이건 **꾸준왕 열람권과 다른 것이다.** 열람권은 *챌린지 KPI*를 들여다보는
 * 권리고(0012·`domain/viewing-pass.ts`), 이건 프로필 카드의 이력이다. 열람권
 * 설계를 건드리지 않는다 — 섞으면 "5일 운동해야 남의 가입일을 본다"가 된다.
 *
 * 순수 함수만 둔다. 재료는 `get_crew_member_profile`(0081)이 서버에서 모아 준다.
 */

export type ProfileHistoryEvent =
  | { kind: "joined"; at: Date }
  | { kind: "level_up"; at: Date; level: number }
  | { kind: "badge"; at: Date; badgeKey: string; name: string; emoji: string };

export type ProfileHistoryInput = {
  /** `profiles.created_at`. 없으면 가입 줄을 안 그린다 */
  joinedAt: Date | null;
  levelUps: { level: number; at: Date }[];
  badges: { badgeKey: string; earnedAt: Date }[];
  /** 이름·이모지 원천. 여기 없는 키는 버린다 */
  catalog: { key: string; name: string; emoji: string }[];
};

/** 같은 시각이 겹칠 때의 순서 — 레벨업이 먼저, 가입이 항상 맨 아래 */
const TIE_ORDER: Record<ProfileHistoryEvent["kind"], number> = {
  level_up: 0,
  badge: 1,
  joined: 2,
};

/**
 * 최신순 이력. 화면은 이 배열을 그대로 위에서 아래로 그린다.
 *
 * ⚠️ 카탈로그에 없는 `badgeKey`는 **버린다.** `badgeShelf`와 같은 규칙이다 —
 *    배지가 늘거나 키가 바뀌어도 화면이 `undefined`를 그리지 않는다.
 *
 * ⚠️ 반복 배지(`repeatable`)는 **받은 횟수만큼 줄이 선다.** 배지 선반은 개수로
 *    접지만 이력에서는 "언제"가 요점이라 접으면 안 된다.
 */
export function buildProfileHistory(
  input: ProfileHistoryInput,
): ProfileHistoryEvent[] {
  const byKey = new Map(input.catalog.map((b) => [b.key, b]));
  const events: ProfileHistoryEvent[] = [];

  if (input.joinedAt) events.push({ kind: "joined", at: input.joinedAt });

  for (const l of input.levelUps) {
    events.push({ kind: "level_up", at: l.at, level: l.level });
  }

  for (const b of input.badges) {
    const meta = byKey.get(b.badgeKey);
    if (!meta) continue;
    events.push({
      kind: "badge",
      at: b.earnedAt,
      badgeKey: b.badgeKey,
      name: meta.name,
      emoji: meta.emoji,
    });
  }

  return events.sort((a, b) => {
    const diff = b.at.getTime() - a.at.getTime();
    return diff !== 0 ? diff : TIE_ORDER[a.kind] - TIE_ORDER[b.kind];
  });
}

/**
 * 누적 운동시간.
 *
 * ⚠️ `member-profile-sheet`의 기간용 `formatMinutes`(시간 단위로 내림)와 **다르다.**
 *    누적은 큰 수라 시간만 남기면 "31시간"에서 13분이 조용히 사라진다. 기간 요약은
 *    한 줄에 여러 지표가 붙어 짧아야 하고, 이건 단독으로 서는 숫자다.
 */
export function formatCumulativeMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}분`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 누적 거리. **0이면 `null`** — 달리기를 안 하는 사람에게 `0.0km`는 잡음이다.
 * 호출부는 null이면 칸 자체를 안 그린다.
 */
export function formatCumulativeDistance(meters: number): string | null {
  if (!(meters > 0)) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 누적 든 무게 (2026-08-21 사용자 요청 — 기록 탭 누적 지표).
 *
 * ⚠️ **단위가 도중에 바뀐다.** 시작한 사람은 수백 kg이고 오래 한 사람은 수십 톤이다.
 * 늘 톤으로 적으면 초보에게 `0.3톤`이 되어 아무것도 안 한 것처럼 읽히고, 늘 kg으로
 * 적으면 `284,500kg`이 칸을 넘는다.
 *
 * ⚠️ `achievements.ts`의 `toDisplayUnit`은 **늘 톤**이다. 거기를 고치지 마라 —
 * 그건 배지 기준값(1톤·10톤…)과 같은 단위로 진행바를 그려야 해서 그렇다.
 * 여기는 사람의 누적을 혼자 세우는 숫자라 규칙이 다르다.
 */
export function formatCumulativeVolume(kg: number): string {
  const safe = Math.max(0, kg);
  if (safe < 1000) return `${Math.round(safe)}kg`;
  const tons = Math.round((safe / 1000) * 10) / 10;
  return `${tons.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}톤`;
}
