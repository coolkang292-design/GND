"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getCrewProfiles, getMyGroups } from "@/lib/crew";
import { getTodaysWorkoutUserIds, pokeUser, SocialError } from "@/lib/social";
import type { Group, Profile } from "@/lib/types";

/** 홈의 내 크루 카드 — 크루명·멤버·오늘 미운동 찌르기·초대 링크 복사 */
export function CrewCard() {
  const { userId, loading, configured } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [workedOut, setWorkedOut] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        const groups = await getMyGroups();
        if (cancelled) return;
        const g = groups[0] ?? null;
        setGroup(g);
        if (g) {
          const crew = await getCrewProfiles(g.id);
          if (cancelled) return;
          setMembers(crew);
          const done = await getTodaysWorkoutUserIds(crew.map((c) => c.id));
          if (!cancelled) setWorkedOut(done);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  async function poke(target: Profile) {
    try {
      await pokeUser(target.id);
      setNotice(`${target.nickname}님을 콕 찔렀어요 👉`);
    } catch (e) {
      if (e instanceof SocialError && e.code === "poke_cooldown") {
        setNotice("오늘은 이미 찔렀어요");
      } else {
        setNotice("찌르기를 보내지 못했어요");
      }
    }
    setTimeout(() => setNotice(null), 3000);
  }

  if (!configured || !ready || !group) return null;

  async function copyInvite() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${group!.invite_code}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold">👥 {group.name}</h3>
        <span className="text-xs text-muted">{members.length}명</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pr-2.5 pl-1"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-sm">
              {m.avatar_url ?? "👤"}
            </span>
            <span className="text-xs font-bold">
              {m.nickname}
              {m.id === userId && (
                <span className="ml-0.5 text-faint">(나)</span>
              )}
              {workedOut.has(m.id) && <span className="ml-0.5">✅</span>}
            </span>
            {m.id !== userId && !workedOut.has(m.id) && (
              <button
                onClick={() => void poke(m)}
                aria-label={`${m.nickname} 찌르기`}
                className="ml-0.5 rounded-full bg-accent-weak px-1.5 py-0.5 text-[11px] font-bold text-accent"
              >
                👉 콕
              </button>
            )}
          </div>
        ))}
      </div>

      {notice && (
        <p className="mt-2 text-xs font-bold text-accent">{notice}</p>
      )}

      <button
        onClick={copyInvite}
        className="mt-3 flex w-full items-center justify-between rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
      >
        <span className="font-mono text-sm font-extrabold tracking-wider">
          {group.invite_code}
        </span>
        <span className="text-xs font-bold text-accent">
          {copied ? "복사됨 ✓" : "초대 링크 복사"}
        </span>
      </button>
    </section>
  );
}
