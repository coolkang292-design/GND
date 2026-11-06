/**
 * 성장률 부족분을 **구체적인 운동 지침**으로 바꾼다 (읽기 전용 · 표시용).
 *
 * "성장률 2.9%p 더 필요"는 어른도 무슨 말인지 모른다. 그래서 종목별로
 * "벤치프레스: 지금 60kg 8번 → 다음엔 64kg 8번"처럼 **오늘 할 일**로 풀어 준다.
 *
 * 종목 성장률은 "처음 3번의 가운데 값" 대비 "최근 3번의 가운데 값"이다. 목표를
 * 넘으려면 최근 3번 중 **2번 이상**이 목표 기록이어야 가운데 값이 올라간다.
 *
 * 전체 성장률은 종목들의 가운데 값이라, **종목의 절반 넘게**(과반)가 목표를
 * 넘어야 한다. 그래서 목표에 가장 가까운 종목부터 `필요한 개수`만큼 골라 보여 준다.
 */
import type { ExerciseGrowth, GrowthSummary } from "./evolution";

/** 2.5kg·1.25kg 원판을 쓰므로 0.5kg 단위로 올림해서 보여 준다 */
function ceilHalf(kg: number): number {
  return Math.ceil(kg * 2) / 2;
}

function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/** 한 종목의 목표 한 줄 — 종목 종류(중량·맨몸·시간)별로 다르게 말한다 */
export function exerciseTip(e: ExerciseGrowth, targetPct: number): string | null {
  const targetValue = e.base * (1 + targetPct / 100);
  if (e.kind === "w") {
    const w = e.last.weight;
    const r = e.last.reps;
    if (!w || !r) return null;
    // 같은 횟수로 더 무겁게 / 같은 무게로 더 많이 — 둘 다 알려 준다
    const newW = ceilHalf(targetValue / (1 + r / 30));
    const newR = Math.ceil(30 * (targetValue / w - 1));
    if (newW <= w) {
      return `${e.exercise}: 지금 ${fmtKg(w)}kg ${r}번이면 충분해요. 최근 3번 중 2번만 이만큼 하면 점수가 올라가요`;
    }
    return `${e.exercise}: 지금 ${fmtKg(w)}kg ${r}번 → 다음엔 ${fmtKg(newW)}kg ${r}번 (또는 ${fmtKg(w)}kg ${newR}번)`;
  }
  if (e.kind === "r") {
    const r = e.last.reps;
    if (!r) return null;
    const goal = Math.ceil(targetValue);
    return goal <= r
      ? `${e.exercise}: 지금 ${r}번이면 충분해요. 최근 3번 중 2번만 이만큼 하면 점수가 올라가요`
      : `${e.exercise}: 지금 ${r}번 → ${goal}번 하기`;
  }
  const s = e.last.seconds;
  if (!s) return null;
  const goal = Math.ceil(targetValue);
  return goal <= s
    ? `${e.exercise}: 지금 ${s}초면 충분해요. 최근 3번 중 2번만 이만큼 하면 점수가 올라가요`
    : `${e.exercise}: 지금 ${s}초 → ${goal}초 버티기`;
}

const MAX_TIPS = 3;

/**
 * @param targetPct 목표 성장률(%). 0이면 "기준선 확보"(3단계)만 요구한다.
 */
export function growthTips(growth: GrowthSummary, targetPct: number): string[] {
  const list = growth.exercises ?? [];

  // ① 이미 재고 있는데 목표에 모자란 경우 — 오늘 할 일로 풀어 준다
  const measured = list.filter((e) => e.growthPct !== null);
  if (growth.value !== null && measured.length >= 2) {
    const needTotal = Math.floor(measured.length / 2) + 1;
    const alreadyMet = measured.filter((e) => (e.growthPct as number) >= targetPct).length;
    const need = Math.min(MAX_TIPS, Math.max(1, needTotal - alreadyMet));
    const candidates = measured
      .filter((e) => (e.growthPct as number) < targetPct)
      // 목표까지 더 올려야 하는 비율이 작은 종목 = 가장 쉽게 넘는 종목
      .sort(
        (a, b) =>
          (a.base * (1 + targetPct / 100)) / a.recent -
          (b.base * (1 + targetPct / 100)) / b.recent,
      );
    const tips: string[] = [];
    for (const c of candidates) {
      const t = exerciseTip(c, targetPct);
      if (t) tips.push(t);
      if (tips.length >= need) break;
    }
    return tips;
  }

  // ② 아직 못 재는 경우 — 어떤 종목을 몇 번 더 기록하면 재게 되는지
  const goalDays = targetPct === 0 ? 3 : 6;
  const near = list
    .filter((e) => e.dayCount < goalDays)
    .sort((a, b) => b.dayCount - a.dayCount)
    .slice(0, MAX_TIPS);
  if (near.length > 0) {
    return near.map(
      (e) => `${e.exercise}: ${e.dayCount}번 기록했어요 → ${goalDays - e.dayCount}번만 더 하면 잴 수 있어요`,
    );
  }
  if (targetPct > 0 && measured.length === 1) {
    return ["지금 재고 있는 운동이 하나뿐이에요. 다른 운동 하나를 6번 기록하면 성장률이 나와요"];
  }
  return [
    targetPct === 0
      ? "같은 운동(예: 스쿼트)을 3번만 기록하면 내 시작점이 생겨요"
      : "같은 운동(예: 벤치프레스)을 6번 기록하면 내가 얼마나 세졌는지 알려 줘요",
  ];
}
