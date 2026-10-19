import { UiIcon } from "@/components/ui-icon";
import type { GoalContribution } from "@/lib/challenge";
import type { ChallengeProofState } from "@/lib/domain/achievement-moment";

/**
 * 완료 화면의 챌린지 반영 카드 (이슈 #16 P0-B, 2026-10-19).
 *
 * 옛 카드는 `record/page.tsx` 안에 있었고 "챌린지 목표에 쌓일 몫 / 쌓였어요"를 한 줄 삼항으로
 * 갈랐다. 이제 상태(`challengeProofState`)마다 **예정형과 확정형을 문장으로** 나눈다.
 *
 * - `pending`  : 사진 필수인데 사진이 없다 → "사진을 올리면 … 반영돼요" + `인증 대기`
 * - `confirmed`: 반영 조건을 채웠다 → "반영됐어요" (사진 필수면 "챌린지 인증 완료")
 * - `no_gain`  : 보탠 몫이 0 → 반영됐다고 말하지 않고 목표 목록으로 사유를 보인다
 *
 * ⚠️ 목표가 여럿이면 **보탠 목표만 각자의 양**으로 보인다. "+1일"을 모든 목표에 붙이지 않는다.
 * ⚠️ 사진 버튼은 이 카드 **바로 아래** `VerificationPhoto`가 가진다(인증 대기면 주 CTA).
 *    여기에 버튼을 또 두면 같은 일을 하는 강한 버튼이 둘이 된다.
 */
export function ChallengeProofCard({
  state,
  photoRequired,
  gains,
}: {
  state: Exclude<ChallengeProofState, "none">;
  photoRequired: boolean;
  gains: readonly GoalContribution[];
}) {
  if (state === "no_gain") {
    // 하나도 못 보탰으면 **그 사실과 이유**를 말한다. 카드를 감추면
    // "왜 안 오르지?"에 침묵하게 된다 (2026-08-04 사용자 지적).
    return (
      <section className="rounded-card border border-warn/40 bg-surface p-4">
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-warn">
          {/* 옛 표기는 `🎯`였다 (2026-08-07 2차 시안으로 교체) */}
          <UiIcon name="goal" size={15} />
          이번 운동은 챌린지 성과에 안 잡혔어요
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          운동 기록과 XP는 그대로 저장됐어요. 다만 지금 내 챌린지 목표와 맞는 게 없어요.
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {gains.map((gain) => (
            <li key={gain.type} className="text-[12.5px] font-bold">
              · {gain.label}{" "}
              <span className="font-normal text-muted">
                (목표 {gain.target}
                {gain.unit})
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const pending = state === "pending";
  const gained = gains.filter((g) => g.delta > 0);
  return (
    <section
      className={`rounded-card border bg-surface p-4 ${pending ? "border-accent/60" : "border-good/50"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-extrabold">
          <UiIcon name="goal" size={15} />
          {pending
            ? "챌린지 인증"
            : photoRequired
              ? "챌린지 인증 완료"
              : "챌린지 목표에 쌓였어요"}
        </p>
        {pending && (
          <span className="rounded-full bg-accent-weak px-2 py-0.5 text-[11px] font-extrabold text-accent">
            인증 대기
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-sm font-bold ${pending ? "" : "text-accent"}`}>
        {pending
          ? "아래에서 사진을 올리면 챌린지 목표에 반영돼요"
          : photoRequired
            ? "챌린지 목표에 반영됐어요"
            : "이번 운동이 목표에 더해졌어요"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {gained.map((gain) => (
          <li key={gain.type} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-bold">{gain.label}</span>
            <span className={`font-mono font-extrabold ${pending ? "text-muted" : "text-accent"}`}>
              +{gain.delta}
              {gain.unit}
              <span className="ml-1 font-sans text-[11px] font-bold text-muted">
                / 목표 {gain.target}
                {gain.unit}
                {pending && " · 반영 예정"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
