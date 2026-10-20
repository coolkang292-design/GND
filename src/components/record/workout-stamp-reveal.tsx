import { WorkoutCompleteStamp } from "./workout-complete-stamp";
import {
  stampCompletionLine,
  STAMP_HEADLINE_DELAY_MS,
  STAMP_SPECIAL_LINE_DELAY_MS,
  type StampVariant,
} from "@/lib/domain/workout-stamps";

/** A single physical-stamp moment inside the completed-workout overlay. */
export function WorkoutStampReveal({ dateKey, variant }: {
  dateKey: string; variant: StampVariant;
}) {
  const specialLine = variant === "basic" ? null : stampCompletionLine(variant);
  return (
    <div data-testid="workout-stamp-reveal"
      className="relative overflow-hidden rounded-[18px] border border-good/40 bg-good-weak px-4 py-4"
      aria-live="polite"
      aria-label={`오늘의 ${variant === "gold" ? "골드" : variant === "orange" ? "오렌지" : "기본"} 도장 획득`}
    >
      <div className="relative mx-auto flex h-[138px] w-[138px] items-center justify-center">
        <div aria-hidden="true" data-testid="large-stamp-impact"
          className="gnd-stamp-reveal-impact absolute inset-[12px]">
          <WorkoutCompleteStamp seed={dateKey} variant={variant} className="h-full w-full" />
        </div>
        <span aria-hidden="true" className="gnd-stamp-reveal-ring" />
        {variant === "gold" && <span aria-hidden="true" className="gnd-stamp-gold-burst" />}
      </div>
      {/* Read the accomplishment only after the stamp has visibly landed. */}
      <p data-testid="stamp-achievement-line"
        className="gnd-stamp-reveal-message mt-1 text-[18px] font-extrabold text-foreground"
        style={{ animationDelay: `${STAMP_HEADLINE_DELAY_MS}ms` }}>
        오늘도 해냈다.
      </p>
      {/* Keep the orange/gold good-omen copy without weakening the shared achievement. */}
      {specialLine && (
        <p data-testid="stamp-special-line"
          className="gnd-stamp-reveal-submessage mt-1 text-[12.5px] font-bold text-muted"
          style={{ animationDelay: `${STAMP_SPECIAL_LINE_DELAY_MS}ms` }}>
          {specialLine}
        </p>
      )}
    </div>
  );
}
