"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  challengePassCopy,
  challengePassStatus,
  type ChallengePassStatus,
} from "@/lib/domain/viewing-pass";
import { challengeDaysLeft } from "@/lib/domain/challenge-time";
import {
  getActiveChallengeRanking,
  getChallengeParticipantProfiles,
  getMyChallenges,
  getTodaysPeekTarget,
  pickPeekTarget,
  type ChallengeRanking,
} from "@/lib/challenge";
import { peekRows } from "@/lib/domain/challenge-peek";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";

/**
 * 홈 챌린지 참가자 성과 카드 — 챌린지 active일 때만 노출.
 * 5일 연속 운동으로 열리는 2시간짜리 잠금 순위판(블러+자물쇠) + D-day.
 * 보안: 잠금 상태에선 순위 데이터를 아예 조회하지 않는다(블러는 시각 처리일 뿐).
 */
export function ChallengePerformanceCard({
  completedAts,
}: {
  completedAts: Date[];
}) {
  const { userId } = useAuth();
  const [ready, setReady] = useState(false);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [pass, setPass] = useState<ChallengePassStatus | null>(null);
  const [ranking, setRanking] = useState<ChallengeRanking | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        // 0044: 챌린지는 그룹이 아니라 참가 사실로 묶인다. 대표를 고르는 규칙은
        // 화면끼리 같아야 한다(pickPrimaryRow) — 어긋나면 홈과 챌린지 탭이 서로
        // 다른 챌린지를 보여준다.
        const ch = pickPrimaryRow(await getMyChallenges(userId));
        if (!ch || ch.status !== "active") {
          if (!cancelled) setReady(true);
          return;
        }
        const p = challengePassStatus(completedAts, new Date(), DEFAULT_TIMEZONE);
        // 보안: unlocked일 때만 순위를 조회한다. 잠금 상태에선 순위가 클라에 없다.
        if (p.state === "unlocked") {
          const [rank, profiles, picked] = await Promise.all([
            getActiveChallengeRanking(ch.id),
            // 챌린지 안에서만 공개되는 최소 참가자 프로필을 사용한다.
            getChallengeParticipantProfiles(ch.id),
            getTodaysPeekTarget(ch.id),
          ]);
          if (cancelled) return;
          setRanking(rank);
          setNames(
            new Map(profiles.map((profile) => [profile.id, profile.nickname])),
          );
          setTarget(picked);
        }
        if (cancelled) return;
        setChallengeId(ch.id);
        setEndDate(ch.end_date);
        setPass(p);
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, completedAts]);

  async function pick(targetId: string) {
    if (!challengeId) return;
    setPicking(targetId);
    try {
      const res = await pickPeekTarget(challengeId, targetId);
      setTarget(res.targetId);
      // 서버가 이미 고른 사람을 돌려줬다 = 다른 기기·창에서 먼저 골랐다는 뜻.
      if (res.locked) {
        setNotice(
          `오늘은 ${names.get(res.targetId) ?? "참가자"}님만 볼 수 있어요`,
        );
      }
    } catch {
      setNotice("지금은 열람할 수 없어요");
    } finally {
      setPicking(null);
    }
  }

  if (!ready || !pass || !endDate) return null; // 챌린지 active 아니면 숨김

  const now = new Date();
  const dLeft = challengeDaysLeft(dayKey(now, DEFAULT_TIMEZONE), endDate);
  const unlocked = pass.state === "unlocked";
  const minsLeft = pass.expiresAt
    ? Math.max(0, Math.ceil((pass.expiresAt.getTime() - now.getTime()) / 60_000))
    : 0;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold">🏆 챌린지 참가자 성과</h3>
        <span className="text-xs font-bold text-accent">
          D-{Math.max(0, dLeft - 1)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {challengePassCopy(pass, minsLeft)}
      </p>

      <div className="relative mt-3">
        {unlocked && ranking ? (
          <>
            {/* 아직 안 골랐으면 참가자 선택 — 이 목록엔 순위·점수를 노출하지 않는다 */}
            {!target && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-muted">
                  성과를 볼 참가자 한 명을 고르세요. 오늘은 바꿀 수 없어요.
                </p>
                {ranking.list
                  .filter((r) => r.userId !== userId)
                  .map((r) => (
                    <button
                      key={r.userId}
                      type="button"
                      disabled={picking !== null}
                      onClick={() => void pick(r.userId)}
                      className="flex items-center justify-between rounded-card-sm bg-surface-2 px-3 py-2 text-left text-[12.5px] disabled:opacity-50"
                    >
                      <span className="font-bold">
                        {names.get(r.userId) ?? "참가자"}
                      </span>
                      <span className="text-xs font-bold text-accent">
                        {picking === r.userId ? "여는 중…" : "성과 보기 ›"}
                      </span>
                    </button>
                  ))}
                {ranking.list.filter((r) => r.userId !== userId).length === 0 && (
                  <p className="rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
                    아직 함께 참가한 사람이 없어요
                  </p>
                )}
              </div>
            )}

            {target && (
              <ul className="flex flex-col gap-1.5">
                {peekRows(ranking.list, userId ?? "", target).map((r) => (
                  <li
                    key={r.userId}
                    className={`flex items-center justify-between rounded-card-sm px-3 py-2 text-[12.5px] ${
                      r.userId === userId ? "bg-accent-weak" : "bg-surface-2"
                    }`}
                  >
                    <span className="font-bold">
                      {r.rank}위 · {names.get(r.userId) ?? "참가자"}
                      {r.userId === userId && (
                        <span className="ml-0.5 text-faint">(나)</span>
                      )}
                    </span>
                    <span className="font-mono font-bold text-accent">
                      {Math.round(r.overall)}점
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {notice && (
              <p className="mt-1.5 text-[11px] font-bold text-accent">
                {notice}
              </p>
            )}
          </>
        ) : (
          <>
            {/* 잠금: 실제 순위 없이 자리표시자만 블러 처리 */}
            <ul
              aria-hidden
              className="pointer-events-none flex select-none flex-col gap-1.5 blur-sm"
            >
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px]"
                >
                  <span className="font-bold text-muted">
                    {i + 1}위 · ●●●●
                  </span>
                  <span className="font-mono font-bold text-muted">●●점</span>
                </li>
              ))}
            </ul>
            <div className="absolute inset-0 grid place-items-center">
              <span className="rounded-full bg-black/50 px-3 py-1.5 text-lg">
                🔒
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
