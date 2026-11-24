import {
  ACHIEVEMENT_WEIGHT,
  COMPLETED_GOAL_BONUS_MAX,
  COMPLETED_GOAL_BONUS_PER,
  PARTICIPATION_WEIGHT,
  completedGoalBonus,
  type scoreBreakdown,
} from "@/lib/domain/goal-score";

type Breakdown = ReturnType<typeof scoreBreakdown>;

/**
 * 순위표 한 줄을 눌렀을 때 펼쳐지는 점수 풀이 (2026-11-20, 사용자 요청 "내 점수를 클릭하면
 * 어떻게 해서 이 점수가 되는지"). 나·다른 참가자 모두 같은 모양이다.
 *
 * ⚠️ 이 조각은 **이미 공개된 점수 줄 아래에서만** 쓴다(종합 점수가 보이는 순위표). 종합점수가
 *    잠긴 화면(방장이 실시간 공개를 안 켠 진행 중)에서는 쓰지 않는다.
 * ⚠️ 값은 `rankParticipants`가 낸 `RankedParticipant`에서만 받는다. 점수를 다시 계산하지 않고
 *    화면용으로 곱셈(반영 비율)만 푼다 — 합이 종합점수와 같다는 건 테스트가 지킨다.
 */
export function ScoreDetail({
  achievement,
  participation,
  completedGoalCount,
  overall,
  workoutDays,
  plannedDays,
}: {
  achievement: number;
  participation: number;
  completedGoalCount: number;
  overall: number;
  workoutDays: number;
  plannedDays: number;
}) {
  const achPts = achievement * ACHIEVEMENT_WEIGHT;
  const parPts = participation * PARTICIPATION_WEIGHT;
  const bonus = completedGoalBonus(completedGoalCount);
  const rows: { key: string; label: string; how: string; pts: string; full: boolean }[] = [
    {
      key: "ach",
      label: "목표점수",
      how: `달성률 ${achievement.toFixed(1)}% × ${ACHIEVEMENT_WEIGHT}`,
      pts: `${achPts.toFixed(1)}점`,
      full: achievement >= 100 - 1e-9,
    },
    {
      key: "par",
      label: "참여점수",
      // 실제 운동한 날을 그대로 말한다 — 17일을 해도 계획 13일이면 "17일 ÷ 13일 → 100%(상한)"
      how:
        workoutDays > plannedDays
          ? `운동한 날 ${workoutDays}일 ÷ 계획 ${plannedDays}일 → 100%(상한) × ${PARTICIPATION_WEIGHT}`
          : `운동한 날 ${workoutDays}일 ÷ 계획 ${plannedDays}일 = ${participation.toFixed(1)}% × ${PARTICIPATION_WEIGHT}`,
      pts: `${parPts.toFixed(1)}점`,
      full: participation >= 100 - 1e-9,
    },
    {
      key: "bonus",
      label: "완료 보너스",
      how: `100% 달성한 목표 ${completedGoalCount}개 × ${COMPLETED_GOAL_BONUS_PER}점`,
      pts: `+${bonus}점`,
      full: completedGoalCount >= COMPLETED_GOAL_BONUS_MAX,
    },
  ];
  return (
    <div data-testid="score-detail" className="mx-2.5 mb-2 rounded-card-sm bg-surface-2 px-3 py-2.5">
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="min-w-0">
              <b className="text-[12.5px]">{r.label}</b>
              <span className="ml-1.5 text-[11px] text-muted">{r.how}</span>
              {r.full && (
                <span data-testid="cap-reached" className="ml-1.5 text-[10.5px] font-bold text-good">
                  ✓ 더 안 올라요
                </span>
              )}
            </span>
            <span className="flex-none font-mono font-extrabold">{r.pts}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-baseline justify-between border-t border-line pt-2 text-[12px] font-extrabold">
        <span>합계 (종합 점수)</span>
        <span className="font-mono text-accent">{overall.toFixed(1)}점</span>
      </p>
    </div>
  );
}

