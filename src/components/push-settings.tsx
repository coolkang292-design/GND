"use client";

import { useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  getPushStatus,
  type PushStatus,
} from "@/lib/push";

const STATUS_DESC: Record<PushStatus, string> = {
  unsupported:
    "이 브라우저는 푸시를 지원하지 않아요. 아이폰은 홈 화면에 설치한 앱에서만 가능해요.",
  denied: "알림이 차단돼 있어요. 폰 설정 > 알림에서 GND를 허용해 주세요.",
  subscribed: "이 기기로 잠금화면 알림을 받고 있어요 🔔",
  "not-subscribed": "앱이 꺼져 있어도 잠금화면으로 알림을 받아요.",
};

/** 프로필 탭 — 기기 푸시 알림 켜기/끄기 카드 */
export function PushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onToggle() {
    if (busy || !status) return;
    setBusy(true);
    try {
      setStatus(status === "subscribed" ? await disablePush() : await enablePush());
    } finally {
      setBusy(false);
    }
  }

  if (status === null) return null;

  const actionable = status === "subscribed" || status === "not-subscribed";

  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-bold">기기 푸시 알림</p>
          <p className="mt-0.5 text-xs text-muted">{STATUS_DESC[status]}</p>
        </div>
        {actionable && (
          <button
            disabled={busy}
            onClick={() => void onToggle()}
            className={`h-9 flex-none rounded-card-sm px-3 text-sm font-extrabold disabled:opacity-50 ${
              status === "subscribed"
                ? "border border-line bg-surface-2"
                : "bg-accent text-accent-ink"
            }`}
          >
            {status === "subscribed" ? "끄기" : "켜기"}
          </button>
        )}
      </div>
    </section>
  );
}
