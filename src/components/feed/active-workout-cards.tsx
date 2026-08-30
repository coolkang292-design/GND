"use client";

import { Avatar } from "@/components/avatar";
import { useAuth } from "@/components/auth-provider";
import { CheerActions } from "@/components/feed/cheer-actions";
import { useActiveCrewSessions } from "@/lib/hooks/use-active-crew-sessions";
import type { ActiveCrewSession } from "@/lib/social";
import { minutesSince } from "@/lib/time-ago";

/**
 * 진행 중 크루 세션 카드 목록 — **홈 전용이 됐다** (Phase C, 2026-08-31).
 *
 * 피드는 같은 데이터를 `StoryTray`로 그린다. 1명당 세로 ~180px이라 3명이 운동
 * 중이면 피드 첫 화면에 게시물이 하나도 안 보였기 때문이다. 홈은 목록이 아니라
 * 현황판이라 카드가 맞아서 **그대로 둔다.**
 *
 * `sessions`를 받으면 그리기만 한다. 홈은 같은 값을 친구 목록의 "🔥 운동 중"
 * 판정에도 쓰기 때문에 **한 번만 조회해 내려준다** — 여기서 또 부르면 같은 질의가
 * 홈에서 두 번 나가고 폴링도 두 벌이 된다. 안 넘기면 스스로 불러온다.
 */
export function ActiveWorkoutCards({
  sessions: provided,
}: {
  sessions?: ActiveCrewSession[];
} = {}) {
  const { userId } = useAuth();
  // 부모가 넘겨줬으면 훅을 끈다 — 중복 조회·중복 폴링 방지.
  const own = useActiveCrewSessions({ enabled: provided === undefined });
  const sessions = provided ?? own.sessions;

  if (sessions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => (
        <ActiveWorkoutCard
          key={s.sessionId}
          session={s}
          isMine={s.userId === userId}
        />
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
  return (
    <section className="rounded-card border border-accent/40 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        {/* ⚠️ 초록 점은 아바타의 **형제**다. `<Avatar>` 안에 넣을 수 없어서
            (사진일 때 img 하나만 그린다) 바깥 relative 칸으로 감쌌다. */}
        <span className="relative flex h-9 w-9 flex-none">
          <Avatar
            src={session.avatarUrl}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-lg"
          />
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
        <CheerActions sessionId={session.sessionId} nickname={session.nickname} />
      )}
    </section>
  );
}
