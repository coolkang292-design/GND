"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_LANDING_PATH } from "@/lib/domain/landing";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/ui-icon";
import { ScreenArt, type ScreenArtKey } from "@/components/brand/hero-art";
import { GOLD_TEXT, GoldCta } from "@/components/brand/gold";
import { DEFAULT_AVATAR, DEFAULT_WEEKLY_GOAL } from "@/lib/domain/avatars";
import {
  PROVIDER_META,
  enabledProviders,
  getMyIdentities,
  identityError,
  linkProvider,
  type OAuthProvider,
} from "@/lib/identity";
import {
  challengeJoinError,
  clearPendingChallengeInvite,
  isNotNewcomer,
  joinChallengeAsNewcomer,
  joinChallengeWithCode,
  peekPendingChallengeInviteDetail,
  pendingChallengeInvitePath,
  saveOnboardingNotice,
} from "@/lib/challenge";
// ⚠️ `joinGroupWithCode`를 직접 부르지 않는다. 코드가 친구 것인지 그룹 것인지
//    가리는 2단계는 `redeemInviteCode` 한 곳에만 있어야 한다(설계 §3.3).
import {
  clearPendingInvite,
  getMyProfile,
  peekPendingInvite,
  redeemInviteCode,
  upsertMyProfile,
} from "@/lib/crew";

/**
 * ⚠️ 2026-08-08에 `crew`·`create`·`join` 단계를 **지웠다** (사용자 지시 —
 * "이 화면은 필요없지 않나? 바로 홈화면 접속하게 해도 될거 같은데",
 * "그 다음 단계도 같이 제거하면 되겠다").
 *
 * 왜 지워도 됐나:
 *  · **크루 만들기** — 0062가 챌린지를 만들 때 개인 그룹을 자동 생성하므로
 *    사용자가 그룹을 손으로 만들 이유가 사라졌다.
 *  · **초대 코드 손입력** — 0061 이후 초대는 링크(`/invite/<코드>`)가 주 경로다.
 *    코드만 받은 사람은 주소창에 `/invite/<코드>`를 넣으면 되고, 프로필이 생긴
 *    뒤에는 그 링크가 바로 친구를 맺는다.
 *
 * 되살리려면 그 두 전제가 아직 참인지 먼저 확인해라.
 */
type Step = "profile" | "done";

