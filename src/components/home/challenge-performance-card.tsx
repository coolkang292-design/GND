"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  challengePassStatus,
  type ChallengePassStatus,
} from "@/lib/domain/viewing-pass";
import { challengeDaysLeft } from "@/lib/domain/challenge-time";
import { getGroupMemberProfiles, getMyGroups } from "@/lib/crew";
import {
  getActiveChallengeRanking,
  getCurrentChallenge,
  type ChallengeRanking,
} from "@/lib/challenge";

/**
 * 홈 챌린지 크루 성과 카드 — 챌린지 active일 때만 노출.
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const g = (await getMyGroups())[0];
        if (!g) {
          if (!cancelled) setReady(true);
          return;
        }
        const ch = await getCurrentChallenge(g.id);
        if (!ch || ch.status !== "active") {
          if (!cancelled) setReady(true);
          return;
        }
        const p = challengePassStatus(completedAts, new Date(), DEFAULT_TIMEZONE);
        // 보안: unlocked일 때만 순위를 조회한다. 잠금 상태에선 순위가 클라에 없다.
        if (p.state === "unlocked") {
          const [rank, crew] = await Promise.all([
            getActiveChallengeRanking(g.id),
            // 챌린지 순위표의 닉네임 맵이라 그룹 참가자가 맞다(0039 범위 밖).
            getGroupMemberProfiles(g.id),
          ]);
          if (cancelled) return;
          setRanking(rank);
          setNames(new Map(crew.map((c) => [c.id, c.nickname])));
        }
        if (cancelled) return;
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
        <h3 className="text-sm font-extrabold">🏆 챌린지 크루 성과</h3>
        <span className="text-xs font-bold text-accent">
          D-{Math.max(0, dLeft - 1)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {unlocked
          ? `🎟️ 열람 중 · ${minsLeft}분 남음`
          : pass.state === "locked_expired"
            ? "오늘 열람 시간이 끝났어요 (다시 5일 연속 달성 시 열려요)"
            : `5일 연속 운동하면 열려요 · 현재 ${pass.consecutiveDays}/5일`}
      </p>

      <div className="relative mt-3">
        {unlocked && ranking ? (
          <ul className="flex flex-col gap-1.5">
            {ranking.list.map((r) => (
              <li
                key={r.userId}
                className={`flex items-center justify-between rounded-card-sm px-3 py-2 text-[12.5px] ${
                  r.userId === userId ? "bg-accent-weak" : "bg-surface-2"
                }`}
              >
                <span className="font-bold">
                  {r.rank}위 · {names.get(r.userId) ?? "크루원"}
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
