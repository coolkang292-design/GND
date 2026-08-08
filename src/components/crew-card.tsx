"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { useAuth } from "@/components/auth-provider";
import { issueMyInviteCode } from "@/lib/crew";

/**
 * 홈의 친구 초대 카드 — 내 초대 코드·링크 복사.
 *
 * ⚠️ **찌르기와 멤버 칩은 2026-08-07에 친구 목록 카드로 옮겼다.**
 * 설계: `docs/superpowers/specs/2026-08-07-home-friend-board-and-challenge-consolidation-design.md` §6.6
 *
 * 되돌리지 마라 — 두 곳에 두면 `poked` 상태가 컴포넌트마다 따로라서, 한쪽에서
 * 찔러 "✅ 찌름"으로 잠가도 **다른 쪽 버튼은 열린 채로 남는다.**
 *
 * ⚠️ **2026-08-08에 코드의 주인이 그룹 → 사람으로 바뀌었다** (0061, 설계 §3).
 * 이 카드는 이제 `groups`를 조회하지 않는다. 옛 구현은
 *   · `getMyGroups()`로 그룹을 찾아 `group.invite_code`를 보여줬고
 *   · 그룹이 없으면 `NoCrewCard`("＋ 크루 만들기 / 초대 코드로 참여")로 갈아탔다
 * 그래서 ① 링크로 들어온 사람이 **친구 목록에 안 나타났고**(사용자 지적)
 *       ② 그룹이 없는 사람은 **친구 초대를 아예 할 수 없었다.**
 *
 * `NoCrewCard`도 같이 지웠다. 그룹은 이제 `create_challenge_room`(0062)이 챌린지를
 * 만들 때 자동으로 만들므로 사용자에게 물을 이유가 없고, 친구가 0명일 때의 안내는
 * 친구 목록 카드의 `NoFriendsCard`가 이미 한다 — 두 카드를 같이 두면 홈에
 * "크루와 함께하면 더 강해져요"와 "친구와 함께하면 더 강해져요"가 나란히 뜬다.
 * 옛 그룹 코드로 참여할 길은 `/invite/<code>` 링크와 온보딩 `step="join"`에 남아 있다.
 */
export function CrewCard() {
  const { userId, loading, configured } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 상세 설명 접힘 — 기본은 접힌다 (2026-08-07 사용자 지시 "심플하게 한줄로") */
  const [showDetail, setShowDetail] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    void (async () => {
      try {
        const code = await issueMyInviteCode();
        if (!cancelled) setInviteCode(code);
      } catch {
        // 프로필이 아직 없으면(온보딩 직전) 서버가 no_profile을 던진다.
        // 카드를 안 그리고 조용히 넘긴다 — 홈은 곧 온보딩으로 이동한다.
        if (!cancelled) setInviteCode(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  if (!configured || !ready || !inviteCode) return null;

  async function copyInvite() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${inviteCode}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      {/* ⚠️ 헤딩에 그룹 이름을 쓰지 않는다 (2026-08-07 사용자 지적).
          운영에서 이 자리가 `👥 리얼GND`로 떴다 — 사용자가 오래전에 지은 그룹
          이름이라 **카드가 무엇을 하는 곳인지 말해 주지 않는다.**
          `crew-card.test.tsx`가 그룹명 부재를 부정 단언으로 막는다. */}
      {/* ⚠️ 접힘 규약 (2026-08-07 사용자 지시 — "문구가 너무 길다. 심플하게 한줄로
          설명하고 클릭하면 자세한 정보 나오게"). 카드가 다섯 줄짜리 벽이 돼 있었다.

          **한 줄에 남길 것은 "무엇에 대한 초대인가" 하나뿐이다.** 그것만은 접으면
          안 된다 — 이 앱엔 초대가 두 종류(`/invite/[code]` · `/challenge?join=`)라,
          그 답이 없으면 사용자가 챌린지 초대로 오해한다(2026-08-07 사용자 질문).

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
             · 온보딩 화면은 **닉네임만** 받는다
             · invite/[code]는 프로필이 없으면 온보딩으로 보내고, 끝나면 친구로 잇는다

           ⚠️ 옛 문구는 `이메일 가입 없이`를 **장점처럼** 팔았다 (2026-08-07 사용자 지적).
           그런데 같은 앱의 계정 화면(`account/page.tsx`)은 정확히 그 상태를 이렇게
           경고한다 — "브라우저 데이터를 지우면 기록·XP·배지에 다시 접근할 수 없어요."
           한쪽에서 팔고 한쪽에서 말리고 있었다. **닉네임만으로 시작한다는 사실은
           참이라 남기고, 그것을 안전한 최종 상태처럼 말하는 것만 뺀다.**

           ⚠️ **누가 붙여 주는지까지 적는다** (2026-08-07 사용자 질문). 답이
           2026-08-08에 바뀌었다 — 옛 문구는 "크루장이 대신 붙여 줘요"였다.
           이메일 자체 연결이 Supabase 발송 한도(429 실측)에 막혀서 사용자가
           스스로 할 수 있는 일이 없었기 때문이다. 이제 `/account`에서 카카오·구글을
           본인이 직접 연결한다(설계 §5.4). **할 수 있는 일이 생겼으면 문구도
           그리로 보내야 한다** — 안 그러면 크루장을 찾는 헛걸음을 시킨다. */
        <div className="mt-2 flex flex-col gap-1.5 rounded-card-sm border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-muted">
          {/* ⚠️ 2026-08-08에 "이 크루에 바로 들어와요" → "바로 친구가 돼요"로
              고쳤다. 0061 전에는 링크가 실제로 그룹에 넣었고, 지금은 친구를 맺는다.
              문구를 안 고치면 화면이 거짓말을 한다. */}
          <p>친구가 링크를 열면 GND가 켜지고 바로 친구가 돼요.</p>
          <p>
            닉네임만 정하면 바로 시작해요. 다만 그 계정은 그 브라우저에만 있어서,
            데이터를 지우면 기록·XP·배지가 사라져요. 지키려면{" "}
            <b className="text-text">내 정보 → 계정</b>에서{" "}
            <b className="text-text">카카오나 구글을 연결</b>하면 돼요.
          </p>
          <p>챌린지 초대와는 달라요 — 챌린지는 챌린지 탭에서 따로 불러요.</p>
        </div>
      )}

      <button
        onClick={copyInvite}
        className="mt-3 flex w-full items-center justify-between rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
      >
        <span className="font-mono text-sm font-extrabold tracking-wider">
          {inviteCode}
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
