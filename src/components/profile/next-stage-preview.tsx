"use client";

import Image from "next/image";
import { UiIcon } from "@/components/ui-icon";
import { getStageGroups } from "@/lib/domain/progression";

/** 다음 단계 미리보기 — 실루엣 캐릭터 + 해금 조건. 최고 단계면 렌더하지 않는다. */
export function NextStagePreview({
  currentStage,
  totalXp,
}: {
  currentStage: number;
  totalXp: number;
}) {
  const next = getStageGroups()[currentStage]; // 0-index → 다음 단계
  if (!next) return null;

  const xpLeft = Math.max(0, next.requiredTotalXp - totalXp);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">다음 단계 미리보기</h2>
      <div className="mt-3 flex items-center gap-3.5">
        <div className="relative flex-none overflow-hidden rounded-card-sm">
          <Image
            src={next.characterPath}
            alt={`${next.stageName} 캐릭터 실루엣`}
            width={72}
            height={96}
            sizes="72px"
            className="object-cover opacity-40 grayscale"
          />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            {/* 옛 표기는 `🔒`였다 (2026-08-07 2차 시안으로 교체) */}
            <UiIcon name="lock" size={22} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">{next.stageName}</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
            {next.description}
          </p>
          <p className="mt-1.5 text-[11.5px] font-bold text-accent">
            Lv.{next.startLevel} 달성 시 해금
            {xpLeft > 0 && ` · ${xpLeft.toLocaleString()} XP 남음`}
          </p>
        </div>
      </div>
    </section>
  );
}
