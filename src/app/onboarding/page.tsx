"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
import {
  clearPendingInvite,
  createGroup,
  joinGroupWithCode,
  peekPendingInvite,
  upsertMyProfile,
} from "@/lib/crew";

const AVATARS = ["🧔", "🧑", "👦", "👩", "🤓", "💁‍♀️", "🧗", "🏃"] as const;

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
  const [doneInfo, setDoneInfo] = useState<{
    mode: "create" | "join";
    crewName: string;
    inviteCode?: string;
  } | null>(null);
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
      // 초대 링크로 진입했으면 크루 선택을 건너뛰고 바로 참여 단계로
      setStep(joinCode ? "join" : "crew");
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
      const joined = await joinGroupWithCode(code);
      setDoneInfo({ mode: "join", crewName: joined.group_name });
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: "GND 크루 초대",
          text: `GND 크루 "${doneInfo?.crewName}"에 초대해요! 링크를 탭하면 바로 참여돼요.`,
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
          <div className="text-5xl">🏋️‍♂️🔥</div>
          <h1 className="mt-3 text-xl font-extrabold">
            GND에 오신 걸 환영해요
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            운동 안 하면 GND 확정. 친구들과 함께 탈출해요.
          </p>

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

          <Label>닉네임</Label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (예: 형)"
            maxLength={20}
            className="w-full rounded-card-sm border border-line bg-surface px-4 py-3 text-center text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />

          <Label>주간 운동 목표</Label>
          <div className="flex items-center justify-center gap-4">
            <Stepper onClick={() => setWeeklyGoal((g) => Math.max(1, g - 1))}>
              –
            </Stepper>
            <span className="min-w-16 font-mono text-lg font-bold">
              주 {weeklyGoal}회
            </span>
            <Stepper onClick={() => setWeeklyGoal((g) => Math.min(7, g + 1))}>
              +
            </Stepper>
          </div>

          <Primary onClick={submitProfile} busy={busy}>
            다음
          </Primary>
        </>
      )}

      {step === "crew" && (
        <>
          <div className="text-5xl">👥</div>
          <h1 className="mt-3 text-xl font-extrabold">크루에 들어가요</h1>
          <p className="mt-1 text-[13px] text-muted">
            GND는 친구 크루 단위로 겨뤄요. 만들거나, 초대받아 참여하세요.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Primary onClick={() => setStep("create")}>
              ＋ 새 GND 크루 만들기
            </Primary>
            <Outline onClick={() => setStep("join")}>
              초대 코드로 참여하기
            </Outline>
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
          <div className="text-5xl">🎉</div>
          <h1 className="mt-3 text-xl font-extrabold">
            {doneInfo.mode === "create" ? "크루 완성!" : "크루 참여 완료!"}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {doneInfo.mode === "create"
              ? "아래 초대 코드/링크를 친구에게 보내면 크루에 참여해요."
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