/**
 * 온보딩 (설계 §4.2).
 *
 * ⚠️⚠️ **첫 화면은 카카오·구글 두 버튼이다. 닉네임 입력은 기본으로 안 보인다.**
 * 3차 결정(2026-08-08) — *"처음부터 가입할 때 카카오·구글로 가는 게 더 안전한
 * 방법인 것 같음."*
 *
 * 왜 닉네임 경로를 첫 화면에서 뺐나: 같은 카카오는 GND 계정 **하나에만** 붙는다.
 * 닉네임으로 시작해 기록을 쌓다가, 그 사이 다른 기기에서 카카오로 시작해 버리면
 * 그 카카오는 빈 계정이 가져간다 → 원래 계정에 붙이려 하면 `identity_already_exists`
 * 이고 **기록은 옮겨지지 않는다.** "나중에 연결하면 된다"가 항상 되는 게 아니다.
 *
 * ⚠️ 그래도 **지우지는 않았다.** `enabledProviders()`가 빈 배열일 때만 닉네임
 * 입력이 뜬다 — 카카오 장애나 설정 사고로 플래그를 꺼야 할 때 이게 없으면
 * **신규 가입이 0이 된다.** 사용자에겐 안 보이는 비상구다.
 *
 * ⚠️ 주 버튼은 닉네임을 요구하지 않는다. 리다이렉트로 화면을 떠나므로 입력한
 * 값이 사라진다. 닉네임은 **돌아온 뒤**(모드 2) 받는다.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { userId, loading, configured } = useAuth();

  const [step, setStep] = useState<Step>("profile");
  const [nickname, setNickname] = useState("");
  // /invite/[code]로 들어온 경우 저장된 코드를 미리 채움
  const [joinCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : (peekPendingInvite() ?? ""),
  );
  // 챌린지 초대 링크(/challenge?join=CODE)로 들어온 경우. 이 사람은 크루가
  // 아니라 **챌린지**에 초대받은 것이라 크루 선택 단계가 통째로 무의미하다.
  // 0091: 코드와 **초대자**를 같이 꺼낸다. 초대자는 서버가 검증하므로 여기서는
  // 그대로 나르기만 한다.
  const [pendingInvite] = useState<{ code: string; by: string | null } | null>(
    () => (typeof window === "undefined" ? null : peekPendingChallengeInviteDetail()),
  );
  const challengeCode = pendingInvite?.code ?? "";

  /**
   * 신원이 붙어 있는가 = 모드 2인가.
   *
   * ⚠️ 쿼리스트링으로 판정하지 않는다. 새로고침·뒤로가기로 쉽게 어긋나고, 이미
   * 그 방식으로 한 번 샌 전례가 있다(`challenge/page.tsx`의 `join` 정리).
   * `null`은 "아직 모름" — 그동안은 아무 버튼도 그리지 않는다. 안 그러면 모드 1이
   * 한 프레임 번쩍이고 모드 2로 바뀐다.
   */
  const [linked, setLinked] = useState<boolean | null>(null);
  const [linking, setLinking] = useState<OAuthProvider | null>(null);
  const providers = enabledProviders();

  const [doneInfo, setDoneInfo] = useState<
    | { mode: "join"; crewName: string }
    | { mode: "friend"; nickname: string; alreadyFriends: boolean }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⚠️⚠️ **여기서 `clearPendingInvite()`를 부르지 마라.** 2026-08-08까지 마운트에서
  //    지웠는데, 초대로 온 사람도 카카오·구글을 먼저 거치도록 바뀌면서 그게
  //    치명적이 됐다 — 제공자로 떠났다가 돌아오면 화면이 **다시 마운트**되고,
  //    그때는 코드가 이미 지워져 있어 **친구 초대 링크가 통째로 증발한다.**
  //    챌린지 코드가 성공한 뒤에만 지워지는 것과 규칙을 맞춘다(아래 submitProfile).

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const ids = await getMyIdentities();
        if (!cancelled) setLinked(ids.length > 0);
      } catch {
        // 조회 실패는 모드 1로 둔다 — 주 버튼을 다시 눌러 볼 수 있다.
        if (!cancelled) setLinked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  /**
   * ⚠️⚠️ **이미 가입한 사람은 이 화면에 머물지 않는다** (D8, 2026-08-09).
   *
   * 이 화면은 `(tabs)` 밖이라 `OnboardingGate`가 없다. 그래서 프로필이 있는
   * 사람이 주소를 치거나 링크를 타고 들어오면 그냥 열리는데, 신원이 이미 붙어
   * 있으므로 **닉네임 칸**이 뜬다. 거기서 저장하면 `upsertMyProfile`이
   * (`crew.ts:23`) `nickname`뿐 아니라 **`avatar_url`·`weekly_goal`·`timezone`까지
   * 기본값으로 덮어쓴다** — 이모지와 주간 목표가 조용히 초기화된다.
   * 공지에 온보딩 링크를 넣지 못한 이유가 이것이었다.
   *
   * ⚠️ 마운트에서 **한 번만** 본다(`profileChecked`). 매번 보면 아래
   * `submitProfile`이 프로필을 만든 직후 이 검사가 다시 돌아 친구 초대의
   * `done` 화면(`친구가 됐어요!`)에서 사용자를 쫓아낸다.
   *
   * ⚠️ 조회에 실패하면 **보내지 않는다.** 기존 사용자를 잘못 튕기는 쪽이,
   * 신규 사용자가 온보딩을 한 번 늦게 보는 것보다 훨씬 나쁘다 —
   * `OnboardingGate`가 같은 이유로 같은 선택을 한다(`onboarding-gate.tsx:57`).
   */
  const profileChecked = useRef(false);
  useEffect(() => {
    if (!configured || loading || !userId || profileChecked.current) return;
    profileChecked.current = true;
    let cancelled = false;
    void (async () => {
      let existing;
      try {
        existing = await getMyProfile(userId);
      } catch {
        return; // 못 읽었으면 그대로 둔다
      }
      if (cancelled || !existing) return;
      // 챌린지 초대를 들고 온 기존 사용자는 그 챌린지로 이어 보낸다.
      // 홈으로 떨어뜨리면 초대가 조용히 사라진다(`/auth/callback`과 같은 규칙).
      // 0091: 초대자도 같이 실어 보낸다. 안 실으면 이 경로를 거친 사람만
      // 초대자를 잃는다 — 기존 사용자는 크루 연결이 없어 티가 안 나지만,
      // 링크가 반쪽이 되는 것을 남겨 두면 다음에 신입 경로로 새어 들어온다.
      router.replace(pendingChallengeInvitePath() ?? APP_LANDING_PATH);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, router]);

  async function startWithProvider(provider: OAuthProvider) {
    if (linking) return;
    setLinking(provider);
    setError(null);
    try {
      // ⚠️ linkIdentity다. signInWithOAuth를 쓰면 AuthProvider가 방금 발급한
      //    익명 계정을 버리고 새 계정으로 갈아탄다(설계 §5.4).
      await linkProvider(provider);
    } catch (e) {
      setError(identityError(e));
      setLinking(null);
    }
  }

  async function submitProfile() {
    if (!userId) return;
    const nick = nickname.trim();
    if (!nick) {
      setError("닉네임을 입력해주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 이모지·주간목표는 여기서 묻지 않는다(§4.2). 컬럼이 not null이라 기본값을
      // 반드시 넣고, 바꾸는 자리는 `/profile`의 프로필 편집 시트다(§4.3).
      await upsertMyProfile({
        id: userId,
        nickname: nick,
        avatar_url: DEFAULT_AVATAR,
        weekly_goal: DEFAULT_WEEKLY_GOAL,
      });

      // 챌린지 초대로 온 사람은 크루 단계를 통째로 건너뛴다.
      if (challengeCode) {
        let challengeId: string;
        try {
          // 0063: 방금 프로필을 만든 사람은 **신입**이라 방장과 친구까지 맺는다.
          // ⚠️ 폴백을 빼지 마라 — 신입이 아닌 사람이 이 흐름에 올 수 있고,
          //    폴백이 없으면 그 사람은 챌린지에 아예 못 들어간다.
          let joined;
          try {
            joined = await joinChallengeAsNewcomer(
              challengeCode,
              pendingInvite?.by,
            );
          } catch (e) {
            if (!isNotNewcomer(e)) throw e;
            joined = await joinChallengeWithCode(challengeCode);
          }
          challengeId = joined.challengeId;
          const hostNick =
            "hostNickname" in joined ? joined.hostNickname : undefined;
          saveOnboardingNotice(
            joined.crewLinked > 0 && hostNick
              ? `${joined.challengeName}에 참가하고 ${hostNick}님과 친구가 됐어요 🤝`
              : `${joined.challengeName}에 참가했어요! 목표를 세워 주세요 🎯`,
          );
        } catch (e) {
          // ⚠️⚠️ **`catch {}`로 되돌리지 마라.** 원인을 버리면 화면이 거짓말을 한다
          //    — `초대 링크를 다시 확인해 주세요`가 코드·상태·중복참가를 전부
          //    뭉개서, 링크가 멀쩡한데 링크를 의심하게 만들었다(2026-08-08 실측).
          const { message, recoverable } = challengeJoinError(e);
          if (recoverable) {
            // 다시 눌러 볼 값어치가 있는 실패(네트워크 등)만 화면에 붙잡아 둔다.
            setError(message);
            return;
          }
          // ⚠️ 되돌릴 수 없는 실패면 **가입은 이미 끝났다.** 여기서 붙잡아 두면
          //    사용자가 온보딩에 갇힌다 — 이 화면은 `(tabs)` 밖이라
          //    `OnboardingGate`가 없어서 새로고침해도 못 나간다(2026-08-08 실측).
          //    친구 초대 경로가 이미 같은 이유로 홈에 보내고 있었다.
          // ⚠️ 코드도 지운다. 남겨두면 이 브라우저의 **다음 가입**까지
          //    "챌린지에 초대받았어요"로 열려 같은 실패를 반복한다.
          clearPendingChallengeInvite();
          saveOnboardingNotice(message);
          router.replace(APP_LANDING_PATH);
          return;
        }
        clearPendingChallengeInvite();
        // 링크를 만든 **그 챌린지**로 데려간다. 여러 개를 만들 수 있게 된 뒤로
        // `/challenge`만 열면 대표 챌린지가 잡혀 엉뚱한 방이 보일 수 있다.
        router.replace(`/challenge?open=${challengeId}`);
        return;
      }

      // 친구 초대 링크로 진입했으면 그 자리에서 친구를 맺는다.
      // ⚠️ 옛 그룹 코드는 `redeemInviteCode`가 하위 호환으로 받는다(설계 §3.3).
      if (joinCode) {
        try {
          const redeemed = await redeemInviteCode(joinCode);
          // 다 쓴 코드는 여기서 지운다. ⚠️ 마운트에서 지우면 카카오·구글 왕복 뒤
          //    다시 마운트될 때 이미 없어서 **링크가 증발한다**(위 주석 참조).
          clearPendingInvite();
          setDoneInfo(
            redeemed.kind === "friend"
              ? {
                  mode: "friend",
                  nickname: redeemed.nickname,
                  alreadyFriends: redeemed.alreadyFriends,
                }
              : { mode: "join", crewName: redeemed.groupName },
          );
          setStep("done");
          return;
        } catch {
          // 링크가 깨졌어도 **가입은 끝났다.** 여기서 붙잡아 두지 않고 홈으로
          // 보낸다 — 프로필이 생긴 뒤에는 같은 링크를 다시 눌렀을 때
          // `/invite/[code]`가 바로 친구를 맺어 주므로 되돌릴 수 있다.
          // ⚠️ 그래서 코드는 **지우지 않는다.** 다시 누르면 살아난다.
          router.replace(APP_LANDING_PATH);
          return;
        }
      }

      router.replace(APP_LANDING_PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <Shell>
        <p className="text-sm text-warn">
          Supabase 설정이 필요합니다 (.env.local)
        </p>
      </Shell>
    );
  }

  if (loading || !userId) {
    return (
      <Shell>
        <p className="text-sm text-muted">신원 확인 중…</p>
      </Shell>
    );
  }

  /**
   * ⚠️⚠️ **초대로 온 사람도 카카오·구글을 먼저 거친다** (사용자 지시 2026-08-08 —
   * *"모든 유저는 카카오/구글 회원 가입 > 닉네임 세팅하기 > 홈 or 챌린지"*).
   *
   * 옛 동작은 `invited || providers.length === 0`이었다. 초대 링크로 온 사람에게는
   * 가입 선택지를 건너뛰고 닉네임만 물었는데, 그러면 그 사람은 **소셜 신원이 하나도
   * 없는 브라우저 전용 계정**으로 GND를 시작한다 — 브라우저를 지우면 기록·XP·배지가
   * 사라지는, 배치 3이 통째로 없애려던 그 상태다. 초대로 들어온 사람이야말로
   * 친구가 부른 사람이라 오래 남는데, 가장 약한 계정을 쥐여주고 있었다.
   *
   * ⚠️ `providers.length === 0`은 **남겨 둔다.** 카카오·구글이 동시에 죽거나
   * 플래그를 꺼야 할 때 이게 없으면 **신규 가입이 0이 된다.** 2026-08-08에 카카오가
   * KOE205로 실제로 죽었다 — 가정이 아니다.
   */
  const mustAskNickname = providers.length === 0;
  const showNicknameStep = mustAskNickname || linked === true;
  const waiting = !mustAskNickname && linked === null;

  return (
    <Shell
      hero={step === "profile"}
      // 판정 전(`waiting`)에는 넣지 않는다 — 위 Shell 주석 참조
      screen={waiting ? undefined : showNicknameStep ? "nickname" : "onboarding"}
    >
      {step === "profile" && (
        <>
          {waiting ? (
            <p className="mt-6 text-sm text-muted">확인 중…</p>
          ) : showNicknameStep ? (
            <>
              <Tagline>운동 안 하면 GND 확정. 친구들과 함께 탈출해요.</Tagline>
              {/* ⚠️ 옛 문구는 `반가워요!` / `이름만 정하면 시작해요`였다
                  (2026-08-10 사용자 지시로 교체 — "게임에서 사용할 닉네임
                  정하세요라는 의미의 마케팅 요소를 가미해서"). 첫 화면이
                  `게임에 참가하시겠습니까?`로 묻고 끝나서, 돌아온 사람에게는
                  **그 게임이 시작됐다는 답**이 먼저 와야 한다.

                  ⚠️ 두 줄 모두 **26px에서 한 줄에 들어가는 길이**로 유지하라.
                  넘치면 제목이 3줄이 되면서 아래 블록이 통째로 밀리고, 히어로가
                  flex-shrink로 더 눌려 그림이 더 잘린다
                  (`docs/design-sources/onboarding-canvas-spec.md` §2). */}
              <Title
                white={challengeCode ? "챌린지에 초대받았어요 🏆" : "GND 탈출 게임 시작!"}
                gold={
                  challengeCode ? "닉네임만 정하면 참가해요" : "닉네임부터 정하세요"
                }
              />
              <ShieldLine>
                GND에서 친구들에게 보여질 이름이에요.
                <br />
                언제든 바꿀 수 있어요.
              </ShieldLine>

              <NicknameField value={nickname} onChange={setNickname} />

              <GoldCta onClick={submitProfile} busy={busy}>
                {challengeCode ? "챌린지 참가하기" : "GND 시작하기"}
              </GoldCta>
            </>
          ) : (
            <>
              {/* ⚠️ 옛 문구는 `닉네임만 정하면 바로 시작해요`였다. 3차 결정으로 이
                  화면에서 닉네임 칸이 빠졌는데 문구만 남아 **화면이 거짓말을 했다**
                  (2026-08-08 사용자 지적). 여기서 하는 일은 "계정을 고르는 것"이고,
                  닉네임은 돌아온 뒤(모드 2)에 묻는다. */}
              {/* ⚠️ 여기에 글줄을 더 넣지 마라. 2026-08-08에 사용자 지시로 두 줄을
                  뺐다 — 큰 제목(`탭 한 번으로 / 바로 시작해요`)과 방패 줄
                  (`기록·배지가 안전하게 지켜져요`). 그림이 이미 할 말을 다 하고
                  있어서, 글자를 얹을수록 포털을 가리기만 한다. 태그라인 한 줄이면
                  충분하다. */}
              {/* 옛 문구는 `운동 안 하면 GND 확정. / 친구들과 함께 탈출해요.`였다
                  (2026-08-08 사용자 지시로 교체). 첫 화면에서 하는 일은 "들어올지
                  고르는 것"이라 초대하는 말이 맞다. */}
              <Tagline big>게임에 참가하시겠습니까?</Tagline>

              <div className="mt-5 flex flex-col gap-2.5">
                {providers.map((p, i) => (
                  <GoldCta
                    key={p}
                    onClick={() => void startWithProvider(p)}
                    busy={linking !== null}
                    // 첫 번째만 채운 금색, 나머지는 테두리 — 둘 다 채우면 무엇을
                    // 먼저 눌러야 할지 안 보인다. 순서는 `ALL_PROVIDERS`가 정한다.
                    variant={i === 0 ? "solid" : "outline"}
                    flush
                  >
                    {linking === p
                      ? "이동 중…"
                      : `${PROVIDER_META[p].short}로 시작하기`}
                  </GoldCta>
                ))}
              </div>
            </>
          )}

          {/* 세션이 끊겨 온보딩으로 떨어진 기존 사용자의 탈출구. 여기서 새로
              시작하면 새 계정이 생겨 기존 기록과 분리된다.

              ⚠️ **챌린지 초대일 때 숨기지 마라** (2026-08-08에 되살렸다).
              옛 코드는 `!challengeCode`로 가렸는데, 초대로 온 사람도 카카오·구글을
              거치게 된 뒤로 그게 막다른 길이 됐다 — 기존 사용자가 새 기기에서
              챌린지 링크를 타면 카카오를 눌러도 `identity_already_exists`로
              막히고(그 카카오는 본인 계정에 이미 붙어 있다) 나갈 문이 없다.
              로그인하면 `/login`이 보관된 코드를 보고 챌린지로 데려간다. */}
          <Link
            href="/login"
            className="mt-5 block text-[13px] text-muted underline"
          >
            이미 계정이 있나요? 로그인
          </Link>
        </>
      )}

      {step === "done" && doneInfo && (
        <>
          <div className="text-5xl">
            {doneInfo.mode === "friend" ? "🤝" : "🎉"}
          </div>
          {/* ⚠️ `friend`를 "크루 참여 완료"로 뭉개지 마라 (0061). 초대 링크는 이제
              그룹이 아니라 **친구**를 맺으므로, 그렇게 쓰면 화면이 거짓말을 한다.
              같은 이유로 크루 이름을 말하지 않는다 — 그룹에 들어간 게 아니다. */}
          <h1 className="mt-3 text-xl font-extrabold">
            {doneInfo.mode === "friend"
              ? doneInfo.alreadyFriends
                ? "이미 친구예요"
                : "친구가 됐어요!"
              : "크루 참여 완료!"}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {doneInfo.mode === "friend"
              ? `${doneInfo.nickname}님과 서로의 기록을 보고 콕 찌를 수 있어요.`
              : `이제 "${doneInfo.crewName}"의 GND 챌린지에 함께해요. 각자 목표를 세우면 시작!`}
          </p>

          <div className="mt-6">
            <Primary onClick={() => router.replace(APP_LANDING_PATH)}>
              GND 시작하기
            </Primary>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-warn">{error}</p>}
    </Shell>
  );
}

/**
 * 시안의 히어로 아트 (`어플 UI 이미지/온보딩 히어로.png` → `scripts/make-onboarding-assets.py`).
 *
 * ⚠️ 문구가 **없는** 그림이다. 시안에는 글자가 박힌 버전도 있는데 그건 쓰지 않는다 —
 * 글자를 그림에 구우면 문구를 고칠 때마다 이미지를 다시 만들어야 하고, 화면 낭독기가
 * 읽지 못하며, 번역도 못 한다. 문구는 HTML로 얹는다.
 *
 * ⚠️ **작은 카드로 띄우지 마라** (2026-08-08 사용자 지적 — "너무 부자연스러운데?").
 * 처음엔 `max-w-[240px]` + 둥근 모서리로 넣었더니, 검은 화면 한가운데 사진이
 * 한 장 떠 있는 꼴이 됐다. 시안은 **화면 전체를 채우는 포털 그림**이다.
 * 그래서 컨테이너 폭을 꽉 채우고, 아래쪽을 배경색으로 녹여 그림이 끝나는 선을
 * 지운다 — 그래야 "붙인 사진"이 아니라 "화면"으로 읽힌다.
 *
 * ⚠️ 세로를 그림 비율(1:1.78) 그대로 두면 데스크톱에서 버튼이 접혀 스크롤이 생긴다.
 * `max-h`로 잘라내고 `object-cover`로 가운데(포털)를 남긴다.
 *
 * `priority`가 있어야 첫 화면에서 늦게 뜨지 않는다.
 */
/**
 * 전체 화면 배경 아트 (2026-08-08 사용자 제안).
 *
 * *"불독·황금문·GND는 그대로 두고 나머지를 공백으로 남기고 그 위에 텍스트를
 * 추가하면 되지 않아?"* — 그렇게 한다. 자산이 **9:16 한 장**이고 아트는 위 55%,
 * 아래 45%는 빈 검정이다. 그 빈 자리에 문구·입력칸·버튼이 HTML로 올라간다.
 *
 * ⚠️ 그래서 이건 "위에 붙인 사진"이 아니라 **화면 배경**이다. 문서 흐름에서 빼고
 * (`absolute inset-0`) 내용은 그 위에 얹는다. 예전처럼 블록으로 두면 아래 45%
 * 검정이 내용을 밀어내 화면이 두 배로 길어진다.
 *
 * ⚠️ `object-top`이어야 한다. 화면이 짧으면 **아래 검정만 잘리고** 아트는 그대로
 * 남는다. `object-center`면 골드 문이 잘린다 — 사용자가 지적했던 그 문제다.
 *
 * 규격은 `docs/design-sources/onboarding-hero-prompt.md`의 "전체 화면 한 장".
 */

/**
 * 아래는 시안(`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)의 조각들이다.
 *
 * ⚠️ **시안의 글자를 그림에서 가져오지 않고 HTML로 얹는다** (사용자 확인 2026-08-08 —
 * "이미지 위에 HTML로 넣고 색상도 동일하게"). 그림에 글자를 구우면 문구를 고칠
 * 때마다 이미지를 다시 만들어야 하고, 화면 낭독기가 못 읽고, 줄바꿈이 기기 폭에
 * 맞춰지지 않는다. 색만 시안과 맞춘다 — 금색은 `--accent`(#e8b84b)다.
 */

/**
 * ⚠️ 이 화면의 금색은 앱 공용 `--accent`(#e8b84b)가 **아니다.**
 *
 * 2026-08-08 사용자 지적: *"글자색도 너무 노란색이 아니라 고급진 골드색이잖아.
 * 뭔가 초기 화면에 뭔가 고급지고 신비로운 느낌이 나야 함."* 맞는 지적이라
 * 시안 원본(`블랙 골드 GND 탈출 포털 로그인 화면.png`)에서 **화소를 직접 떠서**
 * 맞췄다. 눈으로 고른 값이 아니다.
 *
 * | 자리 | 시안 실측 | 공용 accent |
 * |---|---|---|
 * | 태그라인 | `#d8ab74` | `#e8b84b` (더 노랗다) |
 * | 제목 금색 | `#f5e6b0`→`#b1843f` 금속 그라데이션 | 단색 |
 * | CTA | `#c9965b`→`#7a5329` 앤티크 골드 | 밝은 노랑 |
 *
 * ⚠️ 공용 `--accent`를 이 값으로 바꾸지 마라. 앱 전체(버튼·배지·차트)가 그걸 쓰고
 * 있어서, 이 화면 하나 때문에 나머지가 전부 어두워진다. 여기서만 지역적으로 쓴다.
 */

/** 시안 맨 윗줄 — 금색 작은 글씨 */
function Tagline({
  children,
  big,
}: {
  children: React.ReactNode;
  big?: boolean;
}) {
  // 아트 아래끝과 첫 줄 사이 숨 쉴 자리. 붙으면 발판 글로우에 글자가 묻힌다.
  //
  // `big`은 첫 화면(모드 1) 전용이다. 거기서는 큰 제목과 방패 줄을 뺐으므로
  // (2026-08-08 사용자 지시) 이 한 줄이 화면의 유일한 문구다 — 작으면 그림에
  // 묻힌다. 나머지 화면은 위에 제목이 따로 있어서 작게 둔다.
  return (
    <p
      className={
        big
          ? "mt-4 text-[19px] leading-[1.45] font-bold"
          : "mt-3 text-[12.5px]"
      }
      style={{ color: GOLD_TEXT }}
    >
      {children}
    </p>
  );
}

/**
 * 시안의 두 줄 제목 — 첫 줄 흰색, 둘째 줄 **금속 금색**.
 *
 * 단색으로 칠하면 그냥 노란 글씨가 된다. 위에서 아래로 밝은 금 → 짙은 금으로
 * 흐르게 해야 금속으로 읽힌다(`bg-clip-text`). 뒤에 은은한 후광을 한 겹 깔아
 * 포털에서 빛이 새어 나오는 느낌을 잇는다.
 */
function Title({ white, gold }: { white: string; gold: string }) {
  return (
    <div className="relative mt-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 h-32 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(216,171,116,0.16), transparent 70%)",
        }}
      />
      <h1 className="relative text-[26px] leading-[1.25] font-extrabold tracking-tight">
        <span className="block">{white}</span>
        <span
          className="block bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #f7e9c0 0%, #dcb877 45%, #b1843f 100%)",
          }}
        >
          {gold}
        </span>
      </h1>
    </div>
  );
}

/** 방패 아이콘 + 설명 두 줄 */
function ShieldLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start justify-center gap-2 text-[12.5px] leading-relaxed text-muted">
      <UiIcon name="shield-check" size={18} className="mt-0.5" />
      <span className="text-left">{children}</span>
    </p>
  );
}

