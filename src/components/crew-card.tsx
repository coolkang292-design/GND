"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  createGroup,
  getCrewProfiles,
  getMyGroups,
  joinGroupWithCode,
} from "@/lib/crew";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
import { getTodaysWorkoutUserIds, pokeUser, SocialError } from "@/lib/social";
import type { Group, Profile } from "@/lib/types";

/** 홈의 내 크루 카드 — 크루명·멤버·오늘 미운동 찌르기·초대 링크 복사.
 * 크루가 없으면(혼자모드) 만들기/참여 CTA를 대신 보여준다. */
export function CrewCard() {
  const { userId, loading, configured } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [workedOut, setWorkedOut] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [configured, loading, userId, refreshKey]);

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

  if (!configured || !ready) return null;

  if (!group) return <NoCrewCard onJoined={() => setRefreshKey((k) => k + 1)} />;

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

/** 크루가 없을 때(혼자모드) 홈에 뜨는 크루 만들기/참여 진입점 */
function NoCrewCard({ onJoined }: { onJoined: () => void }) {
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [crewName, setCrewName] = useState("불꽃 크루");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCreate() {
    const name = crewName.trim();
    if (!name) return setError("크루 이름을 입력해주세요");
    setBusy(true);
    setError(null);
    try {
      await createGroup(name);
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : "크루 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function submitJoin() {
    const code = normalizeInviteCode(joinCode);
    if (!code) return setError("초대 코드를 입력해주세요");
    setBusy(true);
    setError(null);
    try {
      await joinGroupWithCode(code);
      onJoined();
    } catch {
      setError("코드를 확인해주세요 — 존재하지 않는 초대 코드예요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="text-sm font-extrabold">👥 크루와 함께하면 더 강해져요</h3>
      <p className="mt-1 text-xs text-muted">
        혼자서도 기록하고 캐릭터를 키울 수 있어요. 크루에 들어가면 친구들과
        챌린지로 겨룰 수 있어요.
      </p>

      {mode === "none" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            className="h-11 flex-1 rounded-card-sm bg-accent text-[13px] font-extrabold text-accent-ink"
          >
            ＋ 크루 만들기
          </button>
          <button
            onClick={() => {
              setMode("join");
              setError(null);
            }}
            className="h-11 flex-1 rounded-card-sm border border-line bg-surface-2 text-[13px] font-extrabold"
          >
            초대 코드로 참여
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={crewName}
            onChange={(e) => setCrewName(e.target.value)}
            maxLength={30}
            placeholder="크루 이름"
            className="w-full rounded-card-sm border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={submitCreate}
              disabled={busy}
              className="h-11 flex-1 rounded-card-sm bg-accent text-[13px] font-extrabold text-accent-ink disabled:opacity-60"
            >
              {busy ? "처리 중…" : "만들기"}
            </button>
            <button
              onClick={() => setMode("none")}
              className="h-11 rounded-card-sm border border-line bg-surface px-4 text-[13px] font-bold text-muted"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {mode === "join" && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="예: GND-7K2AB"
            className="w-full rounded-card-sm border border-line bg-surface px-3 py-2.5 text-center font-mono text-sm uppercase outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={submitJoin}
              disabled={busy}
              className="h-11 flex-1 rounded-card-sm bg-accent text-[13px] font-extrabold text-accent-ink disabled:opacity-60"
            >
              {busy ? "처리 중…" : "참여하기"}
            </button>
            <button
              onClick={() => setMode("none")}
              className="h-11 rounded-card-sm border border-line bg-surface px-4 text-[13px] font-bold text-muted"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-warn">{error}</p>}
    </section>
  );
}
