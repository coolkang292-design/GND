"use client";

import { useEffect, useState } from "react";
import { enablePush, getPushStatus } from "@/lib/push";

const DISMISS_KEY = "gnd-push-card-dismissed";

/** 홈 — 미구독 기기에 1회 보여주는 푸시 켜기 안내 카드 */
export function PushEnableCard() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    getPushStatus().then((s) => {
      if (!cancelled && s === "not-subscribed") setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 저장 실패해도 이번 세션은 닫힘
    }
    setVisible(false);
  }

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    try {
      const status = await enablePush();
      if (status === "subscribed") dismiss();
      else setVisible(false); // 거절/실패 — 프로필 탭에서 다시 시도 가능
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <section className="flex items-center justify-between gap-3 rounded-card border border-accent bg-surface p-4 shadow-card">
      <div>
        <p className="text-sm font-bold">🔔 잠금화면 알림 켜기</p>
        <p className="mt-0.5 text-xs text-muted">
          응원·찌르기·아침 브리핑을 앱 꺼져 있어도 받아요
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button
          onClick={dismiss}
          className="h-9 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold"
        >
          나중에
        </button>
        <button
          disabled={busy}
          onClick={() => void onEnable()}
          className="h-9 rounded-card-sm bg-accent px-3 text-sm font-extrabold text-accent-ink disabled:opacity-50"
        >
          켜기
        </button>
      </div>
    </section>
  );
}
