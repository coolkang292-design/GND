"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
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
  createGroup,
  peekPendingInvite,
  redeemInviteCode,
  upsertMyProfile,
} from "@/lib/crew";

const AVATARS = [
  "🧔",
  "🧑",
  "👦",
  "👩",
  "🤓",
  "💁‍♀️",
  "🤵",
  "🧗",
  "🏃",
] as const;

type Step = "profile" | "crew" | "create" | "join" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const { userId, loading, configured } = useAuth();

  const [step, setStep] = useState<Step>("profile");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [nickname, setNickname] = useState("");
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [crewName, setCrewName] = useState("불꽃 크루");
  // /invite/[code]로 들어온 경우 저장된 코드를 미리 채움
  const [joinCode, setJoinCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : (peekPendingInvite() ?? ""),
  );
  // 챌린지 초대 링크(/challenge?join=CODE)로 들어온 경우. 이 사람은 크루가
  // 아니라 **챌린지**에 초대받은 것이라 크루 선택 단계가 통째로 무의미하다.
  // 닉네임만 받고 바로 챌린지로 보낸다.
  const [challengeCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : (peekPendingChallengeInvite() ?? ""),
  );
  /**
   * 마지막 화면에 무엇을 말할지.
   *
   * `friend`는 2026-08-08에 생겼다(0061) — 초대 링크가 그룹이 아니라 **친구**를
   * 맺으므로 "크루 참여 완료"라고 말하면 거짓이 된다. `/home`에는 토스트 장치가
   * 없어서 이 화면에서 말하고 보낸다(챌린지 경로만 sessionStorage를 쓴다).
   */
  const [doneInfo, setDoneInfo] = useState<
    | { mode: "create"; crewName: string; inviteCode?: string }
    | { mode: "join"; crewName: string }
    | { mode: "friend"; nickname: string; alreadyFriends: boolean }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearPendingInvite();
  }, []);

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
      await upsertMyProfile({
        id: userId,
        nickname: nick,
        avatar_url: avatar,
        weekly_goal: weeklyGoal,
      });
      // 챌린지 초대로 온 사람은 크루 단계를 통째로 건너뛴다. 챌린지 참가에
      // 그룹은 필요 없고(0044~0050), 여기서 크루를 물으면 초대와 무관한 선택을
      // 강요하게 된다. 바로 참가시키고 챌린지 화면으로 보낸다.
      if (challengeCode) {
        try {
          // 0063: 방금 프로필을 만든 사람은 **신입**이라 방장과 친구까지 맺는다
          // (2026-08-08 사용자 질문 — "챌린지 초대한 사람과 친구도 되게").
          //
          // ⚠️ 폴백을 빼지 마라. 서버가 `crew_links` 0건 + 참가 0건을 검사하므로,
          //    이 흐름에도 신입이 아닌 사람이 올 수 있다(세션이 끊겨 온보딩으로
          //    떨어진 기존 사용자, 온보딩 도중 닉네임 검색으로 초대받은 사람).
          //    폴백이 없으면 그 사람은 챌린지에 아예 못 들어간다.
          let joined;
          try {
            joined = await joinChallengeAsNewcomer(challengeCode);
          } catch (e) {
            if (!isNotNewcomer(e)) throw e;
            joined = await joinChallengeWithCode(challengeCode);
          }
          // 두 가지가 동시에 일어났으므로 둘 다 말한다. 옛 흐름은 조용히
          // 이동해서 참가했는지조차 알 수 없었다.
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

      // 친구 초대 링크로 진입했으면 그 자리에서 친구를 맺는다. 크루 단계를 지나게
      // 하면 초대와 무관한 선택을 강요하게 된다.
      //
      // ⚠️ 옛 그룹 코드는 `redeemInviteCode`가 하위 호환으로 받는다(설계 §3.3).
      //    둘 다 실패하면 `step="join"`으로 보내 사용자가 코드를 고칠 수 있게 한다 —
      //    여기서 막아 버리면 링크가 깨진 사람이 앱에 들어올 방법이 없다.
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
          setStep("join");
          setError("초대 코드를 확인해 주세요");
          return;
        }
      }

      setStep("crew");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    const name = crewName.trim();
    if (!name) {
      setError("크루 이름을 입력해주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup(name);
      setDoneInfo({
        mode: "create",
        crewName: group.name,
        inviteCode: group.invite_code,
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "크루 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function submitJoin() {
    const code = normalizeInviteCode(joinCode);
    if (!code) {
      setError("초대 코드를 입력해주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // ⚠️ 손으로 입력한 코드도 **친구 코드일 수 있다**(0061). `joinGroupWithCode`만
      //    부르면 친구가 자기 코드를 문자로 보내 준 경우 "존재하지 않는 코드"가 된다.
      const redeemed = await redeemInviteCode(code);
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
    } catch {
      setError("코드를 확인해주세요 — 존재하지 않는 초대 코드예요");
    } finally {
      setBusy(false);
    }
  }

  function inviteLink(code: string) {
    return `${window.location.origin}/invite/${code}`;
  }

  async function copyInvite(code: string) {
    await navigator.clipboard.writeText(inviteLink(code));
    setError(null);
  }

  async function shareInvite(code: string) {
    const url = inviteLink(code);
    // 이 버튼은 `mode === "create"`(크루 만들기)에서만 뜬다. friend 모드에는
    // 크루 이름이 없으므로 좁혀서 읽는다 — `doneInfo?.crewName`으로 두면
    // 유니온이 넓어진 뒤 타입 오류가 난다.
    const crewName =
      doneInfo && doneInfo.mode !== "friend" ? doneInfo.crewName : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title: "GND 크루 초대",
          text: `GND 크루 "${crewName}"에 초대해요! 링크를 탭하면 바로 참여돼요.`,
          url,
        });
      } catch {
        // 사용자가 공유 시트를 닫음 — 무시
      }
    } else {
      await copyInvite(code);
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

  return (
    <Shell>
      {step === "profile" && (
        <>
          <p className="text-4xl font-black italic tracking-tight text-accent">
            🏋️ GND
          </p>
          <p className="mt-1 text-[10px] font-bold tracking-[0.3em] text-accent/80">
            NO EXCUSES. JUST RESULTS.
          </p>
          <h1 className="mt-4 text-xl font-extrabold">
            {challengeCode ? "챌린지에 초대받았어요 🏆" : "GND에 오신 걸 환영해요"}
          </h1>
          {/* 왜 닉네임만 묻고 끝나는지 알려준다. 안 그러면 "크루는 언제 정하지?"가 된다. */}
          <p className="mt-1 text-[13px] text-muted">
            {challengeCode
              ? "닉네임만 정하면 바로 챌린지에 들어가요. 크루는 나중에 만들어도 돼요."
              : "운동 안 하면 GND 확정. 친구들과 함께 탈출해요."}
          </p>

          {!challengeCode && (
            <>
              <Label>프로필 사진</Label>
              <div className="flex flex-wrap justify-center gap-2">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAvatar(a)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border text-2xl ${
                      avatar === a
                        ? "border-accent bg-accent-weak"
                        : "border-line bg-surface"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}

          <Label>닉네임</Label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (예: 형)"
            maxLength={20}
            className="w-full rounded-card-sm border border-line bg-surface px-4 py-3 text-center text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />

          {!challengeCode && (
            <>
              <Label>주간 운동 목표</Label>
              <div className="flex items-center justify-center gap-4">
                <Stepper
                  onClick={() => setWeeklyGoal((g) => Math.max(1, g - 1))}
                >
                  –
                </Stepper>
                <span className="min-w-16 font-mono text-lg font-bold">
                  주 {weeklyGoal}회
                </span>
                <Stepper
                  onClick={() => setWeeklyGoal((g) => Math.min(7, g + 1))}
                >
                  +
                </Stepper>
              </div>
            </>
          )}

          <Primary onClick={submitProfile} busy={busy}>
            {challengeCode ? "챌린지 참가하기" : "다음"}
          </Primary>

          {/* 세션이 끊겨 온보딩으로 떨어진 기존 사용자의 탈출구.
              여기서 "다음"을 누르면 새 계정이 생겨 기존 기록과 분리되므로,
              돌아갈 문을 같은 화면에 둔다. */}
          {!challengeCode && (
            <Link
              href="/login"
              className="mt-4 block text-[13px] text-muted underline"
            >
              이미 계정이 있나요? 로그인
            </Link>
          )}
        </>
      )}

      {step === "crew" && (
        <>
          <div className="text-5xl">👥</div>
          <h1 className="mt-3 text-xl font-extrabold">크루에 들어가요</h1>
          <p className="mt-1 text-[13px] text-muted">
            친구 크루와 함께하면 더 강해져요. 지금 만들거나 초대받아
            참여하고, 혼자 시작해서 나중에 합류해도 돼요.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Primary onClick={() => setStep("create")}>
              ＋ 새 GND 크루 만들기
            </Primary>
            <Outline onClick={() => setStep("join")}>
              초대 코드로 참여하기
            </Outline>
            <button
              onClick={() => router.replace("/home")}
              className="mt-1 w-full py-2 text-[13px] font-bold text-muted underline underline-offset-4"
            >
              혼자 시작하기 (나중에 크루 참여)
            </button>
          </div>
        </>
      )}

      {step === "create" && (
        <>
          <h1 className="text-xl font-extrabold">크루 만들기</h1>
          <Label>크루 이름</Label>
          <input
            value={crewName}
            onChange={(e) => setCrewName(e.target.value)}
            maxLength={30}
            className="w-full rounded-card-sm border border-line bg-surface px-4 py-3 text-center text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />
          <p className="mt-2 text-xs text-muted">
            만들면 초대 코드가 생겨요. 친구에게 공유해 부르면 됩니다.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Primary onClick={submitCreate} busy={busy}>
              만들기
            </Primary>
            <Outline onClick={() => setStep("crew")}>뒤로</Outline>
          </div>
        </>
      )}

      {step === "join" && (
        <>
          <h1 className="text-xl font-extrabold">초대 코드로 참여</h1>
          <Label>초대 코드</Label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="예: GND-7K2AB"
            className="w-full rounded-card-sm border border-line bg-surface px-4 py-3 text-center font-mono text-[15px] uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />
          <p className="mt-2 text-xs text-muted">
            친구가 보내준 코드를 입력하거나, 초대 링크를 탭하면 자동 참여돼요.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Primary onClick={submitJoin} busy={busy}>
              참여하기
            </Primary>
            <Outline onClick={() => setStep("crew")}>뒤로</Outline>
          </div>
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
            {doneInfo.mode === "create"
              ? "크루 완성!"
              : doneInfo.mode === "friend"
                ? doneInfo.alreadyFriends
                  ? "이미 친구예요"
                  : "친구가 됐어요!"
                : "크루 참여 완료!"}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {doneInfo.mode === "create"
              ? "아래 초대 코드/링크를 친구에게 보내면 크루에 참여해요."
              : doneInfo.mode === "friend"
                ? `${doneInfo.nickname}님과 서로의 기록을 보고 콕 찌를 수 있어요.`
                : `이제 "${doneInfo.crewName}"의 GND 챌린지에 함께해요. 각자 목표를 세우면 시작!`}
          </p>

          {doneInfo.mode === "create" && doneInfo.inviteCode && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-card-sm border border-line bg-surface-2 px-4 py-3">
                <span className="font-mono text-lg font-extrabold tracking-wider">
                  {doneInfo.inviteCode}
                </span>
                <button
                  onClick={() => copyInvite(doneInfo.inviteCode!)}
                  className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink"
                >
                  복사
                </button>
              </div>
              <Outline onClick={() => shareInvite(doneInfo.inviteCode!)}>
                💬 초대 링크 공유 (카카오톡 등)
              </Outline>
            </div>
          )}

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-10 text-center">
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 mb-2 text-xs font-bold text-muted">{children}</p>
  );
}

function Stepper({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-11 w-11 rounded-full border border-line bg-surface text-xl font-bold"
    >
      {children}
    </button>
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

function Outline({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-full border border-line bg-surface px-4 py-3.5 text-[15px] font-bold"
    >
      {children}
    </button>
  );
}
