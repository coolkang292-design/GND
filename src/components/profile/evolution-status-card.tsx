"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/profile/progress-bar";
import { getStageGroups } from "@/lib/domain/progression";
import {
  evolutionAvatarSrc,
  type CharacterVariant,
} from "@/lib/domain/character-variant";
import type {
  EvolutionCondition,
  EvolutionStatus,
} from "@/lib/domain/evolution";
import { getMyEvolutionStatus } from "@/lib/evolution";
import { GROWTH_V2 } from "@/lib/flags";

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type Row = {
  label: string;
  value: string;
  /** 초등학생도 알 수 있는 한 줄 설명 */
  hint: string;
  progress: number;
  met: boolean;
};

/** 조건 하나를 한 줄 표시용으로 바꾼다 — 어려운 말(XP 자격·성장률)을 쓰지 않는다 */
export function conditionRow(c: EvolutionCondition): Row {
  switch (c.key) {
    case "xp":
      return {
        label: "경험치 레벨",
        value: `Lv.${c.current} / Lv.${c.required}`,
        hint: "운동하면 경험치가 쌓이고, 쌓이면 레벨이 올라가요.",
        progress: c.progress,
        met: c.met,
      };
    case "days":
      return {
        label: "운동한 날",
        value: `${c.current} / ${c.required}일`,
        hint: c.altPath
          ? "아직 내가 세졌는지 잴 수 없어서, 운동한 날을 1.5배로 채우는 길이에요."
          : "하루에 몇 번을 해도 1일로 세요.",
        progress: c.progress,
        met: c.met,
      };
    case "weeks":
      return {
        label: "운동을 시작한 지",
        value: `${c.current} / ${c.required}주`,
        hint: "오래오래 꾸준히 해야 해요. 시간이 지나면 저절로 채워져요.",
        progress: c.progress,
        met: c.met,
      };
    case "growth":
      if (c.baselineOnly) {
        return {
          label: "예전의 나 기록 만들기",
          value: c.met ? "완료" : "아직 재는 중",
          hint: "같은 운동을 3번 기록하면 '예전의 나'가 만들어져요. 앞으로 이 기록과 비교해요.",
          progress: c.progress,
          met: c.met,
        };
      }
      return c.preparing
        ? {
            label: "예전의 나보다 세졌나",
            value: "아직 재는 중",
            hint: "같은 운동을 여러 번 기록하면 내가 얼마나 세졌는지 알 수 있어요.",
            progress: 0,
            met: false,
          }
        : {
            label: "예전의 나보다 세졌나",
            value: `${fmtPct(c.current ?? 0)} / ${fmtPct(c.required)}`,
            hint: "처음 했을 때보다 힘이 얼마나 늘었는지 봐요. 친구랑 비교하지 않아요.",
            progress: c.progress,
            met: c.met,
          };
    case "recent":
      return {
        label: "요즘도 열심히 하나",
        value: `최근 ${c.windowDays}일 중 ${c.current} / ${c.required}일`,
        hint: "쉬지 않고 요즘도 운동하고 있는지 봐요.",
        progress: c.progress,
        met: c.met,
      };
  }
}

export type RemainingItem = {
  /** 한 문장 — 무엇을 하면 되는지 */
  text: string;
  /** 구체적인 운동 지침 (종목·kg·횟수) */
  tips?: string[];
  /** 지침 위의 짧은 설명 */
  help?: string;
};

/** 부족한 조건만 "오늘 할 일" 문장으로. 완료된 건 뺀다. */
export function remainingItems(status: EvolutionStatus): RemainingItem[] {
  const items: RemainingItem[] = [];
  for (const c of status.conditions) {
    if (c.met) continue;
    const gap = c.required - (c.current ?? 0);
    switch (c.key) {
      case "xp":
        items.push({
          text: `레벨을 ${gap}개 더 올려요 (Lv.${c.required}까지)`,
          help: "운동을 마칠 때마다 경험치가 쌓여요.",
        });
        break;
      case "days":
        items.push({
          text: `운동을 ${gap}일 더 해요`,
          help: "하루에 여러 번 해도 1일이에요. 쉬는 날은 세지 않아요.",
        });
        break;
      case "weeks":
        items.push({
          text: `${gap}주만 더 꾸준히 해요`,
          help: "이건 시간이 필요해요. 운동을 이어가면 저절로 채워져요.",
        });
        break;
      case "growth":
        if (c.baselineOnly) {
          items.push({
            text: "'예전의 나' 기록을 만들어요",
            help: "같은 운동을 3번 기록하면 시작점이 생겨요.",
            tips: c.tips,
          });
        } else if (c.preparing) {
          items.push({
            text: "내가 얼마나 세졌는지 아직 못 쟀어요",
            help: "같은 운동을 여러 번 기록하면 재 줄 수 있어요.",
            tips: c.tips,
          });
        } else {
          items.push({
            text: `예전의 나보다 평균 ${c.required}% 더 세져야 해요 (지금 ${fmtPct(c.current ?? 0)})`,
            help: "아래 운동 중에서 골라 해 보세요. 최근 3번 중 2번만 해내면 점수가 올라가요.",
            tips: c.tips,
          });
        }
        break;
      case "recent":
        items.push({
          text: `요즘도 쉬지 말아요 — 최근 ${c.windowDays}일 안에 ${gap}일 더 운동해요`,
        });
        break;
    }
  }
  return items;
}

