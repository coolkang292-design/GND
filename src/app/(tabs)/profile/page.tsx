"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BugReportSheet } from "@/components/bug-report-sheet";
import { GrowthHub } from "@/components/profile/growth-hub";
import { PushSettings } from "@/components/push-settings";
import { getIncomingCrewRequests } from "@/lib/crew-link";
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
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<Set<keyof NotificationSettings>>(
    () => new Set(),
  );
  const [requestCount, setRequestCount] = useState(0);

  // 받은 크루 요청 수 — 진입점에 뱃지로 띄운다. 실패하면 뱃지만 안 뜬다.
  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    getIncomingCrewRequests()
      .then((rows) => {
        if (!cancelled) setRequestCount(rows.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  // 알림 설정은 톱니를 열었을 때만 조회한다 — 성장 허브 첫 렌더를 늦추지 않는다.
  useEffect(() => {
    if (!showSettings || !configured || loading || !userId) return;
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
  }, [showSettings, configured, loading, userId]);

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
      <header className="flex items-start justify-between gap-2 pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">내 정보</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">나의 캐릭터 성장</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="알림 설정"
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-card-sm border text-base ${
            showSettings
              ? "border-accent bg-accent-weak"
              : "border-line bg-surface"
          }`}
        >
          ⚙️
        </button>
      </header>

      {showSettings && (
        <>
          {/* 계정(이메일·비밀번호)은 알림 설정과 성격이 다르지만, 톱니 안이
              사용자가 "설정"을 찾는 유일한 곳이라 여기에 둔다. */}
          <Link
            href="/account"
            className="flex items-center justify-between rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <div>
              <p className="text-sm font-bold">계정</p>
              <p className="mt-0.5 text-xs text-muted">
                로그인 이메일 확인 · 비밀번호 변경
              </p>
            </div>
            <span className="text-muted">›</span>
          </Link>

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

          {/* 신고는 알림 설정과 성격이 다르지만, 계정과 같은 이유로 여기에 둔다 —
              톱니 안이 사용자가 "설정"을 찾는 유일한 곳이다. 앱이 죽은 화면에도
              같은 시트가 있다(app/error.tsx). */}
          <BugReportSheet route={pathname ?? null} />
        </>
      )}

      <GrowthHub />

      <Link
        href="/crew"
        className="flex items-center justify-between rounded-card border border-line bg-surface px-3.5 py-3.5 shadow-card"
      >
        <span className="flex items-center gap-2 text-[14px] font-extrabold">
          🤝 크루
          {requestCount > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-ink">
              {requestCount}
            </span>
          )}
        </span>
        <span className="text-[13px] text-muted">닉네임으로 찾기 ›</span>
      </Link>
    </div>
  );
}
