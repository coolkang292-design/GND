"use client";

import { Avatar } from "@/components/avatar";
import { getLevelProgress } from "@/lib/domain/progression";
import type { CrewMember, CrewRequest } from "@/lib/domain/crew-link";

/** 받은 요청 + 내 크루 — 표시 전용. 조회·상태는 /crew 페이지가 맡는다. */
export function CrewList({
  members,
  requests,
  pendingIds,
  onAccept,
  onReject,
  onRemove,
  onSelect,
}: {
  members: CrewMember[];
  requests: CrewRequest[];
  pendingIds: Set<string>;
  onAccept: (request: CrewRequest) => void;
  onReject: (request: CrewRequest) => void;
  onRemove: (member: CrewMember) => void;
  onSelect: (member: CrewMember) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-extrabold text-muted">
            받은 요청 {requests.length}건
          </h2>
          {requests.map((r) => (
            <div
              key={r.requestId}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  src={r.avatarUrl}
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-line/40 text-lg"
                />
                <span className="truncate text-[14px] font-extrabold">
                  {r.nickname}
                </span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  disabled={pendingIds.has(r.requestId)}
                  onClick={() => onAccept(r)}
                  className="rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-extrabold text-accent-ink disabled:bg-line disabled:text-muted"
                >
                  수락
                </button>
                <button
                  type="button"
                  disabled={pendingIds.has(r.requestId)}
                  onClick={() => onReject(r)}
                  className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted"
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-extrabold text-muted">
          내 크루 {members.length}명
        </h2>
        {members.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-3.5 py-6 text-center text-[13px] text-muted">
            아직 크루가 없어요.
            <br />
            닉네임으로 크루를 찾아보세요 🔍
          </p>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
            >
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <Avatar
                  src={m.avatarUrl}
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-line/40 text-lg"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-extrabold">
                    {m.nickname}
                  </span>
                  {/* ⚠️ DB 캐시값 currentLevel이 아니라 total_xp로 다시 계산한다.
                      홈 친구 목록·프로필 시트가 그렇게 하고 있어서(progression.ts:157),
                      여기만 캐시값을 쓰면 같은 사람이 화면마다 다른 레벨로 보인다. */}
                  <span className="block text-[12px] text-muted">
                    Lv.{getLevelProgress(m.totalXp).currentLevel}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={pendingIds.has(m.id)}
                onClick={() => onRemove(m)}
                className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-[12.5px] font-bold text-muted"
              >
                해제
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
