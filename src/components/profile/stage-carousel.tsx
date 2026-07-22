"use client";

import Image from "next/image";
import { getStageGroups } from "@/lib/domain/progression";

/**
 * 7단계 가로 캐러셀 — 완료 단계는 그대로, 현재 단계는 강조 테두리,
 * 잠긴 단계는 저채도 실루엣 + 자물쇠로 남겨 진화 욕구를 자극한다(설계 §11.2).
 */
export function StageCarousel({
  currentStage,
  onHelpClick,
}: {
  currentStage: number;
  onHelpClick: () => void;
}) {
  const groups = getStageGroups();

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-extrabold">나의 캐릭터 성장</h2>
        <button
          type="button"
          onClick={onHelpClick}
          aria-label="7단계 진화 안내 보기"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line text-[11px] font-extrabold text-muted"
        >
          ?
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        레벨 5개마다 한 단계씩 진화해요. 총 7단계.
      </p>

      <ul className="-mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1">
        {groups.map((g) => {
          const locked = g.stageIndex > currentStage;
          const current = g.stageIndex === currentStage;
          return (
            <li key={g.stageKey} className="flex-none">
              <button
                type="button"
                onClick={onHelpClick}
                aria-current={current ? "step" : undefined}
                aria-label={`${g.stageIndex}단계 ${g.stageName} · Lv.${g.startLevel}~${g.endLevel}${
                  locked ? " · 잠김" : current ? " · 현재 단계" : " · 달성"
                } · 안내 보기`}
                className={`block w-[76px] rounded-card-sm border p-1.5 text-center transition-colors ${
                  current
                    ? "border-accent bg-accent-weak"
                    : "border-line bg-surface-2"
                }`}
              >
                <div className="relative overflow-hidden rounded-[9px]">
                  <Image
                    src={g.characterPath}
                    alt=""
                    width={64}
                    height={85}
                    sizes="64px"
                    className={`h-[85px] w-full object-cover ${
                      locked ? "opacity-40 grayscale" : ""
                    }`}
                  />
                  {locked && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-lg"
                    >
                      🔒
                    </span>
                  )}
                </div>
                <p
                  className={`mt-1 truncate text-[11px] font-bold ${
                    current ? "text-accent" : locked ? "text-faint" : "text-text"
                  }`}
                >
                  {g.stageName}
                </p>
                <p className="text-[10px] text-faint">
                  Lv.{g.startLevel}~{g.endLevel}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
