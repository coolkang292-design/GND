"use client";

import { useEffect, useState } from "react";

import { blockConfirmCopy } from "@/lib/domain/moderation";
import { blockUser } from "@/lib/moderation";

/**
 * 차단 확인 시트 (2026-08-31).
 *
 * ── 왜 "신고"가 없나 ───────────────────────────────────────
 *
 * 처음엔 신고 + 차단 두 갈래로 만들었다가 사장님과 first-principles로 따져
 * 걷어냈다. 이유는 **규모가 작아서**가 아니라 **신고의 값이 0이어서**다:
 *
 *   차단 = 도구.   피해자 혼자서 즉시 완결된다. 규모와 무관하게 값이 있다.
 *   신고 = 요청.   값이 전적으로 "운영자가 조치할 수 있는가"에 달렸다.
 *
 * 그런데 GND에는 **조치 수단이 하나도 없다** — ban·suspend·kick RPC가 없고
 * `/admin`에 조치 버튼이 없다. 있는 건 본인이 크루를 끊거나 방을 나가는 것뿐이다.
 * 그래서 옛 화면은 *"접수됐어요. 확인하고 처리할게요."* 라고 **뒤에 아무것도
 * 없는 약속**을 했다. 그건 아무것도 없는 것보다 나쁘다 — 사용자가 신고해 놓고
 * 기다리는 동안 정작 차단을 안 한다.
 *
 * ⚠️ `user_reports` 테이블과 `report_user` RPC는 0089에 들어간 채 **잠들어 있다**
 *    (아무도 안 부른다). 지우지 않은 이유는 되살리기가 싸기 때문이다 — 조치
 *    수단이 생기거나 앱스토어 심사(Apple 1.2는 UGC 앱에 신고를 의무화한다)가
 *    필요해지면 진입점만 다시 붙이면 된다. **그 전까지 화면에 꺼내지 마라.**
 *
 * ⚠️ 확인 단계는 남겼다. 차단은 상대가 통째로 안 보이게 되는 동작이라, 무엇이
 *    일어나는지 모르고 누르면 안 된다. 그래서 문구가 세 가지를 말한다 —
 *    안 보이게 된다 · 상대는 모른다 · 되돌릴 수 있다.
 */
export function BlockSheet({
  targetId,
  targetNickname,
  onClose,
  onBlocked,
}: {
  targetId: string;
  targetNickname: string;
  onClose: () => void;
  /** 차단이 끝난 뒤 — 부모가 목록·화면을 다시 그려야 한다 */
  onBlocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await blockUser(targetId);
      onBlocked();
      onClose();
    } catch {
      setMessage("차단하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  const copy = blockConfirmCopy(targetNickname);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-sheet-title"
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto my-3 h-1 w-10 flex-none rounded-full bg-line" />

        <div className="flex flex-col gap-3 p-5">
          <h3 id="block-sheet-title" className="text-base font-extrabold">
            {copy.title}
          </h3>
          <p className="text-[13px] leading-relaxed text-muted">{copy.body}</p>

          {message && (
            <p role="alert" className="text-[12px] font-bold text-accent">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="h-12 rounded-card bg-accent text-[14px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "차단하는 중…" : copy.confirm}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
          >
            그만두기
          </button>
        </div>
      </div>
    </>
  );
}
