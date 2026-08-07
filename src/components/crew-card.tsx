"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
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
  /** 상세 설명 접힘 — 기본은 접힌다 (2026-08-07 사용자 지시 "심플하게 한줄로") */
  const [showDetail, setShowDetail] = useState(false);
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
      {/* ⚠️ 헤딩에 `group.name`을 쓰지 않는다 (2026-08-07 사용자 지적).
          운영에서 이 자리가 `👥 리얼GND`로 떴다 — 사용자가 오래전에 지은 그룹
          이름이라 **카드가 무엇을 하는 곳인지 말해 주지 않는다.** 이 카드의 역할은
          같은 날 개편으로 '크루 정보'에서 '친구 부르기'로 바뀌었는데(멤버 칩·찌르기가
          친구 목록 카드로 옮겨 갔다) 헤딩만 옛 역할에 남아 있었다.
          `crew-card.test.tsx`가 그룹명 부재를 부정 단언으로 막는다. */}
      {/* ⚠️ 접힘 규약 (2026-08-07 사용자 지시 — "문구가 너무 길다. 심플하게 한줄로
          설명하고 클릭하면 자세한 정보 나오게"). 카드가 다섯 줄짜리 벽이 돼 있었다.

          **한 줄에 남길 것은 "무엇에 대한 초대인가" 하나뿐이다.** 그것만은 접으면
          안 된다 — 이 앱엔 초대가 두 종류(`/invite/[code]` · `/challenge?join=`)라,
          그 답이 없으면 사용자가 챌린지 초대로 오해한다(2026-08-07 사용자 질문).
          나머지는 **처음 초대할 때 한 번** 궁금한 것이라 눌러서 보면 된다.

          ⚠️ 내용을 **버린 게 아니라 접은 것**이다. `crew-card.test.tsx`가 양쪽을
          다 단언한다 — 접힌 상태의 부재와 펼친 상태의 존재. */}
      <div className="flex items-center justify-between gap-2">
        {/* 옛 표기는 `👥`였다 (2026-08-07 2차 시안으로 교체) */}
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name="friends-add" size={22} />
          친구 초대하기
        </h3>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          className="flex-none text-xs font-bold text-accent"
        >
          자세히
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        <b className="text-text">GND 앱에 친구를 부르는 링크</b>예요.
      </p>

      {showDetail && (
        /* 실제 동작을 그대로 적는다 (2026-08-07 사용자 질문):
             · auth-provider가 첫 방문자에게 `signInAnonymously()`로 계정을 바로 발급한다
             · 온보딩 화면은 **닉네임만** 받는다 (이메일·비밀번호 입력칸이 없다)
             · invite/[code]는 프로필이 없으면 온보딩으로 보내고, 끝나면 크루에 넣는다

           ⚠️ 옛 문구는 `이메일 가입 없이`를 **장점처럼** 팔았다 (2026-08-07 사용자 지적).
           그런데 같은 앱의 계정 화면(`account/page.tsx`)은 정확히 그 상태를 이렇게
           경고한다 — "브라우저 데이터를 지우면 기록·XP·배지에 다시 접근할 수 없어요."
           한쪽에서 팔고 한쪽에서 말리고 있었다. **닉네임만으로 시작한다는 사실은
           참이라 남기고, 그것을 안전한 최종 상태처럼 말하는 것만 뺀다.**

           ⚠️ **누가 붙여 주는지까지 적는다** (2026-08-07 사용자 질문 — "이메일을 연결은
           조인 하고 내정보에서 할수 있나?"). 답은 **아니다.** `/account`는 이메일이
           없는 계정에 연결 폼을 **보여주지 않는다** — Supabase 확인 메일 발송 제한에
           걸려 자체 연결이 실패하기 때문이다(`account/page.tsx:13`). 그 화면도 같은
           말을 한다: "크루장에게 이메일 연결을 요청하세요."
           "이메일을 연결하세요"까지만 쓰면 **할 수 없는 일을 시키는 문구**가 된다.
           자체 연결이 열리면 이 문장과 `account/page.tsx`를 **같이** 고쳐라. */
        <div className="mt-2 flex flex-col gap-1.5 rounded-card-sm border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-muted">
          <p>친구가 링크를 열면 GND가 켜지고 이 크루에 바로 들어와요.</p>
          <p>
            닉네임만 정하면 바로 시작해요. 다만 그 계정은 그 브라우저에만 있어서,
            데이터를 지우면 기록·XP·배지가 사라져요. 지키려면{" "}
            <b className="text-text">이메일을 연결</b>해야 하는데 지금은{" "}
            <b className="text-text">크루장이 대신 붙여</b> 줘요.
          </p>
          <p>챌린지 초대와는 달라요 — 챌린지는 챌린지 탭에서 따로 불러요.</p>
        </div>
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

      {/* ⚠️ 복사했을 때**만** 한 줄 뜬다. 옛날엔 안 눌렀을 때 "챌린지 초대와는
          달라요"가 상시로 붙어 있었는데, 그 구별은 상세로 옮겼다 — 카드를 짧게
          하라는 지시(2026-08-07)에 상시 문구를 남겨 두면 한 줄이 두 줄이 된다. */}
      {copied && (
        <p className="mt-2 text-[11px] text-faint">
          카카오톡·문자에 붙여넣어 보내세요 📨
        </p>
      )}
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
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
        <UiIcon name="friends-add" size={22} />
        크루와 함께하면 더 강해져요
      </h3>
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
