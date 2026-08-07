"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/ui-icon";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { KING_DAYS, viewingPassStatus } from "@/lib/domain/viewing-pass";
import { getCrewProfiles } from "@/lib/crew";
import { getMyChallenges } from "@/lib/challenge";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";
import {
  getCrewPerformance,
  viewRecord,
  SocialError,
  type CrewPerformance,
} from "@/lib/social";
import type { Profile } from "@/lib/types";

const ERROR_MESSAGES: Record<string, string> = {
  not_eligible: "이번 주 5일을 채우면 열람권이 생겨요",
  pass_expired: "열람권이 만료됐어요 — 다음 주에 다시!",
  pass_used: "이번 주 열람권은 이미 사용했어요",
  not_crew: "열람할 수 없는 대상이에요",
  self_view: "열람할 수 없는 대상이에요",
};

/** 꾸준왕 카드 — 열람권 상태·크루원 선택·성과 시트 (스펙 §4.3) */
export function KingCard({
  completedAts,
  viewAts,
  onViewed,
}: {
  completedAts: Date[];
  viewAts: Date[];
  onViewed: () => void;
}) {
  const { userId } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState(false);
  const [perf, setPerf] = useState<{
    who: Profile;
    data: CrewPerformance;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 챌린지 진행 중일 때만 열람권 카드를 노출한다(평소 비활성). null=판정 전.
  const [challengeActive, setChallengeActive] = useState<boolean | null>(null);

  const now = new Date();
  const status = viewingPassStatus(completedAts, viewAts, now, DEFAULT_TIMEZONE);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        // 열람권이 0039로 크루 기준이 됐으므로 후보도 크루다. 0044부터 챌린지는
        // 그룹이 아니라 참가 사실로 묶이므로 그룹 조회가 필요 없다.
        const [challenges, crew] = await Promise.all([
          getMyChallenges(userId),
          getCrewProfiles(userId),
        ]);
        if (cancelled) return;
        setMembers(crew.filter((m) => m.id !== userId));

        // 여러 챌린지가 있을 수 있다. 대표를 고르는 규칙은 화면끼리 같아야
        // 열람 대상(challenge_peek_picks)이 어긋나지 않는다.
        const challenge = pickPrimaryRow(challenges);
        setChallengeId(challenge?.id ?? null);
        setChallengeActive(challenge?.status === "active");
      } catch {
        /* 크루/챌린지 조회 실패 — 카드 숨김 */
        if (!cancelled) setChallengeActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function confirmView() {
    if (!confirmTarget || !challengeId) return;
    setViewing(true);
    try {
      await viewRecord(confirmTarget.id);
      const data = await getCrewPerformance(confirmTarget.id, challengeId);
      setPerf({ who: confirmTarget, data });
      setConfirmTarget(null);
      setPicking(false);
    } catch (e) {
      const code = e instanceof SocialError ? e.code : null;
      setNotice(ERROR_MESSAGES[code ?? ""] ?? "열람하지 못했어요");
      setConfirmTarget(null);
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setViewing(false);
    }
  }

  const hoursLeft = status.expiresAt
    ? Math.max(
        0,
        Math.ceil((status.expiresAt.getTime() - now.getTime()) / 3_600_000),
      )
    : 0;

  // 진행 중 챌린지가 없으면 열람권 카드를 숨긴다(판정 전에도 숨겨 깜빡임 방지).
  if (challengeActive !== true) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        {/* 옛 표기는 `🏅`였다 (2026-08-07 2차 시안으로 교체) */}
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name="crown" size={20} />
          꾸준왕 열람권
        </h3>
        <span className="text-xs text-muted">주 {KING_DAYS}일 달성 보상</span>
      </div>

      {status.state === "progress" && (
        <p className="mt-2 text-[13px] text-muted">
          이번 주 <b className="text-text">{status.daysDone}</b> / {KING_DAYS}일
          — {KING_DAYS - status.daysDone}일 더 운동하면 크루원 성과를 열람할 수
          있어요 🎟️
        </p>
      )}

      {status.state === "available" && (
        <>
          <p className="mt-2 text-[13px] font-bold text-accent">
            🎟️ 열람권 보유 · {hoursLeft}시간 남음
          </p>
          <p className="mt-0.5 text-xs text-muted">
            크루원 1명의 성과와 챌린지 순위를 1회 열람할 수 있어요.
          </p>
          {!picking ? (
            <button
              onClick={() => setPicking(true)}
              className="mt-3 w-full rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
            >
              크루원 성과 열람하기
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {members.length === 0 && (
                <p className="text-xs text-muted">열람할 크루원이 없어요</p>
              )}
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setConfirmTarget(m)}
                  className="flex items-center gap-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-left"
                >
                  <span className="text-lg">{m.avatar_url ?? "👤"}</span>
                  <span className="flex-1 text-sm font-bold">{m.nickname}</span>
                  <span className="text-xs font-bold text-accent">성과 ›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {status.state === "used" && (
        <p className="mt-2 text-[13px] text-muted">
          이번 주 열람권을 사용했어요 ✅ 다음 주에 {KING_DAYS}일을 채우면 또
          받을 수 있어요.
        </p>
      )}

      {status.state === "expired" && (
        <p className="mt-2 text-[13px] text-muted">
          열람권이 소멸됐어요 ⏳ 다음 주에 {KING_DAYS}일을 채우면 다시 받아요.
        </p>
      )}

      {notice && <p className="mt-2 text-xs font-bold text-accent">{notice}</p>}

      {/* 확인 모달 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-sm rounded-card bg-surface p-5">
            <p className="text-[15px] font-extrabold">
              {confirmTarget.nickname}님의 성과를 열람할까요?
            </p>
            <p className="mt-1.5 text-xs text-muted">
              열람권은 1회용이에요. 열람하면 {confirmTarget.nickname}님에게
              확인 알림이 가요 👀
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={viewing}
                className="flex-1 rounded-card-sm border border-line py-2.5 text-sm font-bold"
              >
                취소
              </button>
              <button
                onClick={() => void confirmView()}
                disabled={viewing}
                className="flex-1 rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
              >
                {viewing ? "열람 중…" : "열람하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성과 시트 */}
      {perf && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-md rounded-t-[22px] bg-surface p-5 pb-8">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{perf.who.avatar_url ?? "👤"}</span>
              <div>
                <p className="text-lg font-extrabold">{perf.who.nickname}님</p>
                <p className="text-xs text-muted">꾸준왕 열람권으로 확인 👀</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center">
                <p className="text-lg font-extrabold">{perf.data.weekDays}일</p>
                <p className="mt-0.5 text-[11px] text-muted">이번 주 운동</p>
              </div>
              <div className="rounded-card-sm border border-line bg-surface-2 px-2 py-3 text-center">
                <p className="text-lg font-extrabold">{perf.data.streak}일</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
                  <UiIcon name="streak-on" size={13} /> 스트릭
                </p>
              </div>
            </div>
            {perf.data.challenge && (
              <div className="mt-2 rounded-card-sm border border-accent/40 bg-accent-weak px-3 py-3">
                <p className="text-xs font-bold text-muted">
                  🔓 {perf.data.challenge.name}
                </p>
                <p className="mt-1 text-sm font-extrabold">
                  달성률 {perf.data.challenge.rate}% · 현재{" "}
                  {perf.data.challenge.rank}위 / {perf.data.challenge.total}명
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setPerf(null);
                onViewed();
              }}
              className="mt-4 w-full rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
