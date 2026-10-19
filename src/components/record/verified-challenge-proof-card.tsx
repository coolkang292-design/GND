import type { GoalContribution } from "@/lib/challenge";
import { challengeConfirmationLabel, type ChallengeConfirmation } from "@/lib/domain/challenge-confirmation";

function displayNumber(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString("ko-KR");
}

/**
 * Reports server-confirmed period TOTALS only. The current RPC omits session ID,
 * so attributing +N to the just-completed workout would be misleading.
 */
export function VerifiedChallengeProofCard({
  name,
  photoRequired,
  photoDone,
  gains,
  confirmation,
}: {
  name: string;
  photoRequired: boolean;
  photoDone: boolean;
  gains: readonly GoalContribution[];
  confirmation: ChallengeConfirmation;
}) {
  if (gains.length === 0) return null;
  const stage = challengeConfirmationLabel(photoRequired, photoDone, confirmation.status);
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-label={name + " 챌린지"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-[14px] font-extrabold">{name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${stage === "confirmed" ? "bg-good/15 text-good" : "bg-accent-weak text-accent"}`}>
          {stage === "pending" ? "인증 대기" : stage === "checking" ? "실적 확인 중" : stage === "unavailable" ? "확인 필요" : "서버 확인 완료"}
        </span>
      </div>
      {stage === "pending" ? (
        <p className="mt-2 text-sm text-muted">사진 인증 후 이 챌린지의 실적 반영 여부를 확인할 수 있어요.</p>
      ) : stage === "checking" ? (
        <p className="mt-2 text-sm text-muted">실제 챌린지 실적을 확인하고 있어요.</p>
      ) : stage === "unavailable" ? (
        <p className="mt-2 text-sm text-warn">운동은 저장됐어요. 챌린지 집계 결과를 확인하지 못했어요.</p>
      ) : confirmation.status === "confirmed" ? (
        <>
          <p className="mt-2 text-[13px] font-bold text-accent">현재 챌린지 누적 실적 · 서버 조회 기준</p>
          {confirmation.totals.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {confirmation.totals.map((item, index) => (
                <li key={item.type + "-" + index} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold">{item.label}</span>
                  <span className="font-mono font-bold text-accent">{displayNumber(item.value)}{item.unit}
                    <span className="ml-1 font-sans text-[11px] text-muted">/ 목표 {displayNumber(item.target)}{item.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">설정된 목표가 없어요.</p>}
          <p className="mt-2 text-[11px] text-muted">개별 운동의 추가 기여분이 아닌 챌린지 기간 전체 실적이에요.</p>
        </>
      ) : null}
    </section>
  );
}
