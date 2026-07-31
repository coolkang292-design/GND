"use client";

import { useState } from "react";
import { BugReportError, submitBugReport } from "@/lib/bug-report";

/**
 * 오류 신고 — 사람은 한 줄만 쓴다.
 *
 * "어느 화면에서 무엇을 하다가"는 **묻지 않는다.** 브라우저가 이미 알고 있고,
 * 비개발자에게 잘 적으라고 요구하면 신고 자체를 안 하게 된다. 경로는 자동으로
 * 채워 읽기 전용으로 보여준다 — 자동이라는 걸 사용자가 알아야 안심하고 짧게 쓴다.
 *
 * **라우터 훅을 쓰지 않는다.** `global-error.tsx`는 루트 레이아웃을 통째로 대체하는
 * 자리라 `usePathname()`이 성립한다는 보장이 없다. 거기서 훅이 던지면 **오류 화면
 * 자체가 다시 죽어** 신고할 방법이 사라진다 — 이 컴포넌트가 가장 필요한 순간에.
 * 경로는 호출부가 넘긴다(페이지는 `usePathname()`, global-error는 `location.pathname`).
 *
 * @param route 신고 시점의 경로. 모르면 null
 * @param extraContext 화면이 아는 추가 정보(예: 던져진 예외 메시지)
 */
export function BugReportSheet({
  route,
  extraContext,
  onDone,
}: {
  route: string | null;
  extraContext?: Record<string, unknown>;
  onDone?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = message.trim().length < 2;

  async function handleSubmit() {
    if (busy || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      await submitBugReport(message.trim(), route, extraContext);
      setDone(true);
      setMessage("");
      onDone?.();
    } catch (e) {
      setError(
        e instanceof BugReportError
          ? e.message
          : "신고를 보내지 못했어요. 잠시 후 다시 시도하거나 카톡으로 알려주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-sm font-bold">접수됐어요 🙏</p>
        <p className="mt-1 text-xs text-muted">
          확인하고 고칠게요. 고쳐지면 알림으로 알려드려요.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-xs font-bold text-muted underline"
        >
          하나 더 신고하기
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="text-sm font-extrabold">🐞 오류 신고</h3>
      <p className="mt-0.5 text-[11px] text-muted">
        이상한 걸 발견하면 알려주세요. 짧게 적어도 괜찮아요.
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        aria-label="신고 내용"
        placeholder="어떤 게 이상했나요? 편하게 적어주세요"
        className="mt-3 w-full resize-none rounded-card-sm border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
      />

      {route && (
        <p className="mt-2 text-[11px] text-faint">
          지금 화면: <span className="font-bold">{route}</span> — 자동으로 함께 보내요
        </p>
      )}

      {/* 무엇이 전송되는지 밝힌다. 몰래 보내지 않는다. */}
      <p className="mt-1 text-[11px] text-faint">
        화면 위치 · 기기 정보 · 최근 동작이 함께 전송돼요. 운동 기록이나 사진은 보내지
        않아요.
      </p>

      {error && (
        <p className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || tooShort}
        onClick={() => void handleSubmit()}
        className="mt-3 w-full rounded-card-sm bg-accent px-4 py-3 text-sm font-extrabold text-accent-ink disabled:opacity-50"
      >
        {busy ? "보내는 중…" : "신고 보내기"}
      </button>
    </section>
  );
}
