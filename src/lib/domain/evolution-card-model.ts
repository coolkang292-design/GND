import type { GateAlternate, GateCondition, StageGateStatus } from "./evolution-gate";

/**
 * 진화 카드의 표시 규칙 — React 의존 없음. 판정(met·state)은 서버 값을 그대로 쓰고,
 * 여기서는 **표시용** 배수·배지·막대 %·문구만 계산한다. (설계서: specs/2026-11-13-evolution-card-b-design.md)
 */
export type Tone = "met" | "over" | "big";
export type CardTile = { key: GateCondition["key"]; label: string; value: string; target: string; tone: Tone; badge: string | null };
/** known=false: 서버가 값을 아직 주지 않음 — 막대를 그리지 않는다(0%로 보이면 안 된다) */
export type CardRow = { key: GateCondition["key"]; label: string; valueText: string; percent: number; hint: string; known: boolean };
export type CardAlternate = { text: string; valueText: string; percent: number; met: boolean; note: string | null };
export type EvolutionCardModel = {
  headline: string;
  sub: string;
  bigNote: string | null;
  steadyNote: boolean;
  segments: boolean[];
  metCount: number;
  total: number;
  celebrate: boolean;
  tiles: CardTile[];
  rows: CardRow[];
  alternate: CardAlternate | null;
};

const LABEL: Record<GateCondition["key"], string> = {
  xp: "경험치 레벨", days: "운동한 날", weeks: "운동 시작 후", recent: "최근 운동",
  growth_count: "성장 종목", growth_average: "평균 성장", steady: "꾸준함",
};
const UNIT: Record<GateCondition["key"], string> = {
  xp: "레벨", days: "일", weeks: "주", recent: "일", growth_count: "종목", growth_average: "%", steady: "회",
};

const r1 = (n: number) => Number(n.toFixed(1));
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function labelOf(c: GateCondition) {
  return c.key === "recent" && c.windowDays ? `최근 운동 ${c.windowDays}일` : LABEL[c.key];
}
function valueOf(key: GateCondition["key"], n: number) {
  if (key === "xp") return `Lv.${n}`;
  if (key === "growth_average") return `+${r1(n)}%`;
  return `${n}${UNIT[key]}`;
}
function targetOf(key: GateCondition["key"], n: number) {
  if (key === "xp") return `목표 Lv.${n}`;
  if (key === "growth_average") return `목표 +${r1(n)}%`;
  return `목표 ${n}${UNIT[key]}`;
}

/** 서버가 met=true라고 한 조건의 초과 정도. 딱 채웠거나 반올림 차이가 0이면 배지 없음 */
function toneOf(c: GateCondition & { current: number; required: number }): { tone: Tone; badge: string | null } {
  const { current: cur, required: req } = c;
  if (!(req > 0) || cur <= req) return { tone: "met", badge: null };
  const ratio = cur / req;
  if (ratio >= 2) return { tone: "big", badge: `${(Math.floor(ratio * 10) / 10).toFixed(1)}배` };
  if (c.key === "growth_average") {
    const d = r1(cur - req);
    return d > 0 ? { tone: "over", badge: `+${d.toFixed(1)}%p` } : { tone: "met", badge: null };
  }
  return { tone: "over", badge: `+${r1(cur - req)}${UNIT[c.key]}` };
}

function hintOf(c: GateCondition & { current: number; required: number }): string {
  const left = c.required - c.current;
  const n = Math.max(1, Math.ceil(left));
  switch (c.key) {
    case "xp": return `${n}레벨 남았어요`;
    case "days": return `${n}일 더 운동하면 돼요`;
    case "weeks": return `${n}주가 더 지나면 채워져요`;
    case "recent": return c.windowDays ? `최근 ${c.windowDays}일 중 ${n}일 더` : `${n}일 더`;
    case "growth_count": return `성장한 종목이 ${n}개 더 필요해요`;
    case "growth_average": return `평균 +${Math.max(0.1, r1(left)).toFixed(1)}%p 더 필요해요`;
    case "steady": return `${n}회 더 필요해요 · 연속 4주 중 3주, 주 2일 이상`;
  }
}

