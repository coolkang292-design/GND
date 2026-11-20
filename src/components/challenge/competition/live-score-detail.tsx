import { GOAL_TYPE_META } from "@/lib/challenge";
import {
  ACTIVITY_MINUTES_PER_POINT,
  ACTIVITY_POINT_PER_DAY,
  ACTIVITY_POINT_PER_SESSION,
  type RankedParticipantV2,
} from "@/lib/domain/goal-score-v2";

const pt = (n: number) => n.toFixed(2);
/** 소수 둘째 자리까지, 뒤의 0은 뗀다 (20 → "20", 4.62 → "4.62") */
const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * 진행 중 `종합 점수 랭킹` 줄을 눌렀을 때 펼쳐지는 점수 풀이 (2026-11-20, 사용자 요청).
 * **목표 점수**와 **활동 점수**를 따로 나눠, 각각 그 사람의 실제 기록을 넣은 계산을 보여준다.
 * 나·다른 참가자 모두 같은 모양이다 — 실시간 랭킹 방은 이미 모두의 종합 점수와 종목별 기록을 공개한다.
 *
 * ⚠️ 여기서 점수를 계산하지 않는다. 모든 숫자는 `rankForChallenge`가 만든 `v2.breakdown`에서 온다
 *    (`ScoreExplanation`과 같은 원천). 화면이 따로 계산하면 순위와 설명이 갈린다.
 * ⛔ 활동 점수는 **순위에 더하지 않는다**(사용자 결정 2026-11-16 — 기간 중에 더하면 "점수가 갑자기
 *    106점이 됐다"는 지적이 있었다). 여기서는 지금 기록으로 얼마인지만 따로 보여주고,
 *    "종료 후 순위에 더해진다 · 지금은 반영되지 않는다"를 같이 말한다. 순위표 숫자는 기본 점수 그대로다.
 * ⚠️ 운동한 날은 `breakdown.workoutDays`(실제 일수)를 쓴다. 참여율에서 거꾸로 계산하면 계획 13일에
 *    17일을 해도 13일로 보인다(참여율은 100%에서 멈춘다).
 * ⚠️ 목표 이름은 종류 이름만 쓴다. 다른 참가자의 `하루 N종목+` 조건은 이 화면이 모른다 —
 *    모르는 숫자를 지어내지 않는다.
 */
export function LiveScoreDetail({ v2 }: { v2: RankedParticipantV2 }) {
  const b = v2.breakdown;
  const a = b.activity;
  return (
    <div data-testid="live-score-detail" className="mx-2.5 mb-2 flex flex-col gap-2.5">
      {/* ── 목표 점수 (기본 점수) ───────────────────────────── */}
      <section data-testid="live-goal-score" className="rounded-card-sm bg-surface-2 px-3 py-2.5">
        <h4 className="text-[13px] font-extrabold">목표 점수</h4>
        <p className="text-[11px] text-muted">목표 달성 + 운동 참여 + 목표 완료 보너스</p>
        <dl className="mt-2 flex flex-col gap-2">
          <div>
            <dt className="flex justify-between text-[12.5px] font-extrabold">
              <span>목표 달성</span>
              <span className="font-mono">+{pt(b.achievementPoints)}점</span>
            </dt>
            <dd className="text-[11.5px] text-muted">평균 달성률 {num(b.achievementRate)}% × 0.8</dd>
            <dd>
              <ul className="mt-1 flex flex-col gap-0.5">
                {b.goals.map((g) => {
                  const meta = GOAL_TYPE_META[g.type];
                  return (
                    <li key={g.type} className="flex justify-between gap-2 text-[11px] text-muted">
                      <span className="min-w-0">
                        {meta?.label ?? g.type}
                        {g.auto && " (추가 평가 항목)"} · 달성 {num(g.actual)}
                        {meta?.unit} ÷ 목표 {num(g.target)}
                        {meta?.unit} = {num(g.rate * 100)}%
                      </span>
                      <span className="flex-none font-mono">+{pt(g.points)}점</span>
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="flex justify-between text-[12.5px] font-extrabold">
              <span>운동 참여</span>
              <span className="font-mono">+{pt(b.participationPoints)}점</span>
            </dt>
            <dd className="text-[11.5px] text-muted">
              실제 {num(b.workoutDays)}일 / 계획 {b.plannedDays}일 · 참여점수 {num(b.participationPoints)}점
              {b.workoutDays > b.plannedDays && " (계획을 넘겨도 참여점수는 만점에서 멈춰요)"}
            </dd>
          </div>
          <div>
            <dt className="flex justify-between text-[12.5px] font-extrabold">
              <span>목표 완료 보너스</span>
              <span className="font-mono">+{pt(b.completionBonus)}점</span>
            </dt>
            <dd className="text-[11.5px] text-muted">100% 완료한 목표 {b.completedGoalCount}개</dd>
          </div>
        </dl>
        <p className="mt-2 flex justify-between border-t border-line pt-2 text-[12.5px] font-extrabold">
          <span>목표 점수 합계 {pt(v2.baseScore)}점</span>
        </p>
      </section>

      {/* ── 활동 점수 (종료 후 순위에 더해진다) ──────────────── */}
      <section data-testid="live-activity-score" className="rounded-card-sm bg-surface-2 px-3 py-2.5">
        <h4 className="text-[13px] font-extrabold">활동 점수</h4>
        <p className="text-[11px] text-muted">목표와 상관없이 실제로 운동한 만큼 쌓이는 점수예요</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[12px]">
          <li className="flex justify-between gap-2">
            <span>
              운동한 날 {num(b.workoutDays)}일 × {ACTIVITY_POINT_PER_DAY}점 = +{num(a.days)}점
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span>
              운동 {num(b.workoutSessions)}회 × {ACTIVITY_POINT_PER_SESSION}점 = +{num(a.sessions)}점
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span>
              운동 시간 {num(b.workoutMinutes)}분 ÷ {ACTIVITY_MINUTES_PER_POINT} = +{num(a.minutes)}점
            </span>
          </li>
        </ul>
        {!b.minutesComplete && (
          <p className="mt-1 text-[11px] text-muted">시간 기록이 없는 운동이 있어 시간 점수는 실제보다 적을 수 있어요</p>
        )}
        <p className="mt-2 flex justify-between border-t border-line pt-2 text-[12.5px] font-extrabold">
          <span>활동 점수 합계 +{pt(a.total)}점</span>
        </p>
        <p className="mt-1 text-[11px] text-muted">
          활동 점수는 챌린지가 끝난 뒤 순위에 더해져요. 지금은 순위에 반영되지 않아요.
        </p>
      </section>
    </div>
  );
}
