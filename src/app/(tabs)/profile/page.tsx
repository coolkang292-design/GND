"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PushSettings } from "@/components/push-settings";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/notification-settings";

const TOGGLES: {
  key: keyof NotificationSettings;
  label: string;
  desc: string;
}[] = [
  { key: "morning_brief", label: "아침 브리핑", desc: "매일 오전 9시 스트릭 브리핑 ☀️" },
  { key: "cheers", label: "응원", desc: "크루가 보낸 응원 📣" },
  { key: "pokes", label: "찌르기", desc: "오늘 미운동 시 크루의 콕 👉" },
  { key: "ranks", label: "순위", desc: "챌린지 종료·시상대 🏁" },
  { key: "record_views", label: "성과 열람", desc: "꾸준왕이 내 성과를 볼 때 👀" },
];

export default function ProfilePage() {
  const { userId, loading, configured } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<Set<keyof NotificationSettings>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    getNotificationSettings(userId)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  async function toggle(key: keyof NotificationSettings) {
    if (!userId || pending.has(key)) return;
    setPending((p) => new Set(p).add(key));
    const next = !settings[key];
    setSettings((s) => ({ ...s, [key]: next })); // 낙관적 갱신
    try {
      await updateNotificationSettings(userId, { [key]: next });
    } catch {
      setSettings((s) => ({ ...s, [key]: !next })); // 실패 롤백
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="pt-2 pb-1">
        <h1 className="text-[19px] font-extrabold tracking-tight">내 정보</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">알림 설정</p>
      </header>

      <PushSettings />

      {loadError && (
        <p className="rounded-card-sm border border-line bg-surface px-3 py-2.5 text-xs text-muted">
          설정을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.
        </p>
      )}

      <section className="rounded-card border border-line bg-surface shadow-card">
        {TOGGLES.map((t, i) => (
          <div
            key={t.key}
            className={`flex items-center justify-between p-4 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <div>
              <p className="text-sm font-bold">{t.label}</p>
              <p className="mt-0.5 text-xs text-muted">{t.desc}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings[t.key]}
              aria-label={`${t.label} 알림`}
              disabled={!ready || loadError || pending.has(t.key)}
              onClick={() => void toggle(t.key)}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${
                settings[t.key] ? "bg-accent" : "border border-line bg-surface-2"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  settings[t.key] ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </section>
      <p className="px-1 text-[11px] text-faint">
        꺼두면 해당 알림이 알림함에 쌓이지 않아요. (응원·찌르기는 상대에게
        안내돼요)
      </p>
    </div>
  );
}