/**
 * 시안의 금테 입력칸 — 칸 안 왼쪽 위에 라벨이 뜬다.
 *
 * ⚠️ 라벨을 placeholder로만 두지 마라. 입력을 시작하면 placeholder가 사라져서
 * **무엇을 넣는 칸인지 알 수 없게 된다.** 시안이 라벨을 칸 안에 넣은 이유다.
 */
function NicknameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="mt-5 rounded-2xl border px-4 pt-3 pb-1 text-left"
      style={{
        borderColor: "rgba(201,150,91,0.45)",
        backgroundColor: "rgba(201,150,91,0.05)",
      }}
    >
      <label
        htmlFor="onboarding-nickname"
        className="text-[11.5px] font-bold"
        style={{ color: GOLD_TEXT }}
      >
        닉네임
      </label>
      <input
        id="onboarding-nickname"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 스칼레또"
        maxLength={20}
        style={{ borderColor: "rgba(201,150,91,0.3)" }}
        className="mt-1.5 w-full border-b bg-transparent pb-2.5 text-[15px] outline-none placeholder:text-faint"
      />
    </div>
  );
}


/**
 * ⚠️ 이 화면은 **그림이 두 장**이다. 모드 1(제공자 버튼)과 닉네임 단계는 글자 양이
 * 달라서(텍스트 블록 220px vs 374px) 아트에 남는 세로가 1.52u와 1.09u로 다르다.
 * 한 장을 둘 다에 쓰면 짧은 쪽에서 글자가 그림을 덮는다
 * (`docs/design-sources/onboarding-canvas-spec.md` §5-2).
 *
 * ⚠️ `screen`과 `hero`가 따로인 이유: 신원을 조회하는 동안(`waiting`)에는 **어느
 * 쪽인지 아직 모른다.** 그때 아무 그림이나 깔면 곧바로 다른 그림으로 바뀌어
 * 번쩍인다 — 레이아웃만 잡고 그림은 판정된 뒤에 넣는다.
 *
 * ⚠️ 글자 쪽 `relative`를 빼지 마라. 음수 z-index로 그림을 내리면 조상의 `bg-bg`
 * 뒤로 들어가 **그림이 통째로 사라진다**(`hero-art.tsx` 주석).
 */
function Shell({
  children,
  hero,
  screen,
}: {
  children: React.ReactNode;
  hero?: boolean;
  screen?: ScreenArtKey;
}) {
  return (
    <main
      className={`relative flex flex-1 flex-col overflow-y-auto text-center ${
        hero ? "pb-8" : "justify-center pb-10"
      }`}
    >
      {hero && screen && <ScreenArt screen={screen} />}
      <div
        className={`relative mx-auto w-full max-w-sm px-6 ${hero ? "mt-auto" : ""}`}
      >
        {children}
      </div>
    </main>
  );
}


function Primary({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-4 w-full rounded-full bg-accent px-4 py-3.5 text-[15px] font-bold text-accent-ink disabled:opacity-60"
    >
      {busy ? "처리 중…" : children}
    </button>
  );
}

