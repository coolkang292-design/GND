"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/avatar";
import { listBlockedUsers, unblockUser, type BlockedUser } from "@/lib/moderation";

/**
 * 차단한 사람 목록과 해제 (0089).
 *
 * ⚠️ **이 화면이 없으면 차단은 일방통행이다.** 차단하면 그 사람이 피드·크루
 *    목록·검색에서 통째로 사라지므로, 되돌릴 입구가 여기 말고 아무 데도 없다.
 *    실수로 눌렀거나 마음이 바뀐 사람이 영영 갇힌다.
 *
 * ⚠️ 차단이 0명이면 **섹션 자체를 그리지 않는다.** 대부분의 사람은 평생 0명이고,
 *    빈 카드를 계정 화면에 상설로 두면 "누군가를 차단해야 하는 곳"처럼 읽힌다.
 */
export function BlockedUsersSection() {
  const [items, setItems] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listBlockedUsers();
        if (!cancelled) setItems(list);
      } catch {
        // 실패해도 계정 화면 전체를 막지 않는다 — 여기는 부가 기능이고,
        // 비밀번호 변경·로그아웃이 이 화면의 본론이다.
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(user: BlockedUser) {
    if (busyId) return;
    setBusyId(user.id);
    setMessage(null);
    try {
      await unblockUser(user.id);
      setItems((prev) => (prev ?? []).filter((u) => u.id !== user.id));
      // 크루 링크는 지운 적이 없으므로 해제하면 관계가 그대로 돌아온다(0089).
      setMessage(`${user.nickname}님의 차단을 풀었어요`);
    } catch {
      setMessage("차단을 풀지 못했어요");
    } finally {
      setBusyId(null);
    }
  }

  // 로딩 중이거나 0명이면 자리를 만들지 않는다.
  if (items === null || items.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-bold">차단한 사람</h2>
      <p className="mt-1 text-xs text-muted">
        차단을 풀면 서로의 게시물이 다시 보이고, 크루였다면 관계도 그대로 돌아와요.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((u) => (
          <li
            key={u.id}
            className="flex items-center gap-2.5 rounded-card-sm border border-line bg-surface-2 px-3 py-2"
          >
            <Avatar
              src={u.avatarUrl}
              className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-surface text-base"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
              {u.nickname}
            </span>
            <button
              type="button"
              onClick={() => void unblock(u)}
              disabled={busyId === u.id}
              className="h-9 flex-none rounded-card-sm border border-line bg-surface px-3 text-[12px] font-bold disabled:opacity-60"
            >
              {busyId === u.id ? "…" : "차단 풀기"}
            </button>
          </li>
        ))}
      </ul>

      {message && <p className="mt-2 text-[12px] font-bold text-muted">{message}</p>}
    </section>
  );
}
