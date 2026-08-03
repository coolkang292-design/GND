"use client";

/**
 * 0kg으로 완료한 웨이트 세트에 "맨몸이었나요?"를 되묻는 시트 (2026-08-04).
 *
 * 판정은 `domain/zero-weight.ts`가 하고 여기서는 묻기만 한다.
 * 데이터로 추측해서 자동으로 옮기지 않는 이유는 그 파일 주석에 있다.
 */
export function ZeroWeightSheet({
  exerciseName,
  onKeepWeight,
  onSwitchToBodyweight,
}: {
  /** null이면 안 뜬다 */
  exerciseName: string | null;
  onKeepWeight: () => void;
  onSwitchToBodyweight: () => void;
}) {
  if (exerciseName === null) return null;
  return (
    <>
      <button
        aria-label="닫기"
        onClick={onKeepWeight}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 className="text-base font-extrabold">
          &lsquo;{exerciseName}&rsquo;를 무게 없이 하셨나요?
        </h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          무게를 <b>0kg</b>으로 완료하셨어요. 기구 없이 맨몸으로 한 운동이면{" "}
          <b>맨몸</b>으로 기록해야 챌린지의 <b>맨몸 실적</b>에 들어가요. 웨이트로
          두면 맨몸 횟수는 오르지 않아요.
        </p>
        <button
          onClick={onSwitchToBodyweight}
          className="mt-4 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          맨몸 운동으로 바꾸기
        </button>
        <button
          onClick={onKeepWeight}
          className="mt-2 h-11 w-full rounded-card border border-line bg-surface text-sm font-bold text-muted"
        >
          웨이트로 둘게요
        </button>
      </div>
    </>
  );
}
