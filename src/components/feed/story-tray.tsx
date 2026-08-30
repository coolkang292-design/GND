"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/avatar";
import { CheerActions } from "@/components/feed/cheer-actions";
import { useActiveCrewSessions } from "@/lib/hooks/use-active-crew-sessions";
import type { ActiveCrewSession } from "@/lib/social";
import { minutesSince } from "@/lib/time-ago";

/**
 * 진행 중 크루 = 가로 아바타 한 줄 (Phase C, 2026-08-31).
 *
 * ⚠️ 왜 카드에서 바꿨나: 진행 중 카드는 1명당 세로 ~180px다. **3명이 운동 중이면
 *    피드 첫 화면에 게시물이 하나도 안 보였다.** 피드는 게시물을 읽는 곳인데
 *    상단 현황판이 화면을 다 먹으면 목적이 뒤집힌다. 같은 정보를 1줄에 넣는다.
 *
 * ⚠️ **홈은 그대로 카드다.** 홈은 목록이 아니라 현황판이라 카드가 맞고, 응원
 *    버튼이 바로 보이는 편이 낫다. `ActiveWorkoutCards`가 홈 전용으로 남았다.
 *
 * 탭하면 시트가 열리고 거기서 응원한다 — 트레이 자체에 버튼을 붙이면 한 줄로
 * 줄인 의미가 없어진다.
 */
export function StoryTray() {
  const { sessions, myUserId } = useActiveCrewSessions();
  const [open, setOpen] = useState<ActiveCrewSession | null>(null);

  if (sessions.length === 0) return null;

  return (
    <>
      {/* ⚠️ `-mx-4 px-4`: 피드 본문은 좌우 여백이 있는데, 가로 스크롤 줄은 화면
          끝까지 흘러야 "더 있다"가 보인다. 여백만큼 빼고 안쪽으로 다시 준다. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-3.5">
          {sessions.map((s) => {
            const isMine = s.userId === myUserId;
            return (
              <li key={s.sessionId} className="flex-none">
                <button
                  type="button"
                  onClick={() => setOpen(s)}
                  aria-label={`${s.nickname}님 ${minutesSince(s.startedAt)}분째 운동 중 — 응원하기`}
                  className="flex w-[68px] flex-col items-center gap-1"
                >
                  {/* 초록 링 = 진행 중. 인스타 스토리와 같은 신호라 배우지 않아도 읽힌다. */}
                  <span className="rounded-full border-2 border-accent p-[2.5px]">
                    <Avatar
                      src={s.avatarUrl}
                      className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full bg-surface-2 text-2xl"
                    />
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-bold">
                    {isMine ? "나" : s.nickname}
                  </span>
                  <span className="text-[10px] font-bold text-accent">
                    {minutesSince(s.startedAt)}분째
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {open && (
        <StoryCheerSheet
          session={open}
          isMine={open.userId === myUserId}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function StoryCheerSheet({
  session,
  isMine,
  onClose,
}: {
  session: ActiveCrewSession;
  isMine: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-cheer-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto my-3 h-1 w-10 flex-none rounded-full bg-line" />

        <div className="flex flex-col gap-1 px-5 pb-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-11 w-11 flex-none">
              <Avatar
                src={session.avatarUrl}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xl"
              />
              <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <p id="story-cheer-title" className="truncate text-[15px] font-extrabold">
                {session.nickname}
                {isMine && <span className="ml-1 text-faint">(나)</span>}
              </p>
              <p className="text-xs font-bold text-accent">
                {minutesSince(session.startedAt)}분째 운동 중 🔥
              </p>
            </div>
          </div>

          {/* 내 운동에는 응원 버튼이 없다 — 카드와 같은 규칙이다. 대신 자리를
              비워 두면 "왜 아무것도 없지?"가 되므로 이유를 적는다. */}
          {isMine ? (
            <p className="mt-3 text-[12.5px] text-muted">
              지금 운동 중이에요. 크루가 응원을 보낼 수 있어요.
            </p>
          ) : (
            <CheerActions
              sessionId={session.sessionId}
              nickname={session.nickname}
            />
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-3 h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