/**
 * 점수 구성표 — "종합점수가 어떻게 만들어지나"를 항목별로 푼다 (2026-11-20, 사용자 요청).
 *
 * 왜: 등수는 종합점수(목표점수 80% + 참여점수 20% + 완료 보너스)로 정해지는데, 화면에는
 * 목표점수(평균 달성)만 크게 보여서 참여·보너스로 등수가 뒤집히면 이유를 알 수 없었다.
 * 그리고 각 항목에는 상한이 있어 "채운 뒤에는 더 해도 안 오른다"를 같이 알려준다.
 *
 * ⚠️ 종합점수 **합계 숫자는 여기서 그리지 않는다.** 종료일 공개 결정(2026-10-08)을 지킨다.
 *    항목별 달성률·반영 비율만 보이고, 합계는 "내 진행" 카드의 🔒가 그대로 맡는다.
 * ⚠️ 값은 `scoreBreakdown`(= `scoreParticipant` 위에 얹은 것)에서만 받는다. 여기서 계산하지 않는다.
 */
export function ScoreBreakdownCard({ b }: { b: Breakdown }) {
  const pct = (n: number) => `${Math.round(n)}%`;
  return (
    <section
      data-testid="score-breakdown"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <h3 className="text-[15px] font-extrabold">점수는 이렇게 계산돼요</h3>
      <p className="mt-0.5 text-[11.5px] text-muted">
        종합점수 = 목표점수 × {ACHIEVEMENT_WEIGHT} + 참여점수 × {PARTICIPATION_WEIGHT} + 완료 보너스.
        등수는 종합점수로 정해져요.
      </p>

      <ul className="mt-3 flex flex-col divide-y divide-line">
        <Row
          title="목표점수"
          weight={`× ${ACHIEVEMENT_WEIGHT}`}
          how="내 목표별 달성률의 평균이에요. 목표 하나당 100%까지만 인정해요."
          value={pct(b.achievement)}
          full={b.achievementFull}
          fullText="모든 목표 달성 완료 · 더 해도 이 점수는 안 올라요"
        />
        <Row
          title="참여점수"
          weight={`× ${PARTICIPATION_WEIGHT}`}
          how={`운동한 날 ÷ 계획한 날이에요. ${b.workoutDays}일 / ${b.plannedDays}일.`}
          value={pct(b.participation)}
          full={b.participationFull}
          fullText="계획한 날을 모두 채웠어요 · 더 해도 이 점수는 안 올라요"
        />
        <Row
          title="완료 보너스"
          weight={`+${COMPLETED_GOAL_BONUS_PER}점씩`}
          how={`100% 달성한 목표 1개당 +${COMPLETED_GOAL_BONUS_PER}점, 최대 ${COMPLETED_GOAL_BONUS_MAX}개까지 인정해요.`}
          value={`${b.completedGoalCount}개 · +${b.bonus}점`}
          full={b.bonusFull}
          fullText={`보너스 ${b.bonusMaxCount}개 모두 받았어요 · 더 해도 안 올라요`}
        />
      </ul>

      <p
        data-testid="score-max"
        className="mt-3 rounded-card-sm bg-surface-2 px-3 py-2 text-[12px] font-bold"
      >
        내 목표 {b.goalCount}개 기준 최대 점수는{" "}
        <span className="font-mono text-accent">{b.maxScore}점</span>이에요
        <span className="block text-[11px] font-normal text-muted">
          (80 + 20 + 보너스 최대 {b.bonusMax}점. 목표가 1개면 103점, 2개면 106점, 3개 이상이면 109점)
        </span>
      </p>
      <p className="mt-2 text-[11px] text-muted">
        종합점수가 같으면 목표점수 → 참여점수 → 목표를 먼저 다 채운 순서로 등수를 가려요.
      </p>
    </section>
  );
}

function Row({
  title,
  weight,
  how,
  value,
  full,
  fullText,
}: {
  title: string;
  weight: string;
  how: string;
  value: string;
  full: boolean;
  fullText: string;
}) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-extrabold">
          {title} <span className="font-mono text-[11.5px] font-bold text-muted">{weight}</span>
        </span>
        <span className="font-mono text-[14px] font-black text-accent">{value}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted">{how}</p>
      {full && (
        <p
          data-testid="cap-reached"
          className="mt-1 inline-block rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good"
        >
          ✓ {fullText}
        </p>
      )}
    </li>
  );
}
