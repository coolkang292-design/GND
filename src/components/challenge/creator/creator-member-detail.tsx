"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CheerActions } from "@/components/feed/cheer-actions";
import { Icon, type IconName } from "@/components/ui/icon";
import type { CreatorMemberDetailView } from "@/lib/creator-data";
import { formatMonthDay } from "@/lib/domain/challenge-time";
import { monthCells } from "@/lib/domain/creator-member-detail";
import { CREATOR_BASE_PATH, isDemoChallenge } from "@/lib/domain/creator-return";
import { ATTENTION_INACTIVE_DAYS } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";
import { card, SectionTitle, StatusBadge } from "./creator-ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 챌린지 기간에 걸친 달 목록 — 달력은 이 밖으로 넘어가지 않는다. */
function periodMonths(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function lastProofText(daysSince: number | null): string {
  if (daysSince === null) return "–";
  return daysSince === 0 ? "오늘" : `${daysSince}일 전`;
}

/**
 * 참여자 상세 (시안 2, 2026-10-24).
 * ⚠️ 시안의 "목표 수정"은 없다 — 방장이 회원 목표를 바꾸는 UI는 이슈 #25 범위 밖.
 * ⚠️ "리마인드 보내기"도 없다 — 찌르기는 크루 전용이라 공개 모집 회원에게 실패한다(P2).
 * ⚠️ 응원은 회원이 **운동 중일 때만** — send_cheer가 완료 세션을 not_active로 막는다.
 */
export function CreatorMemberDetailScreen({
  challenge, detail,
}: {
  challenge: Pick<Challenge, "id" | "status" | "start_date" | "end_date">;
  detail: CreatorMemberDetailView;
}) {
  const { member } = detail;
  const months = periodMonths(challenge.start_date, challenge.end_date);
  const refMonth = (detail.todayKey < challenge.end_date ? detail.todayKey : challenge.end_date).slice(0, 7);
  const [monthIdx, setMonthIdx] = useState(() => Math.max(0, months.indexOf(refMonth)));
  const month = months[monthIdx] ?? months[0];
  const proofDays = new Set(detail.dayKeys);
  const [, mm] = month.split("-").map(Number);

  const stats: { icon: IconName; label: string; value: string; tone: string }[] = [
    { icon: "check", label: "누적 인증", value: `${detail.totalProofDays}일`, tone: "text-accent" },
    { icon: "flame", label: "현재 스트릭", value: `${detail.streak}일`, tone: "text-gold" },
    { icon: "clock", label: "마지막 인증", value: lastProofText(detail.daysSinceLast), tone: "text-sky-300" },
  ];

  return (
    <div className="flex flex-col gap-3.5 pb-6 text-text">
      <header className="flex items-center gap-2">
        <Link
          href={`${CREATOR_BASE_PATH}/${encodeURIComponent(challenge.id)}/members`}
          aria-label="참여자 관리"
          className="-ml-1 grid h-10 w-8 shrink-0 place-items-center text-muted"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="text-[22px] font-black">참여자 상세</h1>
      </header>

      <section className={`${card} flex items-center gap-4 p-4`}>
        <Avatar src={member.avatarUrl} label={member.nickname} className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-[34px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] font-black">{member.nickname}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {detail.week ? `챌린지 ${detail.week}주차` : "시작 전"}
            {member.joinedAt && ` · ${formatMonthDay(member.joinedAt)} 합류`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {member.inactiveDays >= ATTENTION_INACTIVE_DAYS && (
              <span className="rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1 text-[12px] font-bold text-red-300">
                {member.inactiveDays}일째 기록 없음
              </span>
            )}
            {member.badge && <StatusBadge badge={member.badge} />}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2" aria-label="인증 요약">
        {stats.map((s) => (
          // 아이콘을 위로 — 375px 3칸에서 "현재 스트릭"이 "스트/릭"으로 갈렸다(2026-10-25 미리보기 확인)
          <div key={s.label} className={`${card} p-3`}>
            <Icon name={s.icon} size={18} className={s.tone} />
            <p className="mt-1 whitespace-nowrap text-[11.5px] font-bold text-muted">{s.label}</p>
            <p className="mt-0.5 text-[22px] font-black tabular-nums">{s.value}</p>
          </div>
        ))}
      </section>

      <section className={`${card} p-3.5`}>
        <SectionTitle icon="target" title="개인 목표" />
        {detail.goals.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">아직 목표를 정하지 않았어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {detail.goals.map((g) => (
              // 이름이 길다("웨이트 운동일(하루 1종목+)") — 한 줄을 다 쓰고 막대는 아래에 둔다
              <li key={g.key} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13.5px] font-bold">{g.label}</span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums">
                    {g.actual}<span className="text-muted"> / {g.target}{g.unit}</span>
                  </span>
                </div>
                <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round(g.rate * 100))}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted">회원이 정한 목표예요. 방장은 바꿀 수 없어요.</p>
      </section>

      <section className={`${card} p-3.5`} aria-label="운동 달력">
        <div className="flex items-center justify-between">
          <SectionTitle icon="calendar" title="운동 달력" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="이전 달"
              disabled={monthIdx === 0}
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              className="grid h-9 w-9 place-items-center rounded-full text-muted disabled:opacity-30"
            >
              <Icon name="back" size={16} />
            </button>
            <span className="min-w-[44px] text-center text-[14px] font-bold">{mm}월</span>
            <button
              type="button"
              aria-label="다음 달"
              disabled={monthIdx >= months.length - 1}
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              className="grid h-9 w-9 place-items-center rounded-full text-muted disabled:opacity-30"
            >
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1.5 text-center text-[12px]">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1 text-[11px] font-bold text-muted">{w}</span>
          ))}
          {monthCells(month).map((key, i) => {
            if (!key) return <span key={`blank-${i}`} />;
            const inPeriod = key >= challenge.start_date && key <= challenge.end_date;
            const done = proofDays.has(key);
            const isToday = key === detail.todayKey;
            return (
              <span key={key} className="grid place-items-center">
                <span
                  aria-label={done ? `${key} 인증` : undefined}
                  className={`grid h-9 w-9 place-items-center rounded-full tabular-nums ${
                    done ? "bg-accent font-extrabold text-accent-ink"
                      : isToday ? "border border-line-strong font-bold"
                        : inPeriod ? "text-text" : "text-muted/50"
                  }`}
                >
                  {Number(key.slice(8))}
                </span>
              </span>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">초록 = 챌린지에 반영된 인증일. 기간 밖 날짜는 흐리게 표시돼요.</p>
      </section>

      <section className={`${card} p-3.5`}>
        <SectionTitle icon="bell" title="최근 활동" />
        {challenge.status !== "active" ? (
          <p className="mt-3 text-[12.5px] text-muted">진행 중인 챌린지에서만 활동 기록을 보여 드려요.</p>
        ) : detail.recent.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">아직 이 챌린지에서 인증한 운동이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {detail.recent.map((r) => (
              <li key={r.sessionId} className="flex items-center gap-3 py-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent">
                  <Icon name={r.hasPhoto ? "camera" : "dumbbell"} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px]">{r.title ?? "운동"} 인증을 완료했어요.</strong>
                  {r.cheerCount > 0 && <span className="text-[11.5px] text-muted">응원 {r.cheerCount}개</span>}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{r.when}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.liveSessionId ? (
        <section className="rounded-card border border-accent/50 bg-accent/5 p-3.5">
          <p className="flex items-center gap-2 text-[15px] font-extrabold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
            지금 운동 중이에요 — 응원 보내기
          </p>
          {isDemoChallenge(challenge.id) ? (
            // 미리보기의 가짜 세션으로 send_cheer를 부르지 않는다
            <p className="mt-2 text-[12px] text-muted">미리보기에서는 응원 버튼이 이 자리에 보여요. 실제로 보내지는 않아요.</p>
          ) : (
            <CheerActions sessionId={detail.liveSessionId} nickname={member.nickname} />
          )}
        </section>
      ) : (
        challenge.status === "active" && (
          <p className="text-[11.5px] text-muted">
            응원은 회원이 운동하고 있을 때 보낼 수 있어요. 쉬고 있는 회원에게 보내는 안부 메시지는 다음 단계에서 준비해요.
          </p>
        )
      )}
    </div>
  );
}
