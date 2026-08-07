"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { createGroup, getMyGroups, joinGroupWithCode } from "@/lib/crew";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
import type { Group } from "@/lib/types";

/**
 * 홈의 내 크루 카드 — 크루명·초대 링크 복사.
 * 크루가 없으면(혼자모드) 만들기/참여 CTA를 대신 보여준다.
 *
 * ⚠️ **찌르기와 멤버 칩은 2026-08-07에 친구 목록 카드로 옮겼다.**
 * 설계: `docs/superpowers/specs/2026-08-07-home-friend-board-and-challenge-consolidation-design.md` §6.6
 *
 * 되돌리지 마라 — 두 곳에 두면 `poked` 상태가 컴포넌트마다 따로라서, 한쪽에서
 * 찔러 "✅ 찌름"으로 잠가도 **다른 쪽 버튼은 열린 채로 남는다.** 두 번째로 누르면
 * 서버가 `poke_cooldown`으로 막아 사용자는 에러 토스트로 그 사실을 알게 된다.
 * 남기려면 상태를 HomeClient로 끌어올려 두 곳에 같은 값을 내려야 한다.
 *
 * 멤버 명단(`getCrewProfiles`)·오늘 운동 여부(`getTodaysWorkoutUserIds`)·
 * 찌르기 기록(`getMyRecentPokeTargets`) 조회도 같이 사라졌다. 친구 목록 카드가
 * 같은 값을 이미 갖고 있어서, 홈 전체로 보면 조회가 **줄었다**.
 */
export function CrewCard() {
  const { userId, loading, configured } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    void (async () => {
      try {
        const groups = await getMyGroups();
        if (!cancelled) setGroup(groups[0] ?? null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, refreshKey]);

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
      <h3 className="text-sm font-extrabold">👥 {group.name}</h3>
      {/* 문구가 "무엇에 대한 초대인지"를 말하지 않아 챌린지 초대와 헷갈렸다
          (2026-08-07 사용자 질문). 실제 동작을 그대로 적는다:
            · auth-provider가 첫 방문자에게 `signInAnonymously()`로 계정을 바로 발급한다
            · 온보딩 화면은 **닉네임만** 받는다 (이메일·비밀번호 입력칸이 없다)
            · invite/[code]는 프로필이 없으면 온보딩으로 보내고, 끝나면 크루에 넣는다
          "이메일 가입 없이"를 명시하는 이유는 사용자가 실제로 그걸 물었기 때문이다. */}
      <p className="mt-1 text-xs leading-relaxed text-muted">
        <b className="text-text">GND 앱에 친구를 부르는 링크</b>예요. 친구가 링크를
        열면 GND가 켜지고 이 크루에 바로 들어와요. 앱이 처음이어도{" "}
        <b className="text-text">이메일 가입 없이</b> 닉네임만 정하면 끝이에요.
      </p>

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

      <p className="mt-2 text-[11px] text-faint">
        {copied
          ? "카카오톡·문자에 붙여넣어 보내세요 📨"
          : "챌린지 초대와는 달라요 — 챌린지는 챌린지 탭에서 따로 불러요."}
      </p>
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
