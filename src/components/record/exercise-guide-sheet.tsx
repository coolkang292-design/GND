"use client";

import { useEffect, useRef } from "react";
import {
  GUIDE_SAFETY_NOTE,
  isReviewedSource,
  type ExerciseGuide,
} from "@/lib/domain/exercise-guides";
import { dayKey } from "@/lib/domain/time";

/**
 * 운동 자세 안내 시트 (계획 2026-08-12).
 *
 * **GND 안내가 본문이고 외부 원문은 곁가지다.** 링크가 없어도 이 시트는 온전히
 * 동작한다. 외부 본문·사진·영상은 복사하지도 iframe으로 넣지도 않는다.
 *
 * ⚠️ 링크를 눌러 실제로 열렸는지는 앱이 알 수 없다. 그러니 "열었어요" 같은
 *    성공 토스트를 지어내지 않는다.
 */
function GuideSection({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <section className="mt-3 first:mt-0">
      <h4 className="text-[12px] font-extrabold text-accent">{title}</h4>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className="text-[12.5px] leading-relaxed text-text">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExerciseGuideSheet({
  guide,
  onClose,
}: {
  guide: ExerciseGuide;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 데이터가 계약을 어겼으면 링크를 만들지 않는다. 화면이 마지막 관문이다 —
  // 테스트를 통과한 데이터만 온다고 가정하지 않는다.
  //
  // '오늘'은 보는 사람의 시간대로 센다. UTC로 재면 한국 아침에 등록한 링크가
  // 몇 시간 동안 "미래 검수"로 잡혀 조용히 사라진다.
  const today = dayKey(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
  );
  const source =
    guide.source && isReviewedSource(guide.source, today) ? guide.source : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-guide-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <h3
          id="exercise-guide-title"
          className="mb-3 flex-none text-center text-base font-extrabold"
        >
          {guide.exerciseName} 자세 안내
        </h3>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <GuideSection title="시작 자세" items={guide.setup} />
          <GuideSection title="동작" items={guide.movement} />
          <GuideSection title="호흡" items={[guide.breathing]} />
          <GuideSection title="자주 하는 실수" items={guide.mistakes} />
          <GuideSection title="주의" items={[guide.caution]} />

          <p className="mt-3 rounded-card-sm bg-surface-2 p-2.5 text-[11.5px] leading-relaxed text-muted">
            {GUIDE_SAFETY_NOTE}
          </p>

          {source && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex h-11 items-center justify-center rounded-card-sm border border-line text-[12.5px] font-bold text-accent"
            >
              {source.provider}에서 자세히 보기 ↗
            </a>
          )}
        </div>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="안내 닫기"
          className="mt-3 h-12 flex-none rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
