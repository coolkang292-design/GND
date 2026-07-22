"use client";

import { useEffect, useRef } from "react";
import { MAX_DAILY_WORKOUT_XP_NOW } from "@/lib/domain/xp";

const TIME_BONUS: [string, string][] = [
  ["20분 이상", "+10"],
  ["40분 이상", "+20"],
  ["60분 이상", "+30"],
  ["90분 이상", "+40"],
];

const AVAILABLE: { label: string; xp: string; desc: string }[] = [
  { label: "운동 완료", xp: "100", desc: "하루 첫 운동을 완료하면 기본으로 받아요." },
  { label: "기록 완성", xp: "+10", desc: "완료한 세트의 횟수를 빠짐없이 적었을 때." },
  { label: "인증 사진", xp: "+10", desc: "운동 인증 사진을 올렸을 때." },
  { label: "타바타 완료", xp: "100", desc: "타바타는 세트 기록 없이 완료 자체로 인정돼요." },
];

const COMING_SOON: { label: string; xp: string; desc: string }[] = [
  { label: "주간 목표 달성", xp: "+100", desc: "주간 달성 판정 기능을 준비 중이에요. 아직 지급되지 않아요." },
  { label: "계획한 운동 완료", xp: "+20", desc: "계획과 실제 운동을 연결하는 기능을 준비 중이에요. 아직 지급되지 않아요." },
];

/**
 * XP 획득 방법 시트.
 *
 * 修正17: **이번 스프린트에 실제로 지급되는 것만 "지금 획득 가능"**으로 적는다.
 * 주간 목표·계획 완료는 지급 로직이 없으므로 "준비 중"으로만 안내한다.
 */
export function XpGuideSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

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
        aria-labelledby="xp-guide-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <h3
          id="xp-guide-title"
          className="mb-3 flex-none text-center text-base font-extrabold"
        >
          XP 획득 방법
        </h3>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <h4 className="text-[12.5px] font-extrabold text-accent">
            지금 획득 가능
          </h4>
          <ul className="mt-2 flex flex-col">
            {AVAILABLE.map((r) => (
              <li
                key={r.label}
                className="flex items-start gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold">{r.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{r.desc}</p>
                </div>
                <span className="flex-none text-[12.5px] font-extrabold text-accent">
                  {r.xp} XP
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-card-sm border border-line bg-surface-2 p-3">
            <p className="text-[11.5px] font-bold">시간 보너스</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {TIME_BONUS.map(([range, xp]) => (
                <li
                  key={range}
                  className="flex items-center justify-between text-[11.5px]"
                >
                  <span className="text-muted">{range}</span>
                  <span className="font-extrabold text-accent">{xp} XP</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10.5px] text-faint">
              시간 보너스는 최대 +40 XP까지예요. 하루에 받을 수 있는 최대는{" "}
              <b>{MAX_DAILY_WORKOUT_XP_NOW} XP</b>(기본 100 + 시간 40 + 기록 10 +
              사진 10)예요.
            </p>
          </div>

          <div className="mt-3 rounded-card-sm border border-line bg-surface-2 p-3">
            <p className="text-[11.5px] font-bold">하루 1회 제한</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              XP는 <b>한국시간 기준 하루 한 번</b>만 받아요. 같은 날 두 번째
              운동부터는 XP가 0이지만, <b>운동 기록·스트릭·피드에는 그대로
              반영</b>돼요.
            </p>
          </div>

          <h4 className="mt-4 text-[12.5px] font-extrabold text-muted">
            준비 중
          </h4>
          <p className="mt-0.5 text-[10.5px] text-faint">
            아래는 아직 지급되지 않아요. 기능이 준비되면 안내할게요.
          </p>
          <ul className="mt-2 flex flex-col">
            {COMING_SOON.map((r) => (
              <li
                key={r.label}
                className="flex items-start gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-muted">{r.label}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{r.desc}</p>
                </div>
                <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold text-faint">
                  준비 중
                </span>
              </li>
            ))}
          </ul>
        </div>

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
