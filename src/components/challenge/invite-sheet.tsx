"use client";

import { useState } from "react";
import { inviteToChallenge } from "@/lib/challenge";
// 0038이 만든 닉네임 정확 일치 검색. 단일 결과 또는 null을 돌려준다(배열 아님).
// isSearchable 게이트가 있어 빈 입력은 조회 없이 null이 된다.
import { searchProfileByNickname } from "@/lib/crew-link";

/** invite_to_challenge의 오류 코드를 사람 말로 */
export function inviteError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("already_invited")) return "이미 초대했거나 참가 중이에요";
  if (msg.includes("not_host")) return "방장만 초대할 수 있어요";
  if (msg.includes("self_invite")) return "본인은 초대할 수 없어요";
  if (msg.includes("target_not_found")) return "그 닉네임을 찾지 못했어요";
  if (msg.includes("invalid_status")) return "시작한 챌린지에는 초대할 수 없어요";
  return `초대 실패: ${msg}`;
}

/**
 * 챌린지 초대 — 닉네임으로 찾아 초대한다.
 *
 * host + setup에서만 렌더한다. 서버(invite_to_challenge)가 같은 두 조건을 이미
 * 강제하므로 이건 화면 편의지 경계가 아니다 — 경계는 RPC에 있다.
 */
export function InviteSheet({
  challengeId,
  myRole,
  status,
  onInvited,
}: {
  challengeId: string;
  myRole: "host" | "member";
  status: string;
  onInvited: () => void;
}) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (myRole !== "host" || status !== "setup") return null;

  async function handleInvite() {
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchProfileByNickname(nickname.trim());
      if (!found) {
        setMessage("그 닉네임을 찾지 못했어요");
        return;
      }
      await inviteToChallenge(challengeId, found.id);
      setMessage(`${found.nickname}님을 초대했어요 🏆`);
      setNickname("");
      onInvited();
    } catch (e) {
      setMessage(inviteError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="text-sm font-extrabold">🏆 크루 초대</h3>
      <p className="mt-0.5 text-[11px] text-muted">
        닉네임으로 찾아 초대해요. 시작 전에만 초대할 수 있어요.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
          className="min-w-0 flex-1 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleInvite()}
          disabled={busy || !nickname.trim()}
          className="shrink-0 rounded-card-sm bg-accent px-3.5 py-2 text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          {busy ? "초대 중…" : "초대"}
        </button>
      </div>
      {message && (
        <p className="mt-2 text-[11px] font-bold text-accent">{message}</p>
      )}
    </section>
  );
}
