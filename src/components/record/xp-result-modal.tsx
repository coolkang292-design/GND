"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStageGroups, STAGE_DESCRIPTIONS } from "@/lib/domain/progression";
import type { XpEvent } from "@/lib/domain/xp-events";

const FADE_MS = 300;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * 운동 완료 결과 모달 — 이벤트를 **하나씩** 넘겨 보여준다(修正16).
 * 상단 "모두 확인"으로 언제든 건너뛸 수 있고, 감소 모션 설정이면 페이드 없이
 * 즉시 전환한다.
 */
export function XpResultModal({
  events,
  onClose,
}: {
  events: XpEvent[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isLast = index >= events.length - 1;

  const advance = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    if (prefersReducedMotion()) {
      setIndex((i) => i + 1);
      return;
    }
    setVisible(false);
    timerRef.current = setTimeout(() => {
      setIndex((i) => i + 1);
      setVisible(true);
    }, FADE_MS * 0.6);
  }, [isLast, onClose]);

  useEffect(() => {
    buttonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onClose]);

  const event = events[index];
  if (!event) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="xp-result-title"
        className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-faint">
            {index + 1} / {events.length}
          </p>
          {events.length > 1 && (
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-bold text-muted"
            >
              모두 확인
            </button>
          )}
        </div>

        <div
          className="transition-opacity motion-reduce:transition-none"
          style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        >
          <EventBody event={event} />
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={advance}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          {isLast ? "확인" : "다음"}
        </button>
      </div>
    </>
  );
}

function EventBody({ event }: { event: XpEvent }) {
  if (event.type === "xp") {
    return (
      <div className="mt-2 text-center">
        <div className="text-4xl">💪</div>
        <h2 id="xp-result-title" className="mt-2 text-lg font-extrabold">
          <span className="text-accent">+{event.amount} XP</span> 획득!
        </h2>
        <ul className="mt-3.5 flex flex-col rounded-card-sm border border-line bg-surface-2 px-3">
          {event.breakdown.map((line) => (
            <li
              key={line.label}
              className="flex items-center justify-between border-t border-line py-2 text-[12.5px] first:border-t-0"
            >
              <span className="text-muted">{line.label}</span>
              <span className="font-extrabold text-accent">+{line.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (event.type === "level_up") {
    return (
      <div className="mt-2 text-center">
        <div className="text-4xl">⬆️</div>
        <h2 id="xp-result-title" className="mt-2 text-lg font-extrabold">
          레벨 업!
        </h2>
        <p className="mt-2 text-2xl font-extrabold">
          <span className="text-muted">Lv.{event.from}</span>
          <span className="mx-2 text-muted">→</span>
          <span className="text-accent">Lv.{event.to}</span>
        </p>
      </div>
    );
  }

  if (event.type === "stage_up") {
    const groups = getStageGroups();
    const from = groups[event.from - 1];
    const to = groups[event.to - 1];
    return (
      <div className="mt-2 text-center">
        <h2 id="xp-result-title" className="text-lg font-extrabold">
          단계 진화! 🎉
        </h2>
        <div className="mt-3 flex items-center justify-center gap-3">
          <Image
            src={from.characterPath}
            alt={`${from.stageName} 캐릭터`}
            width={72}
            height={96}
            sizes="72px"
            className="rounded-card-sm object-cover opacity-40 grayscale"
          />
          <span aria-hidden className="text-xl text-accent">
            →
          </span>
          <Image
            src={to.characterPath}
            alt={`${to.stageName} 캐릭터`}
            width={96}
            height={128}
            sizes="96px"
            className="rounded-card-sm object-cover"
          />
        </div>
        <p className="mt-3 text-base font-extrabold text-accent">
          {from.stageName} → {to.stageName}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          {STAGE_DESCRIPTIONS[to.stageIndex].desc}
        </p>
      </div>
    );
  }

  if (event.type === "point") {
    return (
      <div className="mt-2 text-center">
        <p className="text-center text-5xl">🅿️</p>
        <p
          id="xp-result-title"
          className="mt-3 text-center text-2xl font-extrabold text-accent"
        >
          +{event.amount.toLocaleString()} P
        </p>
        <p className="mt-1 text-center text-[12.5px] text-muted">
          불꽃 {event.streakDays}일 · 배수 ×{event.multiplier}
        </p>
      </div>
    );
  }

  if (event.type === "badge") {
    return (
      <div className="mt-2">
        <p id="xp-result-title" className="text-center text-lg font-extrabold">
          🏅 새 배지!
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {event.badges.map((b) => (
            <li key={b.badgeKey} className="flex items-center gap-2.5">
              <Image
                src={`/badges/${b.badgeKey}.png`}
                alt=""
                width={40}
                height={40}
                sizes="40px"
              />
              <span className="flex-1 text-left text-sm font-bold">{b.name}</span>
              <span className="text-xs font-extrabold text-accent">
                +{b.points} P
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 text-center">
      <div className="text-4xl">🎁</div>
      <h2 id="xp-result-title" className="mt-2 text-lg font-extrabold">
        보상 해금
      </h2>
      <ul className="mt-3 flex flex-col rounded-card-sm border border-line bg-surface-2 px-3">
        {event.rewards.map((r) => (
          <li
            key={r.key}
            className="border-t border-line py-2 text-[12.5px] font-bold first:border-t-0"
          >
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
