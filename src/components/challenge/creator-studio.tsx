"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { challengeInviteUrl } from "@/lib/domain/challenge-invite";
import { CREATOR_BASE_PATH } from "@/lib/domain/creator-return";
import {
  ATTENTION_INACTIVE_DAYS,
  challengeStatusLabel,
  type CreatorBadge,
  type CreatorMember,
  type CreatorSnapshot,
} from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";

type Filter = "all" | "attention" | "no-proof" | "no-goal" | "new";

const BADGE: Record<CreatorBadge, { label: string; className: string }> = {
  "done-today": { label: "완료", className: "border-accent/60 text-accent" },
  attention: { label: "확인 필요", className: "border-gold/70 text-gold" },
  "needs-goal": { label: "설정 필요", className: "border-line-strong text-muted" },
  new: { label: "신규", className: "border-sky-400/60 text-sky-300" },
  active: { label: "진행 중", className: "border-line text-muted" },
  ready: { label: "준비 완료", className: "border-accent/60 text-accent" },
};

export function CreatorStudio({
  challenge, snapshot, viewerId,
}: {
  challenge: Pick<Challenge, "id" | "name" | "start_date" | "end_date" | "status" | "invite_code">;
  snapshot: CreatorSnapshot;
  viewerId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<CreatorMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const members = useMemo(
    () => snapshot.members.filter((m) => {
      if (!m.nickname.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
      if (filter === "attention") return m.badge === "attention";
      if (filter === "no-proof") return !m.todayProof;
      if (filter === "no-goal") return !m.hasGoals;
      if (filter === "new") return m.recentlyJoined;
      return true;
    }),
    [snapshot.members, search, filter],
  );

  async function shareInvite() {
    if (challenge.status !== "setup" || !challenge.invite_code) return;
    const url = challengeInviteUrl(window.location.origin, challenge.invite_code, viewerId);
    try {
      if (navigator.share) {
        await navigator.share({ title: challenge.name, text: "GND 운동 챌린지에 함께해요", url });
        setNotice("초대 링크를 공유했어요");
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("초대 링크를 복사했어요");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNotice("링크를 공유하지 못했어요. 챌린지 관리에서 다시 시도해 주세요.");
    }
  }

  // "오늘 기록"은 진행 기간 안에서만 묻는다 — 모집 중·종료 후엔 전원이 "없음"으로 잡힌다.
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `전체 ${snapshot.memberCount}` },
    ...(snapshot.todayTracked
      ? [
          { id: "attention" as const, label: `확인 필요 ${snapshot.attentionCount}` },
          { id: "no-proof" as const, label: "오늘 기록 없음" },
        ]
      : []),
    { id: "no-goal", label: `목표 미설정 ${snapshot.noGoalCount}` },
    { id: "new", label: "최근 7일 합류" },
  ];
  const recentLabel = challenge.status === "ended" ? "마지막 7일" : "최근 7일";
  const showMembers = (next: Filter) => {
    setFilter(next);
    document.getElementById("creator-members")?.scrollIntoView({ behavior: "smooth" });
  };
  // 오늘 할 일 (계획서 §5.1) — 진행 중: 확인 필요·목표 미설정·신규, 모집 중: 목표 미설정·신규
  const todos: { id: Filter; title: string; count: number }[] = [
    ...(snapshot.todayTracked
      ? [{ id: "attention" as const, title: `${ATTENTION_INACTIVE_DAYS}일 이상 운동 기록이 없는 회원`, count: snapshot.attentionCount }]
      : []),
    { id: "no-goal", title: "목표를 아직 정하지 않은 회원", count: snapshot.noGoalCount },
    { id: "new", title: "이번 주 새로 합류한 회원", count: snapshot.recentJoinCount },
  ];

  return (
    // (tabs) 레이아웃 안이다 — `main`·화면 여백은 레이아웃이 준다. 중첩 `main`을 만들지 않는다.
    <div className="flex flex-col gap-4 pb-6 text-text">
      <header className="flex items-center gap-3">
        <Link href={CREATOR_BASE_PATH} className="rounded-card-sm border border-line px-3 py-2 text-sm font-bold">
          ← 목록
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-accent">CREATOR STUDIO</p>
          <h1 className="truncate text-xl font-black">{challenge.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          aria-label="운영 현황 새로고침"
          className="ml-auto min-h-11 shrink-0 rounded-card-sm border border-line px-3 text-xs font-bold"
        >
          새로고침
        </button>
      </header>

      <p className="text-[12px] text-muted">
        {challenge.start_date} ~ {challenge.end_date} · {challengeStatusLabel(challenge.status)}
      </p>

      <section className="grid grid-cols-2 gap-2" aria-label="운영 현황">
        {([
          ["참가 회원", snapshot.memberCount, "방장 제외 · 가입 완료"],
          ["첫 인증 도달", snapshot.firstProofCount, "기간 중 유효 기록 1일 이상"],
          snapshot.todayTracked
            ? ["오늘 인증", snapshot.todayProofCount, "휴식일 여부는 반영하지 않아요"]
            : ["오늘 인증", "–", "진행 중에만 집계해요"],
          ["목표 미설정", snapshot.noGoalCount, "가입 회원 기준"],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-xs font-bold text-muted">{label}</p>
            <p className="mt-1 text-[28px] font-black text-accent tabular-nums">{value}</p>
            <p className="mt-1 text-[10px] text-muted">{sub}</p>
          </div>
        ))}
      </section>

      {challenge.status !== "ended" && (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">오늘 할 일</h2>
        <div className="mt-2 flex flex-col gap-2">
          {todos.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-center justify-between rounded-card-sm bg-surface-2 px-3 py-3 text-left text-sm font-bold"
              onClick={() => showMembers(t.id)}
            >
              {t.title} <span className="text-accent">{t.count}명 →</span>
            </button>
          ))}
        </div>
        {snapshot.todayTracked && (
          <p className="mt-2 text-[11px] text-muted">
            쉬는 날은 알 수 없어요. 기록이 없다는 사실만 보여 주니, 응원으로 먼저 안부를 물어 주세요.
          </p>
        )}
      </section>
      )}

      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">초대 및 운영</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {challenge.status === "setup" && challenge.invite_code ? (
            <button type="button" onClick={() => void shareInvite()} className="min-h-12 rounded-card-sm bg-accent px-3 text-sm font-extrabold text-accent-ink">
              초대 링크 공유
            </button>
          ) : (
            <Link href={`/challenge?open=${encodeURIComponent(challenge.id)}`} className="grid min-h-12 place-items-center rounded-card-sm border border-line px-3 text-center text-sm font-bold">
              {challenge.status === "setup" ? "초대 코드 만들기" : "챌린지 상세"}
            </Link>
          )}
          <button
            type="button"
            onClick={() => document.getElementById("creator-members")?.scrollIntoView({ behavior: "smooth" })}
            className="min-h-12 rounded-card-sm border border-accent px-3 text-sm font-extrabold text-accent"
          >
            참여자 관리
          </button>
        </div>
        {challenge.status !== "setup" && (
          <p className="mt-2 text-[11px] text-muted">진행 중/종료된 챌린지는 기존 참가 규칙에 따라 신규 초대가 제한됩니다.</p>
        )}
        {notice && <p role="status" className="mt-2 text-xs font-bold text-accent">{notice}</p>}
      </section>

      <section id="creator-members" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">회원 관리</h2>
          <span className="text-xs text-muted">가입 완료 · 방장 제외</span>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">회원 닉네임 검색</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="닉네임 검색"
            className="h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="회원 필터">
          {filters.map((f) => (
            <button
              key={f.id} type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`min-h-9 rounded-full border px-3 text-[12px] font-bold ${filter === f.id ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {challenge.status === "setup"
            ? "챌린지가 시작되면 인증 현황이 표시됩니다."
            : `주간 활동은 ${recentLabel}의 챌린지 유효 인증일입니다.`} 회원 개인 목표는 변경하지 않습니다.
        </p>
        <div className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setSelected(m)}
              className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left"
            >
              <Avatar src={m.avatarUrl} label={m.nickname} className="h-10 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{m.nickname}</strong>
                <span className="mt-1 block text-[11px] text-muted">
                  {m.inactiveDays >= ATTENTION_INACTIVE_DAYS
                    ? `${m.inactiveDays}일째 기록 없음`
                    : m.hasGoals ? "목표 설정" : "목표 없음"}
                  {challenge.status !== "setup" && ` · ${recentLabel} ${m.recentProofDays}일`}
                </span>
                {challenge.status !== "setup" && (
                  <span className="block text-[11px] text-muted">
                    마지막 인증 {m.lastProofDay ?? "기록 없음"}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-muted">
                {m.badge && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${BADGE[m.badge].className}`}>
                    {BADGE[m.badge].label}
                  </span>
                )}
                상세 →
              </span>
            </button>
          ))}
          {members.length === 0 && (
            <p className="py-7 text-center text-sm text-muted">
              {snapshot.memberCount === 0 ? "아직 가입한 회원이 없어요. 먼저 초대 링크를 공유해 보세요." : "조건에 맞는 회원이 없어요."}
            </p>
          )}
        </div>
      </section>
      <p className="text-center text-[11px] text-muted">채널별 유입·전환 퍼널과 자동 리마인더는 후속 단계(P1/P2)입니다. 측정되지 않은 성과를 표시하지 않습니다.</p>
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
