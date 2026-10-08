"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_LANDING_PATH } from "@/lib/domain/landing";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/ui/icon";
import {
  BrandWordmark,
  EntryFade,
  EntryPhoto,
  EntryShadow,
  EntryTopShade,
  LimeCta,
  ProviderButton,
} from "@/components/brand/entry";
import { ONBOARDING_COPY as COPY } from "@/lib/domain/brand-copy";
import { recordFunnelEvent } from "@/lib/analytics-events";
import { trackProduct } from "@/lib/posthog/track";
import { DEFAULT_AVATAR, DEFAULT_WEEKLY_GOAL } from "@/lib/domain/avatars";
import {
  PROVIDER_META,
  enabledProviders,
  getMyIdentities,
  identityError,
  linkFailureCode,
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
   * 온보딩 화면을 **실제로 봤다**는 기록 (배포 D).
   *
   * ⚠️ 신원 판정 중(`linked === null`)에는 기록하지 않는다. 그동안 화면은
   *    `확인 중…`이라 아직 아무것도 안 보여준 상태이고, 거기서 나간 사람을
   *    "온보딩을 봤다"로 세면 이탈률이 거짓이 된다.
   *    (카카오·구글이 둘 다 꺼져 있으면 판정 없이 바로 닉네임 칸이 뜨므로 예외다.)
   *
   * ⚠️ `onboarding_completed`는 만들지 않는다 — 그건 `profiles.created_at`이
   *    이미 정확히 안다(`upsertMyProfile` 한 번이 온보딩을 끝낸다).
   *    같은 사실을 두 곳에 저장하지 않는다. 감사표:
   *    docs/analytics/public-beta-funnel-audit.md
   */
  useEffect(() => {
    if (!configured || loading || !userId) return;
    const screenShown = providers.length === 0 || linked !== null;
    if (!screenShown) return;
    void recordFunnelEvent("onboarding_started", userId);
  }, [configured, loading, userId, linked, providers.length]);

  /**
   * 닉네임 단계가 실제로 노출된 순간 (PostHog 전용 — 이탈 구간 분리용).
   * DB에는 이벤트를 만들지 않는다(감사표: `identity_link` 성공 = 닉네임 화면 노출로 파생 가능).
   */
  useEffect(() => {
    if (!configured || loading || !userId || step !== "profile") return;
    if (!(providers.length === 0 || linked === true)) return;
    trackProduct(
      "onboarding_nickname_shown",
      {},
      {
        userId,
        dedupe: { key: "onboarding_nickname_shown", scope: "session" },
      },
    );
  }, [configured, loading, userId, step, linked, providers.length]);

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
    /*
      ⚠️ 퍼널에서 **가장 큰 공백이 여기다**(배포 D). "가입이 싫어서 안 눌렀다"와
         "눌렀는데 카카오가 죽어서 못 들어왔다"는 고칠 것이 완전히 다른데,
         지금까지 둘 다 똑같이 "정식 전환 안 됨"으로만 보였다.
      ⚠️ `await`하지 않는다 — 계측이 OAuth 이동을 한 프레임도 늦추면 안 된다.
    */
    void recordFunnelEvent("identity_link_started", userId, undefined, {
      provider,
    });
    try {
      // ⚠️ linkIdentity다. signInWithOAuth를 쓰면 AuthProvider가 방금 발급한
      //    익명 계정을 버리고 새 계정으로 갈아탄다(설계 §5.4).
      await linkProvider(provider);
    } catch (e) {
      setError(identityError(e));
      setLinking(null);
      // ⚠️ **분류 코드만 보낸다.** raw error 전문·스택·주소를 저장하지 않는다.
      void recordFunnelEvent("identity_link_failed", userId, linkFailureCode(e), {
        provider,
      });
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
      // 온보딩 완료 = 프로필 생성(`profiles.created_at`). 정답은 DB다 — 여기서는 PostHog에 복제만 남긴다.
      trackProduct(
        "onboarding_completed",
        { has_invite: Boolean(challengeCode || joinCode) },
        {
          userId,
          dedupe: { key: `onboarding_completed:${userId}`, scope: "persistent" },
        },
      );

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
        // `goal=joined`(2026-09-18): 방금 참가했으니 목표 설정을 바로 연다 —
        // "참여 → 주 몇 번 → 운동". 목표가 이미 있으면 챌린지 화면이 무시한다.
        router.replace(`/challenge?open=${challengeId}&goal=joined`);
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
    <Shell hero={step === "profile"}>
      {step === "profile" && (
        <>
          {waiting ? (
            <p className="relative mt-6 text-sm text-muted">확인 중…</p>
          ) : showNicknameStep ? (
            <>
              {/* ⚠️ 옛 문구는 `반가워요!` / `이름만 정하면 시작해요`였다
                  (2026-08-10 사용자 지시로 교체 — "게임에서 사용할 닉네임
                  정하세요라는 의미의 마케팅 요소를 가미해서"). 첫 화면이
                  들어올지를 묻고 끝나서, 돌아온 사람에게는 **시작됐다는 답**이
                  먼저 와야 한다. 문구는 그대로 두고 옷만 새 디자인으로 바꿨다(2026-10-06).

                  ⚠️ 두 줄 모두 **한 줄에 들어가는 길이**로 유지하라. 넘치면 제목이
                  3줄이 되면서 사진 위 인물을 덮는다. */}
              <Title
                white={challengeCode ? "챌린지에 초대받았어요" : "GND 탈출 게임 시작!"}
                lime={challengeCode ? "닉네임만 정하면 참가해요" : "닉네임부터 정하세요"}
              />
              <p className="relative mt-3 text-[14px] text-text/85">
                운동 안 하면 GND 확정. 친구들과 함께 탈출해요.
              </p>
              <ShieldLine>
                GND에서 친구들에게 보여질 이름이에요.
                <br />
                언제든 바꿀 수 있어요.
              </ShieldLine>

              <NicknameField value={nickname} onChange={setNickname} />

              <div className="relative mt-4">
                <LimeCta onClick={submitProfile} busy={busy}>
                  {busy ? "처리 중…" : challengeCode ? "챌린지 참가하기" : "GND 시작하기"}
                </LimeCta>
              </div>
            </>
          ) : (
            <>
              {/* 시안 1번(`onboarding-original-approved.png`) — 두 줄 제목(둘째 줄 라임) +
                  보조 두 줄 + 카카오·구글. 시안의 페이지 점 3개는 **뺐다**(사용자 결정
                  2026-10-06 — 넘길 장이 없는데 점을 두면 누를 수 없는 가짜 장치가 된다).

                  ⚠️ 옛 화면은 `게임에 참가하시겠습니까?` 한 줄 + 금색 버튼이었다(블랙 골드 포털). */}
              <Title white={COPY.headline[0]} lime={COPY.headline[1]} />
              <p className="relative mt-3.5 text-[15px] leading-[1.6] text-text/85">
                {COPY.subcopy.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>

              <div className="relative mt-7 flex flex-col gap-3">
                {/* 순서는 `ALL_PROVIDERS`가 정한다. 색은 각 회사 가이드(`ProviderButton`) */}
                {providers.map((p) => (
                  <ProviderButton
                    key={p}
                    provider={p}
                    onClick={() => void startWithProvider(p)}
                    disabled={linking !== null}
                    label={
                      linking === p
                        ? "이동 중…"
                        : `${PROVIDER_META[p].short}${COPY.providerSuffix}`
                    }
                  />
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
          <div className="relative mt-6 flex items-center gap-3 text-[13px] text-muted">
            <span aria-hidden className="h-px flex-1 bg-line-strong" />
            <span aria-hidden>{COPY.haveAccount}</span>
            <span aria-hidden className="h-px flex-1 bg-line-strong" />
          </div>
          <Link
            href="/login"
            aria-label={`${COPY.haveAccount} ${COPY.login}`}
            className="relative mx-auto mt-2.5 flex w-fit items-center gap-1.5 py-1 text-[16px] font-extrabold underline decoration-2 underline-offset-[6px]"
          >
            {COPY.login}
            <Icon name="arrow" size={18} strokeWidth={2.2} />
          </Link>
        </>
      )}

      {step === "done" && doneInfo && (
        <>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/50 bg-accent-weak text-accent">
            <Icon name={doneInfo.mode === "friend" ? "handshake" : "success"} size={32} strokeWidth={2} />
          </span>
          {/* ⚠️ `friend`를 "크루 참여 완료"로 뭉개지 마라 (0061). 초대 링크는 이제
              그룹이 아니라 **친구**를 맺으므로, 그렇게 쓰면 화면이 거짓말을 한다.
              같은 이유로 크루 이름을 말하지 않는다 — 그룹에 들어간 게 아니다. */}
          <h1 className="mt-4 text-[24px] font-black tracking-tight">
            {doneInfo.mode === "friend"
              ? doneInfo.alreadyFriends
                ? "이미 친구예요"
                : "친구가 됐어요!"
              : "크루 참여 완료!"}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {doneInfo.mode === "friend"
              ? `${doneInfo.nickname}님과 서로의 기록을 보고 콕 찌를 수 있어요.`
              : `이제 "${doneInfo.crewName}"의 GND 챌린지에 함께해요. 각자 목표를 세우면 시작!`}
          </p>

          <div className="mt-7">
            <LimeCta onClick={() => router.replace(APP_LANDING_PATH)}>GND 시작하기</LimeCta>
          </div>
        </>
      )}

      {error && <p className="relative mt-3 text-sm font-semibold text-danger">{error}</p>}
    </Shell>
  );
}

/**
 * 두 줄 제목 — 첫 줄 흰색, 둘째 줄 라임 (시안 1번).
 *
 * ⚠️ 한 줄 고정(`whitespace-nowrap`) + 폭 비례 크기. 시작 화면에서 `날에도`의 `도`가 다음 줄로
 *    떨어졌던 것과 같은 이유다 — 가장 긴 줄(`더 나은 나를 만든다`)이 360px 폭에서도 들어간다.
 */
function Title({ white, lime }: { white: string; lime: string }) {
  return (
    <h1 className="relative text-[clamp(2.05rem,9.6vw,2.6rem)] leading-[1.12] font-black italic tracking-[-0.05em]">
      <span className="block whitespace-nowrap">{white}</span>
      <span className="block whitespace-nowrap text-accent">{lime}</span>
    </h1>
  );
}

/** 방패 아이콘 + 설명 두 줄 */
function ShieldLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="relative mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
      <Icon name="shield" size={18} className="mt-0.5 text-accent" />
      <span>{children}</span>
    </p>
  );
}

/**
 * 닉네임 칸 — 칸 안 왼쪽 위에 라벨이 뜬다.
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
    <div className="relative mt-5 rounded-2xl border border-line-strong bg-surface/90 px-4 pt-3 pb-1 focus-within:border-accent">
      <label htmlFor="onboarding-nickname" className="text-[12px] font-extrabold text-accent">
        닉네임
      </label>
      <input
        id="onboarding-nickname"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 스칼레또"
        maxLength={20}
        className="mt-1 w-full bg-transparent pb-2.5 text-[16px] outline-none placeholder:text-faint"
      />
    </div>
  );
}

/**
 * 화면 틀. `hero`면 위에 사진을 깔고 글자 블록을 **아래에 붙인다**(`mt-auto`).
 *
 * ⚠️ 제공자 단계와 닉네임 단계가 **같은 사진**이다(옛 화면은 글자 양에 맞춘 그림이 두 장이라
 *    신원 판정 전에는 그림을 못 깔았다). 이제 판정 중에도 사진을 깔아 둔다 — 번쩍일 것이 없다.
 * ⚠️ 글자 쪽 `relative`를 빼지 마라. 사진은 `absolute`라 DOM 순서로 덮어야 글자가 위에 온다
 *    (음수 z-index는 조상의 `bg-bg` 뒤로 내려가 사진이 통째로 사라진다).
 */
function Shell({
  children,
  hero,
}: {
  children: React.ReactNode;
  hero?: boolean;
}) {
  if (!hero) {
    return (
      <main className="relative flex flex-1 flex-col justify-center overflow-y-auto px-6 pb-10 text-center">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
    );
  }
  return (
    <main className="relative flex flex-1 flex-col overflow-y-auto text-left">
      <header
        className="relative z-10 px-6"
        style={{ paddingTop: "max(2rem, calc(env(safe-area-inset-top) + 1rem))" }}
      >
        <EntryTopShade />
        <BrandWordmark slogan />
      </header>
      <div
        className="relative mt-auto w-full px-6 pt-10"
        style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}
      >
        {/* 사진 속 손·밧줄(폭의 약 135% 지점)이 블록 윗변 아래 9.5rem — **보조 문구 뒤** — 에 오게 놓는다.
            ⚠️ 6.5rem이던 때는 아래팔·밧줄이 제목 **위로** 드러났다(2026-10-06 사용자 지적 "어색하니까
            글자를 키우고 위치를 올리고 어색한 부분을 검정 그림자로"). 그래서 ① 사진을 내려 제목이
            아래팔을 덮게 하고 ② 제목을 키우고 ③ 제목 위 띠를 `EntryShadow`로 검게 누른다. */}
        <EntryPhoto src={ONBOARDING_PHOTO} top="9.5rem" lift="-135%" />
        <EntryFade reach="-top-40" />
        <EntryShadow />
        {children}
      </div>
    </main>
  );
}

/** 시작 화면과 같은 사진(글자 없는 판). 시안 1번의 인물 사진이다. */
const ONBOARDING_PHOTO = "/gnd/photos/onboarding-sweat-860.webp";
