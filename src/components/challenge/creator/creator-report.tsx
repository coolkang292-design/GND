"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { CREATOR_BASE_PATH } from "@/lib/domain/creator-return";
import { summarizeRates, type DailyProofRate } from "@/lib/domain/creator-report";
import type { CreatorSnapshot } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";
import { card, CreatorChallengeCard, KpiCard } from "./creator-ui";

type Range = "7d" | "all";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(key: string): { md: string; wd: string } {
  const [y, m, d] = key.split("-").map(Number);
  return { md: `${m}/${d}`, wd: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

// 차트 기하 — viewBox 단위. 폭 100%로 늘어난다.
const W = 340;
const H = 176;
const PAD = { l: 30, r: 14, t: 18, b: 34 };

/**
 * 일별 인증률 꺾은선 (dataviz: 한 계열 → 범례 없음, 제목이 이름).
 * 2px 선 · 8px 표식(점이 많으면 생략) · 선택 라벨(최고·마지막만) · 십자선+툴팁 · 표 보기.
 * 분모가 0인 날은 0%가 아니라 **끊어 그린다**(`rate: null`).
 */
function DailyRateChart({ days }: { days: readonly DailyProofRate[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (r: number) => PAD.t + (1 - r) * (H - PAD.t - PAD.b);
  const baseY = y(0);

  // null에서 끊기는 선분들
  const segments: number[][] = [];
  days.forEach((d, i) => {
    if (d.rate === null) return;
    const prev = segments.at(-1);
    if (prev && prev.at(-1) === i - 1) prev.push(i);
    else segments.push([i]);
  });
  const valid = days.map((d, i) => ({ d, i })).filter((p) => p.d.rate !== null);
  const lastIdx = valid.at(-1)?.i ?? null;
  const maxIdx = valid.reduce<number | null>((best, p) => (best === null || (p.d.rate ?? 0) > (days[best].rate ?? 0) ? p.i : best), null);
  const labelled = new Set([lastIdx, maxIdx].filter((v): v is number => v !== null));
  const showDots = n <= 14;
  const tickEvery = n <= 7 ? 1 : Math.ceil(n / 5);
  const step = n > 1 ? (W - PAD.l - PAD.r) / (n - 1) : W - PAD.l - PAD.r;
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="일별 인증률 꺾은선 그래프">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(g) + 3.5} textAnchor="end" className="fill-muted text-[9px]">{g * 100}</text>
          </g>
        ))}
        {segments.map((seg) => (
          <g key={seg[0]}>
            {seg.length > 1 && (
              <path
                d={`M${x(seg[0])},${baseY} ${seg.map((i) => `L${x(i)},${y(days[i].rate as number)}`).join(" ")} L${x(seg.at(-1) as number)},${baseY}Z`}
                className="fill-accent/10"
              />
            )}
            <path
              d={seg.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(days[i].rate as number)}`).join(" ")}
              fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />
          </g>
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={baseY} className="stroke-line-strong" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {valid.map(({ d, i }) =>
          showDots || labelled.has(i) || hover === i ? (
            <circle key={d.day} cx={x(i)} cy={y(d.rate as number)} r={hover === i ? 5 : 4}
              className="fill-accent stroke-surface" strokeWidth={2} />
          ) : null,
        )}
        {/* 첫·마지막 점 라벨은 안쪽으로 붙인다 — 첫날 "67%"가 y축 "75"를 덮었다(2026-10-25 미리보기) */}
        {[...labelled].map((i) => (
          <text
            key={`l-${i}`} x={x(i)} y={y(days[i].rate as number) - 8}
            textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}
            className="fill-text text-[10px] font-bold"
          >
            {pct(days[i].rate)}
          </text>
        ))}
        {/* 마지막 날은 늘 표시하고, 그 바로 앞 눈금은 겹치면 뺀다(2026-10-25 화면 확인 "10/3 10/4") */}
        {days.map((d, i) =>
          (i % tickEvery === 0 && n - 1 - i >= Math.ceil(tickEvery / 2)) || i === n - 1 ? (
            <text key={`x-${d.day}`} x={x(i)} y={H - PAD.b + 14} textAnchor="middle" className="fill-muted text-[9px]">
              {dayLabel(d.day).md}
              {n <= 7 && <tspan x={x(i)} dy={11}>({dayLabel(d.day).wd})</tspan>}
            </text>
          ) : null,
        )}
        {/* 히트 영역 — 표식보다 넓게, 날짜마다 한 칸 */}
        {days.map((d, i) => (
          <rect
            key={`hit-${d.day}`} x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 12)} height={baseY - PAD.t}
            fill="transparent" tabIndex={0} aria-label={`${dayLabel(d.day).md} ${pct(d.rate)}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-card-sm border border-line bg-surface-3 px-2.5 py-1.5 text-[11.5px] shadow-card"
          style={{ left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%` }}
        >
          <p className="font-bold">{dayLabel(h.day).md} ({dayLabel(h.day).wd})</p>
          <p className="text-muted">
            {h.rate === null ? "합류한 회원 없음" : `인증 ${h.proofs}/${h.members}명 · ${pct(h.rate)}`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 성과 리포트 축소판 (시안 1, 2026-10-24 §9-②).
 * ⚠️ 시안의 링크 클릭 · 전환 퍼널 · 유입 채널 · 재참여 의향 · AI 인사이트는 **칸도 만들지 않는다.**
 *    지금 GND는 그 값을 기록하지 않는다(계획서 §3·§6). 예시 수치를 그리면 화면이 거짓말을 한다.
 */
export function CreatorReport({
  challenge, snapshot, daily,
}: {
  challenge: Pick<Challenge, "id" | "name" | "status" | "start_date" | "end_date" | "recruit_image_url" | "recruit_note">;
  snapshot: CreatorSnapshot;
  daily: readonly DailyProofRate[];
}) {
  const [range, setRange] = useState<Range>("7d");
  const [asTable, setAsTable] = useState(false);
  const days = useMemo(() => (range === "7d" ? daily.slice(-7) : daily), [daily, range]);
  const summary = summarizeRates(days);
  const firstRate = snapshot.memberCount ? snapshot.firstProofCount / snapshot.memberCount : null;

  return (
    <div className="flex flex-col gap-3.5 pb-6 text-text">
      <header className="flex items-start gap-2">
        <Link
          href={`${CREATOR_BASE_PATH}/${encodeURIComponent(challenge.id)}`}
          aria-label="운영 홈"
          className="-ml-1 grid h-10 w-8 shrink-0 place-items-center text-muted"
        >
          <Icon name="back" size={22} />
        </Link>
        <div>
          <h1 className="text-[24px] font-black leading-tight">
            <span className="text-accent">성과</span> 리포트
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted">챌린지의 인증 흐름을 한눈에 확인해 보세요.</p>
        </div>
      </header>

      <CreatorChallengeCard challenge={challenge} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="기간">
          {([["7d", "최근 7일"], ["all", "전체 기간"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={range === id}
              onClick={() => setRange(id)}
              className={`min-h-9 rounded-full px-3.5 text-[12.5px] font-bold ${range === id ? "bg-accent text-accent-ink" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {days.length > 0 && (
          <span className="text-[11.5px] text-muted">
            {dayLabel(days[0].day).md} ~ {dayLabel(days.at(-1)!.day).md} 기준
          </span>
        )}
      </div>

      <section className="grid grid-cols-3 gap-2" aria-label="성과 요약">
        <KpiCard icon="users" label="챌린지 참여" value={snapshot.memberCount} unit="명" />
        <KpiCard icon="flame" label="첫 인증" value={snapshot.firstProofCount} unit="명" />
        <KpiCard icon="ranking" label="평균 인증률" value={summary.rate === null ? null : Math.round(summary.rate * 100)} unit="%" />
      </section>
      <p className="-mt-2 text-[10.5px] text-muted">
        첫 인증률 {pct(firstRate)} · 평균 인증률은 선택한 기간의 (인증 수 ÷ 회원·일 수)예요.
      </p>

      <section className={`${card} p-3.5`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
            <Icon name="ranking" size={19} className="text-accent" /> 일별 인증률
          </h2>
          {days.length > 0 && (
            <button type="button" onClick={() => setAsTable((v) => !v)} className="min-h-9 text-[12px] font-bold text-muted">
              {asTable ? "그래프로 보기" : "표로 보기"}
            </button>
          )}
        </div>
        {days.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted">챌린지가 시작되면 날마다 인증률이 쌓여요.</p>
        ) : asTable ? (
          <table className="mt-1 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-bold">날짜</th>
                <th className="py-1 text-right font-bold">인증 / 회원</th>
                <th className="py-1 text-right font-bold">인증률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5">{dayLabel(d.day).md} ({dayLabel(d.day).wd})</td>
                  <td className="py-1.5 text-right">{d.proofs} / {d.members}</td>
                  <td className="py-1.5 text-right font-bold">{pct(d.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <DailyRateChart days={days} />
        )}
        <p className="mt-1 text-[11px] text-muted">
          분모는 그날까지 합류한 회원이에요. 쉬는 날은 반영하지 않아요. 단위: %
        </p>
      </section>

      <p className="text-center text-[11px] text-muted">
        링크 클릭 · 유입 경로 · 전환율은 측정을 시작한 뒤에 보여 드려요.
      </p>
    </div>
  );
}
