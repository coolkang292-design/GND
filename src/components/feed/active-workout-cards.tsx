"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  getActiveCrewSessions,
  sendCheer,
  SocialError,
  type ActiveCrewSession,
  type CheerType,
} from "@/lib/social";
import { minutesSince } from "@/lib/time-ago";
import { cheerToastMessage } from "@/lib/domain/cheer-points";
import { CheerPointModal } from "@/components/feed/cheer-point-modal";

const CHEER_BUTTONS: { type: CheerType; emoji: string; label: string }[] = [
  { type: "fire", emoji: "🔥", label: "불태워" },
  { type: "power", emoji: "💪", label: "힘내" },
  { type: "clap", emoji: "👏", label: "멋져" },
  { type: "finish", emoji: "🏁", label: "끝까지" },
];

function cheerErrorMessage(e: unknown): string {
  if (e instanceof SocialError) {
    if (e.code === "cheer_cooldown") return "잠시 후 다시 응원할 수 있어요";
    if (e.code === "cheer_limit") return "이 운동엔 3번까지 응원할 수 있어요";
    if (e.code === "not_active") return "운동이 방금 끝났어요";
  }
  return "응원을 보내지 못했어요";
}

/** 진행 중 크루 세션 카드 목록 — 홈·피드 공용, 스스로 데이터를 불러온다 */
export function ActiveWorkoutCards() {
  const { userId, loading, configured } = useAuth();
  const [sessions, setSessions] = useState<ActiveCrewSession[]>([]);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        // 0039: 그룹 소속 → 크루 연결. 그룹이 없어도 크루가 있으면 보여야 한다.
        const active = await getActiveCrewSessions(userId!);
        if (!cancelled) setSessions(active);
      } catch {
        /* 진행 중 카드는 부가 정보 — 실패해도 화면을 막지 않는다 */
      }
    }
    void load();
    const interval = setInterval(() => void load(), 60_000); // 완료/신규 반영
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [configured, loading, userId]);

  if (sessions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => (
        <ActiveWorkoutCard key={s.sessionId} session={s} isMine={s.userId === userId} />
      ))}
    </div>
  );
}

function ActiveWorkoutCard({
  session,
  isMine,
}: {
  session: ActiveCrewSession;
  isMine: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [sending, setSending] = useState(false);
  /** 지급받은 포인트. 0이면 팝업 없이 토스트만 (하루 1회 상한). */
  const [earned, setEarned] = useState<number | null>(null);
  const messageRef = useRef<HTMLInputElement>(null);

  async function cheer(type: CheerType, message?: string) {
    setSending(true);
    setNotice(null);
    try {
      const { pointsAwarded } = await sendCheer(session.sessionId, type, message);
      setSent(true);
      setCustomOpen(false);
      if (pointsAwarded > 0) {
        // 받았을 때만 팝업. 토스트는 3초 뒤 사라져서 "받았나?"가 남는다.
        setEarned(pointsAwarded);
      } else {
        setNotice(cheerToastMessage(pointsAwarded));
        setTimeout(() => setNotice(null), 3000);
      }
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setNotice(cheerErrorMessage(e));
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-card border border-accent/40 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg">
          {session.avatarUrl ?? "👤"}
          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-extrabold">
            {session.nickname}
            {isMine && <span className="ml-1 text-faint">(나)</span>}
          </p>
          <p className="text-xs font-bold text-accent">
            {minutesSince(session.startedAt)}분째 운동 중 🔥
          </p>
        </div>
      </div>

      {!isMine && (
        <>
          <div className="mt-3 flex gap-1.5">
            {CHEER_BUTTONS.map((b) => (
              <button
                key={b.type}
                onClick={() => void cheer(b.type)}
                disabled={sent || sending}
                className="flex-1 rounded-card-sm border border-line bg-surface-2 py-2 text-center disabled:opacity-50"
              >
                <span className="block text-base">{b.emoji}</span>
                <span className="block text-[10px] font-bold text-muted">
                  {b.label}
                </span>
              </button>
            ))}
            <button
              onClick={() => setCustomOpen((v) => !v)}
              disabled={sent || sending}
              className="flex-1 rounded-card-sm border border-line bg-surface-2 py-2 text-center disabled:opacity-50"
            >
              <span className="block text-base">✍️</span>
              <span className="block text-[10px] font-bold text-muted">
                한마디
              </span>
            </button>
          </div>

          {customOpen && (
            <div className="mt-2 flex gap-1.5">
              <input
                ref={messageRef}
                maxLength={30}
                placeholder="응원 한마디 (30자)"
                className="h-10 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={() => {
                  const msg = (messageRef.current?.value ?? "").trim();
                  if (msg) void cheer("custom", msg);
                }}
                disabled={sending}
                className="h-10 rounded-card-sm bg-accent px-3.5 text-sm font-extrabold text-accent-ink disabled:opacity-60"
              >
                보내기
              </button>
            </div>
          )}

          {earned !== null && (
        <CheerPointModal
          points={earned}
          nickname={session.nickname}
          onClose={() => setEarned(null)}
        />
      )}

      {notice && (
            <p className="mt-2 text-xs font-bold text-accent">{notice}</p>
          )}
        </>
      )}
    </section>
  );
}
