"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { getStageGroups } from "@/lib/domain/progression";

/**
 * 7단계 진화 안내 시트 — 각 단계가 어떤 상태이고 몇 레벨에 열리는지 설명한다.
 *
 * 캐러셀은 썸네일만 보여주므로 "왜 7단계인지·언제 진화하는지"를 알 수 없다.
 * "7단계 안내 ›"가 약속하는 설명을 여기서 실제로 준다.
 */
export function StageGuideSheet({
  currentStage,
  totalXp,
  onClose,
}: {
  currentStage: number;
  totalXp: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = getStageGroups();

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
        aria-labelledby="stage-guide-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <h3
          id="stage-guide-title"
          className="flex-none text-center text-base font-extrabold"
        >
          7단계 캐릭터 진화
        </h3>
        <p className="mt-1 flex-none text-center text-[11.5px] text-muted">
          레벨 5개마다 한 단계씩 진화해요. 운동을 완료해 XP를 쌓으면 캐릭터가
          단계별로 바뀝니다.
        </p>

        <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {groups.map((g) => {
            const locked = g.stageIndex > currentStage;
            const current = g.stageIndex === currentStage;
            const xpLeft = Math.max(0, g.requiredTotalXp - totalXp);
            return (
              <li
                key={g.stageKey}
                className={`flex gap-3 border-t border-line py-3 first:border-t-0 first:pt-0 ${
                  current ? "rounded-card-sm bg-accent-weak px-2.5" : ""
                }`}
              >
                <div className="relative flex-none overflow-hidden rounded-card-sm">
                  <Image
                    src={g.characterPath}
                    alt={`${g.stageName} 캐릭터`}
                    width={56}
                    height={75}
                    sizes="56px"
                    className={`object-cover ${locked ? "opacity-40 grayscale" : ""}`}
                  />
                  {locked && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-base"
                    >
                      🔒
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span
                      className={`text-[13px] font-extrabold ${
                        current ? "text-accent" : locked ? "text-muted" : ""
                      }`}
                    >
                      {g.stageIndex}. {g.stageName}
                    </span>
                    {current && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-accent-ink">
                        현재
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                    {g.description}
                  </p>
                  <p className="mt-1 text-[10.5px] text-faint">
                    Lv.{g.startLevel}~{g.endLevel} · 누적{" "}
                    {g.requiredTotalXp.toLocaleString()} XP부터
                    {locked && xpLeft > 0 && (
                      <span className="font-bold text-accent">
                        {" "}
                        · {xpLeft.toLocaleString()} XP 남음
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-3 h-12 flex-none rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
