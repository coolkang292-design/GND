"use client";

import { useState } from "react";
import Link from "next/link";
import { BugReportError, submitAccountRequest } from "@/lib/bug-report";

/**
 * 내 데이터 삭제·열람 **요청 통로** (2026-09-03 외부 파일럿 P0-1).
 *
 * ⚠️ **이건 탈퇴 버튼이 아니다.** 누르는 즉시 계정이 지워지지 않는다. 파일럿
 *    기간에는 자동 탈퇴 기능을 만들지 않기로 했고(범위 밖), 대신 **요청이 확실히
 *    운영자에게 닿는 길**만 연다. 그래서 문구가 "삭제됩니다"가 아니라
 *    "요청을 보냅니다"다 — 여기서 과장하면 사용자는 지워진 줄 알고 떠난다.
 *
 * ⚠️⚠️ **접힌 채로 시작한다.** `/account`는 사람들이 계정을 지키러(카카오·구글
 *    연결) 오는 화면이다. 거기에 빨간 삭제 상자를 상설로 펴 두면 지키러 온 사람에게
 *    지우는 문을 들이미는 꼴이라, 첫 화면의 뜻이 흐려진다. 열어야 보인다.
 *
 * 전송 경로와 `trail`을 안 보내는 이유는 `lib/bug-report.ts`의
 * `submitAccountRequest` 주석에 있다.
 */
export function DataDeletionRequest() {
  const [open, setOpen] = useState(false);
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
      await submitAccountRequest(message.trim());
      setDone(true);
      setMessage("");
    } catch (e) {
      setError(
        e instanceof BugReportError
          ? e.message
          : "요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-bold">개인정보 · 내 데이터</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        어떤 정보를 왜 보관하는지는{" "}
        <Link href="/privacy" className="font-bold text-fg underline">
          개인정보 처리방침
        </Link>
        에 적어 두었어요.
      </p>

      {done ? (
        <div className="mt-3 rounded-card-sm bg-surface-2 p-3">
          <p className="text-sm font-bold">요청이 접수됐어요 🙏</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            운영자가 확인하고 처리한 뒤 알림으로 알려드릴게요. 아직 계정은 그대로
            남아 있어요.
          </p>
        </div>
      ) : open ? (
        <div className="mt-3">
          {/* 무엇을 요청할 수 있는지 먼저 보여준다. 빈 칸만 주면 사람들은
              무엇을 적어야 할지 몰라서 아무것도 안 적는다. */}
          <p className="text-[11px] leading-relaxed text-faint">
            예: 계정과 모든 데이터를 지워 주세요 · 인증사진만 지워 주세요 · 내
            데이터를 보여 주세요
          </p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            aria-label="요청 내용"
            placeholder="무엇을 지우거나 확인하고 싶은지 적어 주세요"
            className="mt-2 w-full resize-none rounded-card-sm border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
          />

          {/* 몰래 보내지 않는다 — 신고 시트와 같은 규약. */}
          <p className="mt-1 text-[11px] text-faint">
            어느 계정에서 보낸 요청인지 함께 전달돼요. 운동 기록이나 사진은 보내지
            않아요.
          </p>

          {error && (
            <p
              className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-xs text-muted"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={busy}
              className="h-11 flex-1 rounded-full border border-line bg-surface-2 text-sm font-bold disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy || tooShort}
              onClick={() => void handleSubmit()}
              className="h-11 flex-1 rounded-full bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy ? "보내는 중…" : "요청 보내기"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 h-11 w-full rounded-full border border-line bg-surface-2 text-sm font-bold"
        >
          내 데이터 삭제 요청
        </button>
      )}
    </section>
  );
}
