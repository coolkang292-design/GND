"use client";

import { useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { inviteToChallenge, issueChallengeInviteCode } from "@/lib/challenge";
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
  const [link, setLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  // 방장이 아니면 초대 권한이 없으므로 자리도 만들지 않는다(서버도 not_host로 막는다).
  if (myRole !== "host") return null;

  // 시작한 뒤에는 초대가 닫힌다 — 중도 합류는 점수가 불공정해지기 때문이고,
  // 서버(invite_to_challenge·join_challenge_with_code)가 invalid_status로 막는다.
  //
  // 이때 영역을 통째로 숨기면 "왜 초대가 없지?"가 된다. 자리는 유지하고 이유를
  // 적는다 — 규칙을 감추지 말고 알려준다.
  if (status !== "setup") {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <UiIcon name="trophy" size={20} />
          챌린지 초대
        </h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {status === "active"
            ? "이미 시작해서 초대가 닫혔어요. 중간에 합류하면 점수가 공정하지 않아서예요."
            : "끝난 챌린지예요. 새 챌린지를 만들어 초대해 보세요."}
        </p>
      </section>
    );
  }

  /** 링크 만들기 + 클립보드 복사. 코드 발급은 서버가 멱등이라 눌러도 안 바뀐다. */
  async function handleShareLink() {
    if (linkBusy) return;
    setLinkBusy(true);
    setMessage(null);
    try {
      const code = await issueChallengeInviteCode(challengeId);
      const url = `${window.location.origin}/challenge?join=${code}`;
      setLink(url);
      // 클립보드는 권한·컨텍스트에 따라 실패할 수 있다. 실패해도 링크는 화면에
      // 띄워 두므로 손으로 복사하면 된다 — 조용히 사라지게 두지 않는다.
      try {
        await navigator.clipboard.writeText(url);
        setMessage("링크를 복사했어요 — 붙여넣기로 공유하세요 🔗");
      } catch {
        setMessage("아래 링크를 길게 눌러 복사하세요");
      }
    } catch (e) {
      setMessage(inviteError(e));
    } finally {
      setLinkBusy(false);
    }
  }

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
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
        <UiIcon name="trophy" size={20} />
        챌린지 초대
      </h3>
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
      {/* 크루 밖 사람을 부르려면 닉네임을 정확히 알아야 하는데, 그걸 알려면
          어차피 밖에서 연락해야 한다. 링크가 그 자리를 대신한다. */}
      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void handleShareLink()}
          disabled={linkBusy}
          className="h-10 w-full rounded-card-sm border border-line bg-surface-2 text-[13px] font-bold disabled:opacity-40"
        >
          {linkBusy ? "링크 만드는 중…" : "🔗 초대 링크 복사하기"}
        </button>
        {link && (
          // 라벨이 없으면 주소창처럼 보인다 — 실제로 "주소에 join이 남아 있다"는
          // 오해를 샀다. 이건 상대에게 보낼 링크이고, 코드가 들어 있어야 한다.
          <div className="mt-2 rounded-card-sm bg-surface-2 px-2.5 py-2">
            <p className="text-[10px] font-bold text-faint">상대에게 보낼 링크</p>
            <p className="mt-0.5 break-all text-[11px] text-muted">{link}</p>
          </div>
        )}
        {/* 링크 참가는 친구 관계를 만들지 않고, 공개 범위도 이 챌린지 안으로 제한된다. */}
        <p className="mt-1.5 text-[11px] text-muted">
          링크로 참가해도{" "}
          <b className="text-text">서로 크루가 되지는 않아요.</b> 이름과 랭킹은 이
          챌린지 안에서만 보여요.
        </p>
      </div>

      {message && (
        <p className="mt-2 text-[11px] font-bold text-accent">{message}</p>
      )}
    </section>
  );
}
