"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { Icon } from "@/components/ui/icon";
import { CREATOR_BASE_PATH } from "@/lib/domain/creator-return";
import {
  ATTENTION_INACTIVE_DAYS,
  type CreatorMember,
  type CreatorSnapshot,
  type MemberFilter,
} from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";
import { card, CreatorChallengeCard, StatusBadge } from "./creator-ui";

type Sort = "activity" | "joined" | "name";

/** 회원 한 줄의 사실 문구 — 판정어("미인증")가 아니라 날짜·횟수다. */
function memberLine(m: CreatorMember, status: Challenge["status"]): string {
  if (status === "setup") return m.hasGoals ? "목표 설정 완료" : "목표를 아직 정하지 않았어요";
  const last = m.lastProofDay ? `마지막 인증 ${m.lastProofDay.slice(5).replace("-", "/")}` : "아직 인증 기록 없음";
  if (status === "ended") return `기간 인증 ${m.totalProofDays}일 · ${last}`;
  if (m.todayProof) return `오늘 인증 완료 · 최근 7일 ${m.recentProofDays}일`;
  if (m.inactiveDays >= ATTENTION_INACTIVE_DAYS) return `${m.inactiveDays}일째 기록 없음 · ${last}`;
  if (!m.hasGoals) return `목표 미설정 · ${last}`;
  return `최근 7일 ${m.recentProofDays}일 · ${last}`;
}

/**
 * 참여자 관리 (시안 3, 2026-10-24). 운영 홈의 "오늘 할 일"이 `?filter=`로 여기에 착지한다.
 * ⚠️ 일괄 응원·리마인드는 없다 — 새 다중 발송은 이슈 #25가 보류, 찌르기는 크루 전용(계획서 §3).
 */
export function CreatorMembers({
  challenge, snapshot, viewerId, initialFilter,
}: {
  challenge: Pick<Challenge, "id" | "name" | "status" | "start_date" | "end_date" | "recruit_image_url" | "recruit_note">;
  snapshot: CreatorSnapshot;
  viewerId: string;
  initialFilter: MemberFilter;
}) {
  const tracked = snapshot.todayTracked;
  // 진행 중이 아니면 오늘 기준 필터는 뜻이 없다 — 주소로 들어와도 전체로 되돌린다.
  const [filter, setFilter] = useState<MemberFilter>(
    !tracked && (initialFilter === "attention" || initialFilter === "no-proof") ? "all" : initialFilter,
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("activity");
  const [selected, setSelected] = useState<CreatorMember | null>(null);

  const members = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const shown = snapshot.members.filter((m) => {
      if (q && !m.nickname.toLocaleLowerCase().includes(q)) return false;
      if (filter === "attention") return m.badge === "attention";
      if (filter === "no-proof") return !m.todayProof;
      if (filter === "no-goal") return !m.hasGoals;
      if (filter === "new") return m.recentlyJoined;
      return true;
    });
    return [...shown].sort((a, b) =>
      sort === "name" ? a.nickname.localeCompare(b.nickname, "ko")
        : sort === "joined" ? (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "")
          : (b.lastProofDay ?? "").localeCompare(a.lastProofDay ?? ""),
    );
  }, [snapshot.members, search, filter, sort]);

  const filters: { id: MemberFilter; label: string }[] = [
    { id: "all", label: "전체" },
    ...(tracked
      ? [
          { id: "attention" as const, label: `확인 필요 ${snapshot.attentionCount}` },
          { id: "no-proof" as const, label: "오늘 기록 없음" },
        ]
      : []),
    { id: "no-goal", label: `목표 미설정 ${snapshot.noGoalCount}` },
    { id: "new", label: "신규" },
  ];

  const summary: { icon: "users" | "check" | "warning"; label: string; value: string; tone?: string }[] = [
    { icon: "users", label: "전체", value: `${snapshot.memberCount}명` },
    { icon: "check", label: "오늘 인증", value: tracked ? `${snapshot.todayProofCount}명` : "–" },
    {
      // 3칸이 375px에 들어가야 한다 — 홈 KPI와 같은 이름(2026-10-24 화면 확인)
      icon: "warning", label: "미기록", tone: "text-gold",
      value: tracked ? `${snapshot.memberCount - snapshot.todayProofCount}명` : "–",
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 pb-6 text-text">
      <header className="flex items-center gap-2">
        <Link
          href={`${CREATOR_BASE_PATH}/${encodeURIComponent(challenge.id)}`}
          aria-label="운영 홈"
          className="-ml-1 grid h-10 w-8 shrink-0 place-items-center text-muted"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="text-[22px] font-black">참여자 관리</h1>
      </header>

      <CreatorChallengeCard challenge={challenge} />

      <label className="block">
        <span className="sr-only">회원 닉네임 검색</span>
        <span className={`${card} flex h-12 items-center gap-2 px-3.5`}>
          <Icon name="search" size={19} className="text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="닉네임 검색"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
        </span>
      </label>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [contain:inline-size] [scrollbar-width:none]"
        role="group"
        aria-label="회원 필터"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-[13px] font-bold ${
              filter === f.id ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-3 gap-2" aria-label="참여자 요약">
        {summary.map((s) => (
          <div key={s.label} className={`${card} flex items-center gap-2.5 p-3`}>
            <Icon name={s.icon} size={22} className={s.tone ?? (s.icon === "check" ? "text-accent" : "text-muted")} />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-muted">{s.label}</p>
              <p className="text-[19px] font-black tabular-nums">{s.value}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold">
          참여자 <span className="text-accent">{members.length}명</span>
        </h2>
        <label className="flex items-center gap-1 text-[12.5px] font-bold text-muted">
          <span className="sr-only">정렬</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-h-9 rounded-card-sm bg-transparent pr-1 text-right outline-none"
          >
            <option value="activity">최신 활동순</option>
            <option value="joined">최근 합류순</option>
            <option value="name">이름순</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setSelected(m)}
            className={`${card} flex min-h-[76px] w-full items-center gap-3 px-3 py-3 text-left`}
          >
            <Avatar src={m.avatarUrl} label={m.nickname} className="h-12 w-12 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[15px]">{m.nickname}</strong>
              <span className="mt-0.5 line-clamp-2 text-[12px] text-muted">{memberLine(m, challenge.status)}</span>
            </span>
            {m.badge && <StatusBadge badge={m.badge} />}
            <Icon name="chevron" size={16} className="shrink-0 text-muted" />
          </button>
        ))}
        {members.length === 0 && (
          <p className={`${card} py-8 text-center text-sm text-muted`}>
            {snapshot.memberCount === 0
              ? "아직 가입한 회원이 없어요. 운영 홈에서 초대 링크를 공유해 보세요."
              : "조건에 맞는 회원이 없어요."}
          </p>
        )}
      </div>
      {tracked && (
        <p className="text-[11px] text-muted">쉬는 날은 알 수 없어요. 기록이 없다는 사실만 보여 줍니다.</p>
      )}

      {selected && (
        <MemberProfileSheet
          userId={selected.id}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          viewerId={viewerId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