function pctOf(c: EvolutionCondition): number {
  return Math.round(Math.max(0, Math.min(1, c.progress)) * 100);
}

/** 다음 진화 목표 칩 — 조건의 "기준값"만 짧게 */
export function targetChips(status: EvolutionStatus): string[] {
  const chips: string[] = [];
  for (const c of status.conditions) {
    if (c.key === "xp") chips.push(`Lv.${c.required}`);
    else if (c.key === "days") chips.push(`${c.required}일`);
    else if (c.key === "weeks") chips.push(`${c.required}주`);
    else if (c.key === "growth" && !c.baselineOnly) chips.push(`+${c.required}%`);
    else if (c.key === "recent") chips.push(`최근 ${c.windowDays}일 중 ${c.required}일`);
  }
  return chips;
}

function FaceThumb({
  stage,
  variant,
  state,
}: {
  stage: number;
  variant: CharacterVariant;
  /** 지나온 단계 · 지금 단계 · 아직 잠긴 단계 */
  state: "done" | "current" | "locked";
}) {
  const src = evolutionAvatarSrc(stage, variant);
  return (
    <span
      data-stage={stage}
      data-state={state}
      className={`relative grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full border-2 bg-surface-2 ${
        state === "current" ? "border-accent" : "border-line"
      }`}
    >
      {state === "locked" || !src ? (
        <Icon name="lock" size={14} className="text-faint" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

/** 카드 제목줄 — 아이콘 · 제목 · 작은 설명 · 상태 알약 */
function CardHead({
  icon,
  title,
  note,
  met,
}: {
  icon: "spark" | "calendar" | "ranking";
  title: string;
  note: string;
  met: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-accent-weak">
        <Icon name={icon} size={18} className="text-accent" />
      </span>
      <p className="min-w-0 flex-1 text-[14px] font-extrabold">
        {title}
        <span className="ml-1 text-[11px] font-bold text-muted">{note}</span>
      </p>
      <span
        className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
          met ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
        }`}
      >
        {met ? "완료" : "진행 중"}
      </span>
    </div>
  );
}

function MeterRow({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: EvolutionCondition;
}) {
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-muted">{label}</span>
        <span className="text-[13px] font-extrabold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ProgressBar progress={c.progress} state={c.met ? "earned" : "active"} />
        </div>
        <span className="w-9 flex-none text-right text-[11px] font-extrabold text-muted tabular-nums">
          {pctOf(c)}%
        </span>
      </div>
    </div>
  );
}

type GlanceRow = { c: EvolutionCondition; label: string; value: string; need: string };

/**
 * 표시 전용 카드 (데이터는 부모가 준다) — 서버 렌더·테스트가 쉽다.
 *
 * 구성 (시안 2026-11-06): 현재 진화 단계 띠 → 다음 진화 목표(잠긴 실루엣 + 조건 칩) →
 * 조건 카드 3개(경험치 레벨 · 운동 습관 · 내 성장) → 한눈에 보기 → [이제 이것만 하면 돼요
 * + 오늘 운동 시작하기]. 말은 초등학생도 알 수 있게 쓴다.
 */
export function EvolutionStatusView({
  status: incomingStatus,
  variant = "male",
  separateGrowth = GROWTH_V2,
}: {
  status: EvolutionStatus;
  /** 단계 얼굴 이미지의 남·여 — 없으면 남성 */
  variant?: CharacterVariant;
  /** 새 성장 카드는 별도 목표다. 서버가 XP만 적용하는 동안 옛 3중 조건을 실제 규칙처럼 안내하지 않는다. */
  separateGrowth?: boolean;
}) {
  const visibleConditions = separateGrowth ? incomingStatus.conditions.filter(c => c.key === "xp") : incomingStatus.conditions;
  const status = separateGrowth
    ? { ...incomingStatus, conditions: visibleConditions, allMet: visibleConditions.every(c => c.met) }
    : incomingStatus;
  const groups = getStageGroups();

  if (status.nextStage === null) {
    return (
      <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">진화 현황</h2>
        <p className="mt-2 text-sm font-bold text-accent">마지막 모습까지 진화했어요!</p>
        <p className="mt-1 text-[11.5px] text-muted">
          한번 진화한 모습은 운동을 쉬어도 그대로예요.
        </p>
      </section>
    );
  }

  const next = groups[status.nextStage - 1];
  const items = remainingItems(status);
  const by = (k: EvolutionCondition["key"]) => status.conditions.find((c) => c.key === k);
  const xp = by("xp");
  const days = by("days");
  const weeks = by("weeks");
  const growth = by("growth");
  const recent = by("recent");
  const habitMet = [days, weeks, recent].every((c) => !c || c.met);
  const nextFace = evolutionAvatarSrc(status.nextStage, variant);
  const cardCount = (xp ? 1 : 0) + (days || weeks ? 1 : 0) + (growth ? 1 : 0);

  const glance: GlanceRow[] = [];
  if (xp) glance.push({ c: xp, label: "경험치 레벨", value: `Lv.${xp.current}`, need: `Lv.${xp.required} 필요` });
  if (weeks) glance.push({ c: weeks, label: "운동 기간", value: `${weeks.current}주`, need: `${weeks.required}주 필요` });
  if (days) glance.push({ c: days, label: "운동한 날", value: `${days.current}일`, need: `${days.required}일 필요` });
  if (growth && !growth.baselineOnly) {
    glance.push({
      c: growth,
      label: "내 성장",
      value: growth.preparing ? "재는 중" : fmtPct(growth.current ?? 0),
      need: `${fmtPct(growth.required)} 필요`,
    });
  }
  if (recent) {
    glance.push({
      c: recent,
      label: `요즘 활동 (${recent.windowDays}일)`,
      value: `${recent.current}일`,
      need: `${recent.required}일 필요`,
    });
  }

  return (
    <>
      <section
        aria-label="진화 현황"
        className="rounded-card border border-line-strong bg-surface p-4 shadow-card"
      >
        {/* 현재 진화 단계 띠 — 지나온 얼굴 · 지금(라임 테두리) · 잠긴 단계 */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold">
            현재 진화 단계 <span className="text-accent">{status.currentStage}단계</span>
          </h2>
          <span className="text-[11px] font-bold text-muted">{status.currentStage} / 7</span>
        </div>
        <div className="mt-2 flex items-center justify-between" data-testid="stage-strip">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <FaceThumb
              key={n}
              stage={n}
              variant={variant}
              state={n < status.currentStage ? "done" : n === status.currentStage ? "current" : "locked"}
            />
          ))}
        </div>

        {/* 다음 진화 목표 — 잠긴 실루엣 + 조건 칩 */}
        <div
          data-testid="next-target"
          className="mt-3.5 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-weak/30 p-3"
        >
          <span className="relative grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl bg-surface-2">
            {nextFace && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={nextFace} alt="" className="h-full w-full object-cover opacity-40 brightness-50 grayscale" />
            )}
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <Icon name="lock" size={18} className="text-text" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-muted">다음 진화 목표</p>
            <p className="text-[16px] font-black leading-tight">
              {status.nextStage}단계 {next.stageName}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {targetChips(status).map((chip) => (
                <li
                  key={chip}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-extrabold"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h3 className="mt-4 text-[14px] font-extrabold">다음엔 이렇게 진화해요</h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {status.nextStage <= 3
            ? "시동러까지는 경험치만으로 진화해요."
            : separateGrowth ? "현재 진화는 경험치 기준이에요. 아래에서 성장 목표도 확인해 보세요."
            : `아래 ${cardCount}가지를 모두 채우면 진화할 수 있어요.`}
        </p>

        {/* ① 경험치 레벨 */}
        {xp && (
          <div className="mt-3 rounded-2xl border border-line bg-surface-2/50 p-3">
            <CardHead icon="spark" title="경험치 레벨" note="진화 자격" met={xp.met} />
            <MeterRow label="지금 레벨" value={`Lv.${xp.current} / Lv.${xp.required}`} c={xp} />
            <p className="mt-2 text-[11px] leading-snug text-muted">
              운동하면 경험치가 쌓이고, 쌓이면 레벨이 올라가요.
            </p>
          </div>
        )}

        {/* ② 운동 습관 — 운동한 날 · 시작한 지 · (6단계부터) 요즘 활동 */}
        {(days || weeks) && (
          <div className="mt-2.5 rounded-2xl border border-line bg-surface-2/50 p-3">
            <CardHead icon="calendar" title="운동 습관" note="꾸준함" met={habitMet} />
            {days && (
              <MeterRow label="운동한 날" value={`${days.current} / ${days.required}일`} c={days} />
            )}
            {weeks && (
              <MeterRow label="운동을 시작한 지" value={`${weeks.current} / ${weeks.required}주`} c={weeks} />
            )}
            {recent && (
              <MeterRow
                label={`요즘 활동 (최근 ${recent.windowDays}일)`}
                value={`${recent.current} / ${recent.required}일`}
                c={recent}
              />
            )}
            <p className="mt-2 text-[11px] leading-snug text-muted">
              {days?.altPath
                ? "아직 내가 세졌는지 잴 수 없어서, 운동한 날을 1.5배로 채우는 길이에요. "
                : ""}
              하루에 여러 번 해도 1일이에요. 시간이 지나면 저절로 채워져요.
            </p>
          </div>
        )}

        {/* ③ 내 성장 */}
        {growth && (
          <div className="mt-2.5 rounded-2xl border border-line bg-surface-2/50 p-3">
            <CardHead icon="ranking" title="내 성장" note="예전의 나보다" met={growth.met} />
            {growth.baselineOnly ? (
              <MeterRow label="예전의 나 기록" value={growth.met ? "완료" : "아직 재는 중"} c={growth} />
            ) : growth.preparing ? (
              <MeterRow label="얼마나 세졌나" value="아직 재는 중" c={growth} />
            ) : (
              <MeterRow
                label="얼마나 세졌나"
                value={`${fmtPct(growth.current ?? 0)} / ${fmtPct(growth.required)}`}
                c={growth}
              />
            )}
            <p className="mt-2 text-[11px] leading-snug text-muted">
              처음 했을 때보다 힘이 얼마나 늘었는지 봐요. 친구랑 비교하지 않아요.
            </p>
          </div>
        )}

        {/* 한눈에 보기 */}
        <div className="mt-3 rounded-2xl border border-line bg-surface-2/50 p-3" data-testid="glance">
          <p className="text-[13px] font-extrabold">한눈에 보기</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {glance.map((r) => (
              <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
                <span
                  aria-hidden
                  className={`grid h-4 w-4 flex-none place-items-center rounded-full ${
                    r.c.met ? "bg-accent text-accent-ink" : "border border-line-strong text-transparent"
                  }`}
                >
                  <Icon name="check" size={11} strokeWidth={3} />
                </span>
                <span className="flex-1 font-bold">{r.label}</span>
                <span className="font-extrabold tabular-nums">{r.value}</span>
                <span className="text-[11px] text-muted">({r.need})</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-label="다음 진화까지 남은 조건"
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex items-center gap-1.5">
          <Icon name="target" size={16} className="text-accent" />
          <h2 className="text-[14px] font-extrabold">이제 이것만 하면 돼요</h2>
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-accent">모두 채웠어요! 곧 진화해요.</p>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-3">
            {items.map((it) => (
              <li key={it.text} className="flex gap-2 text-[13px]">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="font-bold">{it.text}</p>
                  {it.help && (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{it.help}</p>
                  )}
                  {it.tips && it.tips.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-1 rounded-card-sm bg-surface-2 p-2.5">
                      {it.tips.map((t) => (
                        <li key={t} className="text-[12.5px] font-bold leading-snug">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-snug text-muted">
          {status.nextStage <= 3 || separateGrowth
            ? "경험치가 쌓이면 다음 모습으로 진화해요. "
            : "경험치는 입장권이에요. 꾸준히 운동하고, 예전의 내가 더 세지면 진화해요! "}
          한번 진화한 모습은 운동을 쉬어도 그대로예요.
        </p>
        <Link
          href="/record"
          data-testid="start-today"
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-black text-accent-ink"
        >
          <Icon name="dumbbell" size={20} />
          오늘 운동 시작하기
        </Link>
      </section>
    </>
  );
}

/** 프로필 화면용 — 본인 운동 기록을 읽어 다음 진화 현황을 그린다 (읽기 전용) */
export function EvolutionStatusCard({
  userId,
  totalXp,
  currentStage,
  variant = "male",
}: {
  userId: string;
  totalXp: number;
  currentStage: number;
  /** 단계 얼굴 이미지의 남·여 */
  variant?: CharacterVariant;
}) {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyEvolutionStatus({ userId, totalXp, currentStage })
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, totalXp, currentStage]);

  if (failed) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">진화 현황</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          진화 현황을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. 운동 기록은 그대로
          안전해요.
        </p>
      </section>
    );
  }
  if (!status) {
    return (
      <section
        aria-busy="true"
        className="h-48 animate-pulse rounded-card border border-line bg-surface shadow-card"
      />
    );
  }
  return <EvolutionStatusView status={status} variant={variant} />;
}