function alternateOf(a: GateAlternate): CardAlternate {
  const cur = a.current ?? 0;
  const unit = a.kind === "days" ? "일" : "회";
  return {
    text: a.kind === "days" ? "성장 대신 운동한 날" : "성장 대신 꾸준함",
    valueText: `${cur} / ${a.required}${unit}`,
    percent: a.required > 0 ? Math.min(100, Math.floor((cur / a.required) * 100)) : 0,
    met: a.met,
    note: a.kind === "days" && a.exemptsSteady ? "꾸준함은 따로 채우지 않아도 돼요" : null,
  };
}

export function buildEvolutionCardModel(status: StageGateStatus): EvolutionCardModel {
  const error = status.state === "error";
  const alt = error ? null : status.alternate ?? null;
  const viaAlternate = status.state === "eligible" && status.path === "alternate";

  const hidden = new Set<GateCondition["key"]>();
  if (error) { hidden.add("growth_count"); hidden.add("growth_average"); }
  if (viaAlternate) {
    hidden.add("growth_count"); hidden.add("growth_average");
    if (alt?.kind === "days" && alt.exemptsSteady) hidden.add("steady");
  }
  const conds = status.conditions.filter(c => !hidden.has(c.key));

  const tiles: CardTile[] = [];
  const rows: CardRow[] = [];
  for (const c of conds) {
    if (isNum(c.current) && isNum(c.required)) {
      const known = c as GateCondition & { current: number; required: number };
      if (c.met) {
        const { tone, badge } = toneOf(known);
        tiles.push({ key: c.key, label: labelOf(c), value: valueOf(c.key, c.current), target: targetOf(c.key, c.required), tone, badge });
      } else {
        const percent = c.required > 0 ? Math.max(0, Math.min(99, Math.floor((c.current / c.required) * 100))) : 0;
        rows.push({ key: c.key, label: labelOf(c), valueText: `${valueOf(c.key, c.current)} → ${valueOf(c.key, c.required)}`, percent, hint: hintOf(known), known: true });
      }
    } else if (c.met) {
      tiles.push({ key: c.key, label: labelOf(c), value: "달성", target: "", tone: "met", badge: null });
    } else {
      rows.push({ key: c.key, label: labelOf(c), valueText: "기준 확인 중", percent: 0, hint: "", known: false });
    }
  }

  const metCount = conds.filter(c => c.met).length;
  const total = conds.length;
  const bigCount = tiles.filter(t => t.tone === "big").length;
  const xpOnly = status.nextStage !== null && status.nextStage <= 3;

  if (status.state === "blocked" && rows.length === 1 && rows[0].hint) {
    rows[0] = { ...rows[0], hint: `마지막 조건이에요 · ${rows[0].hint}` };
  }

  let headline: string;
  if (error) headline = "진화 판정을 다시 확인하고 있어요. 운동 기록과 경험치는 그대로예요.";
  else if (status.state === "needs_baseline") headline = "성장 비교 기준을 확인 중이에요.";
  else if (status.state === "eligible") headline = "진화 조건을 모두 채웠어요";
  else if (xpOnly || total === 0) headline = "진화 조건이 남았어요";
  else headline = `조건 ${total}개 중 ${metCount}개를 채웠어요`;

  const sub = xpOnly
    ? "시동러까지는 경험치만으로 진화해요."
    : "경험치와 운동 습관을 채우고, 성장 기록 또는 아래 대체 경로 중 하나를 채우면 진화해요.";

  return {
    headline, sub,
    bigNote: bigCount > 0 ? `목표를 크게 넘긴 조건 ${bigCount}개` : null,
    steadyNote: conds.some(c => c.key === "steady"),
    segments: conds.map(c => c.met),
    metCount, total,
    celebrate: status.state === "eligible",
    tiles, rows,
    alternate: alt ? alternateOf(alt) : null,
  };
}
