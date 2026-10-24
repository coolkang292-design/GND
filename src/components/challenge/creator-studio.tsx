"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { challengeInviteUrl } from "@/lib/domain/challenge-invite";
import type { CreatorMember, CreatorSnapshot } from "@/lib/domain/creator-studio";
import type { Challenge } from "@/lib/types";

type Filter = "all" | "no-proof" | "no-goal" | "new";

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

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `전체 ${snapshot.memberCount}` },
    { id: "no-proof", label: "오늘 기록 없음" },
    { id: "no-goal", label: `목표 미설정 ${snapshot.noGoalCount}` },
    { id: "new", label: "최근 7일 합류" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 pb-20 pt-5 text-text">
      <header className="flex items-center gap-3">
        <Link href="/creator" className="rounded-card-sm border border-line px-3 py-2 text-sm font-bold">
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
        {challenge.start_date} ~ {challenge.end_date} · {challenge.status === "setup" ? "모집 준비" : challenge.status === "active" ? "진행 중" : "종료"}
      </p>

      <section className="grid grid-cols-2 gap-2" aria-label="운영 현황">
        {([
          ["참가 회원", snapshot.memberCount, "방장 제외 · 가입 완료"],
          ["첫 인증 도달", snapshot.firstProofCount, "기간 중 유효 기록 1일 이상"],
          ["오늘 인증", snapshot.todayProofCount, "휴식일 제외 분모 아님"],
          ["목표 미설정", snapshot.noGoalCount, "가입 회원 기준"],
        ] as const).map(([label, value, sub]) => (
          <div key={label} className="rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-xs font-bold text-muted">{label}</p>
            <p className="mt-1 text-[28px] font-black text-accent tabular-nums">{value}</p>
            <p className="mt-1 text-[10px] text-muted">{sub}</p>
          </div>
        ))}
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">오늘 할 일</h2>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-card-sm bg-surface-2 px-3 py-3 text-left text-sm font-bold"
            onClick={() => { setFilter("no-goal"); document.getElementById("creator-members")?.scrollIntoView({ behavior: "smooth" }); }}
          >
            목표를 아직 정하지 않은 회원 <span className="text-accent">{snapshot.noGoalCount}명 →</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-card-sm bg-surface-2 px-3 py-3 text-left text-sm font-bold"
            onClick={() => { setFilter("no-proof"); document.getElementById("creator-members")?.scrollIntoView({ behavior: "smooth" }); }}
          >
            오늘 기록 없는 회원 <span className="text-accent">{snapshot.memberCount - snapshot.todayProofCount}명 →</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">기록 없음은 운동 포기나 인증 의무 미이행을 뜻하지 않아요. 개인별 휴식일을 고려해 확인하세요.</p>
      </section>

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
        <p className="mt-2 text-[11px] text-muted">주간 활동은 최근 7일의 챌린지 유효 인증일입니다. 회원 개인 목표는 변경하지 않습니다.</p>
        <div className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setSelected(m)}
              className="flex min-h-[76px] w-full items-center gap-3 py-3 text-left"
            >
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-black">
                {m.nickname.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{m.nickname}</strong>
                <span className="mt-1 block text-[11px] text-muted">
                  {m.hasGoals ? "목표 설정" : "목표 없음"} · 최근 7일 {m.recentProofDays}일
                </span>
                <span className="block text-[11px] text-muted">
                  마지막 인증 {m.lastProofDay ?? "기록 없음"}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] font-bold text-accent">
                {m.todayProof ? "오늘 인증" : "오늘 기록 없음"}
                <span className="block text-[10px] text-muted">상세 →</span>
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
    </main>
  );
}
