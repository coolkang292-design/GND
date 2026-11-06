"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { ProgressBar } from "@/components/profile/progress-bar";
import { getStageGroups } from "@/lib/domain/progression";
import type {
  EvolutionCondition,
  EvolutionStatus,
} from "@/lib/domain/evolution";
import { getMyEvolutionStatus } from "@/lib/evolution";

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

/** 표시 전용 카드 (데이터는 부모가 준다) — 서버 렌더·테스트가 쉽다 */
export function EvolutionStatusView({ status }: { status: EvolutionStatus }) {
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

  return (
    <>
      <section
        aria-label="진화 현황"
        className="rounded-card border border-line-strong bg-surface p-4 shadow-card"
      >
        <h2 className="text-[15px] font-extrabold">다음엔 이렇게 진화해요</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          다음 모습:{" "}
          <span className="font-extrabold text-accent">
            {status.nextStage}단계 {next.stageName}
          </span>
          . 아래 {status.conditions.length}가지를 모두 채우면 돼요.
        </p>

        <ul className="mt-3 flex flex-col gap-3.5">
          {status.conditions.map((c) => {
            const row = conditionRow(c);
            return (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
                    {row.label}
                    {row.met && (
                      <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-extrabold text-accent">
                        통과!
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-right text-[12.5px] font-bold ${
                      row.met ? "text-accent" : "text-text"
                    }`}
                  >
                    {row.value}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar progress={row.progress} state={row.met ? "earned" : "active"} />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted">{row.hint}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-label="다음 진화까지 남은 조건"
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex items-center gap-1.5">
          <UiIcon name="goal" size={16} />
          <h2 className="text-[14px] font-extrabold">이제 이것만 하면 돼요</h2>
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-accent">
            모두 채웠어요! 곧 진화해요.
          </p>
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
          경험치는 입장권이에요. 꾸준히 운동하고, 예전의 내가 더 세지면 진화해요!
          한번 진화한 모습은 운동을 쉬어도 그대로예요.
        </p>
      </section>
    </>
  );
}

/** 프로필 화면용 — 본인 운동 기록을 읽어 다음 진화 현황을 그린다 (읽기 전용) */
export function EvolutionStatusCard({
  userId,
  totalXp,
  currentStage,
}: {
  userId: string;
  totalXp: number;
  currentStage: number;
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
  return <EvolutionStatusView status={status} />;
}
