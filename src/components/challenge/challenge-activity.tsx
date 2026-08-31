"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  getChallengeActivity,
  type ChallengeActivityItem,
} from "@/lib/challenge";
import { sendCheer } from "@/lib/social";

/**
 * 챌린지 활동 — **active 챌린지에서만 열리는 임시 소셜 창** (0095).
 *
 * ⚠️⚠️ **크루 피드(`/feed`)와 다른 것이다.** 같은 챌린지를 한다는 이유로
 *    50명·100명의 운동을 크루 피드에 섞지 않는다. 이 창은 챌린지 화면 안에만
 *    있고, 챌린지가 끝나면 서버가 `challenge_not_found`로 막아 **자동으로 닫힌다.**
 *    (권한을 지우는 것이 아니라 상태 판정으로 사라진다 — 이미 보낸 응원은 남는다)
 *
 * ⚠️ 여기 보이는 운동은 **그 챌린지 기간의, 공개된, 삭제되지 않은** 것뿐이다.
 *    서버가 자른다(`get_challenge_activity`). 클라이언트가 challengeId를 보냈다고
 *    믿고 열어 주는 구조가 아니다.
 */
export function ChallengeActivity({ challengeId }: { challengeId: string }) {
  const [items, setItems] = useState<ChallengeActivityItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await getChallengeActivity(challengeId));
  }, [challengeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await getChallengeActivity(challengeId);
      if (!cancelled) setItems(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  async function cheer(item: ChallengeActivityItem) {
    if (busy) return;
    setBusy(item.session_id);
    setNote(null);
    try {
      await sendCheer(item.session_id, "fire");
      setNote(`${item.nickname ?? "참가자"}님에게 응원을 보냈어요 📣`);
      await load();
    } catch (e) {
      // ⚠️ 실패 사유를 뭉개지 않는다 — 상한·쿨다운은 사용자가 알아야 다시 안 누른다.
      const msg = e instanceof Error ? e.message : "";
      setNote(
        msg.includes("cheer_limit")
          ? "이 운동에는 응원을 다 보냈어요 (3번까지)"
          : msg.includes("cheer_cooldown")
            ? "잠시 뒤에 다시 보낼 수 있어요"
            : msg.includes("not_active")
              ? "지금은 운동 중이 아니에요"
              : "응원을 보내지 못했어요",
      );
    } finally {
      setBusy(null);
    }
  }

  // 아직 안 불러온 동안은 자리만 잡는다. 챌린지 화면의 다른 카드가 밀리지 않게.
  if (items === null) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-extrabold">챌린지 활동</h3>
        <span className="text-xs text-muted">챌린지 기간 · 진행 중에만</span>
      </div>

      {items.length === 0 ? (
        <p className="py-3 text-[13px] text-muted">
          아직 이 챌린지에서 올라온 운동이 없어요. 먼저 시작해 보세요 💪
        </p>
      ) : (
        <ul className="mt-1">
          {items.map((it) => (
            <li
              key={it.session_id}
              className="flex items-center gap-2.5 border-t border-line/60 py-2 first:border-t-0"
            >
              <Avatar
                src={it.avatar_url}
                className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-base"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold">
                  {it.nickname ?? "참가자"}
                  {it.is_mine && (
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      나
                    </span>
                  )}
                </p>
                <p className="truncate text-[12px] text-muted">
                  {it.status === "active" ? "운동 중" : "운동 완료"}
                  {it.title ? ` · ${it.title}` : ""}
                  {it.has_photo ? " · 📷" : ""}
                  {it.cheer_count > 0 ? ` · 응원 ${it.cheer_count}` : ""}
                </p>
              </div>

              {/* ⚠️ 자기 운동에는 응원 버튼을 그리지 않는다 — 서버도 own_session으로
                  막지만, 눌러서 실패하는 버튼을 두지 않는 것이 먼저다.
                  운동 중일 때만 보인다(완료된 운동은 서버가 not_active로 막는다). */}
              {!it.is_mine && it.status === "active" && (
                <button
                  type="button"
                  onClick={() => void cheer(it)}
                  disabled={busy === it.session_id || it.my_cheers >= 3}
                  className="flex-none rounded-full border border-line px-2.5 py-1 text-[12px] font-bold disabled:opacity-45"
                  aria-label={`${it.nickname ?? "참가자"}님 응원하기`}
                >
                  📣 응원
                  {it.my_cheers > 0 ? ` ${it.my_cheers}/3` : ""}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-2 text-[12px] text-muted">{note}</p>}

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        여기 보이는 것은 <b>이 챌린지 기간의 운동</b>이고, 챌린지가 끝나면
        닫혀요. 계속 서로의 운동을 보고 싶으면 참가자 이름을 눌러{" "}
        <b>크루로 신청</b>하세요.
      </p>
    </section>
  );
}
