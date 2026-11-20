/**
 * 레벨업·진화 사건 — 피드 카드 배지와 알림함 줄이 같이 쓰는 순수 규칙 (0142·0143, 2026-11-20 사용자 시안).
 *
 * 시안: 알림함에 "낭만송곳니님이 진화했어요! / 시동러 → 꾸준러", 누르면 피드 카드 사진 위에 캐릭터 그림과
 * "꾸준러로 진화 / Lv.16 달성" 배지가 겹쳐 보인다.
 *
 * ⚠️ 값은 DB(`workout_sessions.progress_event`)가 `notify_progress`로 써 준다. 화면이 레벨·단계를 다시
 *    계산하지 않는다 — 그 시점의 사실을 그대로 보여 주는 기록이다.
 * ⚠️ 외부에서 들어온 값(jsonb)이라 `parseProgressEvent`로 **모양을 확인**한 뒤에만 쓴다.
 */

export type ProgressEventKind = "evolution" | "level_up";

export type ProgressEvent = {
  kind: ProgressEventKind;
  /** 오른 뒤 레벨 */
  level: number;
  /** 오르기 전 레벨 */
  prevLevel: number;
  /** 오른 뒤 단계 (1~7) — 캐릭터 그림을 고른다 */
  stage: number;
  stageName: string | null;
  prevStage: number;
  prevStageName: string | null;
};

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const nameOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** DB jsonb → 이벤트. 모양이 틀리면 null (카드는 이벤트 없는 예전 모양으로 그려진다) */
export function parseProgressEvent(raw: unknown): ProgressEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "evolution" && r.kind !== "level_up") return null;
  if (!isInt(r.level) || !isInt(r.prevLevel) || !isInt(r.stage) || !isInt(r.prevStage)) return null;
  if (r.stage < 1 || r.stage > 7) return null; // 캐릭터 그림은 1~7단계
  return {
    kind: r.kind,
    level: r.level,
    prevLevel: r.prevLevel,
    stage: r.stage,
    stageName: nameOrNull(r.stageName),
    prevStage: r.prevStage,
    prevStageName: nameOrNull(r.prevStageName),
  };
}

/**
 * 단계 이름 뒤 조사 — "꾸준러**로** 진화", "대장**으로** 진화". 받침이 없거나 ㄹ이면 "로", 그 밖이면 "으로".
 * 한글이 아니면 "로"로 둔다.
 */
export function roParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return "로";
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로"; // 8 = ㄹ
}

/**
 * 배지 문구 — 강조(단계 이름·레벨) / 나머지 / 아래 줄. 화면은 `accent`만 색을 입힌다.
 *   진화   : 꾸준러 + "로 진화"      / "Lv.16 달성"
 *   레벨업 : "Lv.5" + " 레벨업"      / "Lv.4 → Lv.5"
 */
export function progressBadgeText(e: ProgressEvent): { accent: string; rest: string; sub: string } {
  if (e.kind === "evolution") {
    const name = e.stageName ?? "다음 단계";
    return { accent: name, rest: `${roParticle(name)} 진화`, sub: `Lv.${e.level} 달성` };
  }
  return { accent: `Lv.${e.level}`, rest: " 레벨업", sub: `Lv.${e.prevLevel} → Lv.${e.level}` };
}

/**
 * 알림함 줄이 진화·레벨업인지 — `notifications`에는 이벤트 값이 없어서 유형(`level_up`)과 제목으로 가른다.
 * `notify_progress`가 진화 제목에만 "진화했어요"를 쓴다. 다른 유형은 제목에 뭐가 있어도 null이다.
 */
export function notificationProgressKind(n: { type: string; title: string | null }): ProgressEventKind | null {
  if (n.type !== "level_up") return null;
  return (n.title ?? "").includes("진화") ? "evolution" : "level_up";
}

/** 제목 앞의 이모지·공백을 뗀다 — 알림함은 이모지를 아이콘 칸에 따로 그린다 (저장된 제목은 푸시용이라 그대로 둔다) */
export function stripLeadingEmoji(title: string): string {
  return title.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");
}

/**
 * 같은 날 한 카드로 묶인 운동들의 사건 중 **가장 큰 하나** — 진화 > 레벨업, 같으면 레벨이 높은 쪽.
 * (카드에 배지를 둘 겹쳐 그리지 않는다. 글자 문구(`progressNote`)는 묶음 전부를 잇는다.)
 */
export function mergeProgressEvents(events: readonly (ProgressEvent | null)[]): ProgressEvent | null {
  let best: ProgressEvent | null = null;
  for (const e of events) {
    if (!e) continue;
    if (
      !best ||
      (e.kind === "evolution" && best.kind !== "evolution") ||
      (e.kind === best.kind && e.level > best.level)
    ) {
      best = e;
    }
  }
  return best;
}
