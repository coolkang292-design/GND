"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/ui-icon";
import { HeroArt } from "@/components/brand/hero-art";
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
  clearPendingChallengeInvite,
  isNotNewcomer,
  joinChallengeAsNewcomer,
  joinChallengeWithCode,
  peekPendingChallengeInvite,
  saveOnboardingNotice,
} from "@/lib/challenge";
// ⚠️ `joinGroupWithCode`를 직접 부르지 않는다. 코드가 친구 것인지 그룹 것인지
//    가리는 2단계는 `redeemInviteCode` 한 곳에만 있어야 한다(설계 §3.3).
import {
  clearPendingInvite,
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
  const [challengeCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : (peekPendingChallengeInvite() ?? ""),
  );

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

  useEffect(() => {
    clearPendingInvite();
  }, []);

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
        try {
          // 0063: 방금 프로필을 만든 사람은 **신입**이라 방장과 친구까지 맺는다.
          // ⚠️ 폴백을 빼지 마라 — 신입이 아닌 사람이 이 흐름에 올 수 있고,
          //    폴백이 없으면 그 사람은 챌린지에 아예 못 들어간다.
          let joined;
          try {
            joined = await joinChallengeAsNewcomer(challengeCode);
          } catch (e) {
            if (!isNotNewcomer(e)) throw e;
            joined = await joinChallengeWithCode(challengeCode);
          }
          const hostNick =
            "hostNickname" in joined ? joined.hostNickname : undefined;
          saveOnboardingNotice(
            joined.crewLinked > 0 && hostNick
              ? `${joined.challengeName}에 참가하고 ${hostNick}님과 친구가 됐어요 🤝`
              : `${joined.challengeName}에 참가했어요! 목표를 세워 주세요 🎯`,
          );
        } catch {
          setError(
            "챌린지에 참가하지 못했어요. 초대 링크를 다시 확인해 주세요.",
          );
          return;
        }
        clearPendingChallengeInvite();
        router.replace("/challenge");
        return;
      }

      // 친구 초대 링크로 진입했으면 그 자리에서 친구를 맺는다.
      // ⚠️ 옛 그룹 코드는 `redeemInviteCode`가 하위 호환으로 받는다(설계 §3.3).
      if (joinCode) {
        try {
          const redeemed = await redeemInviteCode(joinCode);
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
          router.replace("/home");
          return;
        }
      }

      router.replace("/home");
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

  // 챌린지·친구 링크로 온 사람은 이미 "왜 왔는지"가 정해져 있다. 그 사람에게
  // 가입 선택지를 다시 보여주면 초대와 무관한 화면이 된다.
  const invited = Boolean(challengeCode || joinCode);
  // 초대로 왔거나 제공자가 없으면 신원 조회를 **기다릴 이유가 없다.** 기다리면
  // 초대 링크를 탭한 사람이 "확인 중…"을 한 번 보고 넘어간다.
  const mustAskNickname = invited || providers.length === 0;
  const showNicknameStep = mustAskNickname || linked === true;
  const waiting = !mustAskNickname && linked === null;

  return (
    <Shell hero={step === "profile"}>
      {step === "profile" && (
        <>
          {waiting ? (
            <p className="mt-6 text-sm text-muted">확인 중…</p>
          ) : showNicknameStep ? (
            <>
              <Tagline>운동 안 하면 GND 확정. 친구들과 함께 탈출해요.</Tagline>
              <Title
                white={challengeCode ? "챌린지에 초대받았어요 🏆" : "반가워요!"}
                gold={
                  challengeCode ? "닉네임만 정하면 참가해요" : "이름만 정하면 시작해요"
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
              <Tagline big>
                운동 안 하면 GND 확정.
                <br />
                친구들과 함께 탈출해요.
              </Tagline>

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
              시작하면 새 계정이 생겨 기존 기록과 분리된다. */}
          {!challengeCode && (
            <Link
              href="/login"
              className="mt-5 block text-[13px] text-muted underline"
            >
              이미 계정이 있나요? 로그인
            </Link>
          )}
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
            <Primary onClick={() => router.replace("/home")}>
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


function Shell({
  children,
  hero,
}: {
  children: React.ReactNode;
  hero?: boolean;
}) {
  return (
    <main
      className={`flex flex-1 flex-col overflow-y-auto text-center ${
        hero ? "pb-8" : "justify-center pb-10"
      }`}
    >
      {hero && <HeroArt />}
      <div className="mx-auto w-full max-w-sm px-6">{children}</div>
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

