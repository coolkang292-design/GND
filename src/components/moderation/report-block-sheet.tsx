"use client";

import { useEffect, useState } from "react";

import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  blockConfirmCopy,
  reportDraftMessage,
  validateReportDraft,
  type ReportReason,
} from "@/lib/domain/moderation";
import { blockUser, reportUser } from "@/lib/moderation";

type Mode = "menu" | "report" | "block";

/**
 * 신고·차단 시트 (0089).
 *
 * ⚠️ **모집 카드 겉면에 두지 않았다.** 겉면에 신고 버튼이 있으면 목록이
 *    "고발 목록"처럼 읽히고, 오탭도 잦다. 상세를 연 사람 — 즉 그 사람에 대해
 *    판단을 하고 있는 사람만 만나면 충분하다.
 *
 * ⚠️ 차단은 **되돌릴 수 있다**는 것을 누르기 전에 말한다. 안 그러면 무서워서
 *    아무도 안 쓰고, 정작 불편한 사람을 계속 본다.
 */
export function ReportBlockSheet({
  targetId,
  targetNickname,
  challengeId,
  onClose,
  onBlocked,
}: {
  targetId: string;
  targetNickname: string;
  /** 모집글을 보고 신고한 경우 어느 챌린지였는지 (0089) */
  challengeId?: string;
  onClose: () => void;
  /** 차단이 끝난 뒤 — 부모가 목록에서 그 사람을 빼야 한다 */
  onBlocked: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submitReport() {
    if (busy) return;
    const problem = validateReportDraft({ reason, note });
    if (problem) {
      setMessage(reportDraftMessage(problem));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // 서버가 already_open을 줘도 실패로 다루지 않는다 — 신고자에게는 똑같이
      // 접수된 것이다. 다르게 보여주면 다시 누르게 되고, 답은 계속 같다.
      await reportUser({
        targetId,
        reason: reason!,
        note,
        challengeId,
      });
      setDone(true);
      setMessage("접수됐어요. 확인하고 처리할게요.");
    } catch {
      setMessage("신고하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock() {
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
        aria-labelledby="moderation-sheet-title"
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto my-3 h-1 w-10 flex-none rounded-full bg-line" />

        <div className="flex flex-col gap-3 p-5">
          {mode === "menu" && (
            <>
              <h3 id="moderation-sheet-title" className="text-base font-extrabold">
                {targetNickname}님
              </h3>
              <p className="text-[12px] text-muted">
                불편한 일이 있었다면 알려 주세요. 신고는 상대에게 알려지지 않아요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("report");
                  setMessage(null);
                }}
                className="h-12 rounded-card border border-line bg-surface-2 text-[14px] font-bold"
              >
                🚩 신고하기
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("block");
                  setMessage(null);
                }}
                className="h-12 rounded-card border border-line bg-surface-2 text-[14px] font-bold text-accent"
              >
                🚫 차단하기
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
              >
                닫기
              </button>
            </>
          )}

          {mode === "report" && (
            <>
              <h3 id="moderation-sheet-title" className="text-base font-extrabold">
                무엇이 문제였나요?
              </h3>

              {/* 원탭 칩. 자유 입력을 첫 화면에 두면 대부분 비운 채 보낸다 —
                  캡션 입력에서 배운 것과 같다(사용자 결정). */}
              <div className="flex flex-col gap-2">
                {REPORT_REASONS.map((r) => {
                  const active = reason === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={done}
                      onClick={() => {
                        setReason(r.id);
                        setMessage(null);
                      }}
                      aria-pressed={active}
                      className={`rounded-card border px-3.5 py-2.5 text-left ${
                        active
                          ? "border-accent bg-accent/10"
                          : "border-line bg-surface-2"
                      }`}
                    >
                      <span className="block text-[13.5px] font-bold">{r.label}</span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        {r.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-1 flex flex-col gap-1">
                <span className="text-[12px] font-bold text-muted">
                  무슨 일이 있었나요?
                  {reason === "other" ? " (필요해요)" : " (선택)"}
                </span>
                <textarea
                  value={note}
                  disabled={done}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setMessage(null);
                  }}
                  rows={3}
                  maxLength={REPORT_NOTE_MAX}
                  placeholder="언제, 어디서, 무슨 일이 있었는지 적어 주세요"
                  className="rounded-card border border-line bg-surface-2 px-3 py-2 text-[13px] leading-relaxed"
                />
                <span className="self-end text-[11px] text-faint">
                  {note.trim().length}/{REPORT_NOTE_MAX}
                </span>
              </label>

              {message && (
                <p
                  className={`text-[12px] font-bold ${done ? "text-muted" : "text-accent"}`}
                >
                  {message}
                </p>
              )}

              {!done ? (
                <button
                  type="button"
                  onClick={() => void submitReport()}
                  disabled={busy}
                  className="h-12 rounded-card bg-accent text-[14px] font-extrabold text-white disabled:opacity-60"
                >
                  {busy ? "보내는 중…" : "신고 보내기"}
                </button>
              ) : (
                // 신고한 사람은 대개 그 사람을 더 안 보고 싶어 한다. 신고와
                // 차단을 묶지는 않되(결정), 바로 이어서 할 수 있게 둔다.
                <button
                  type="button"
                  onClick={() => {
                    setMode("block");
                    setMessage(null);
                  }}
                  className="h-12 rounded-card border border-line bg-surface-2 text-[14px] font-bold text-accent"
                >
                  🚫 이 사람 차단하기
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
              >
                {done ? "닫기" : "그만두기"}
              </button>
            </>
          )}

          {mode === "block" && (
            <>
              <h3 id="moderation-sheet-title" className="text-base font-extrabold">
                {copy.title}
              </h3>
              <p className="text-[13px] leading-relaxed text-muted">{copy.body}</p>

              {message && (
                <p className="text-[12px] font-bold text-accent">{message}</p>
              )}

              <button
                type="button"
                onClick={() => void confirmBlock()}
                disabled={busy}
                className="h-12 rounded-card bg-accent text-[14px] font-extrabold text-white disabled:opacity-60"
              >
                {busy ? "차단하는 중…" : copy.confirm}
              </button>
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
              >
                뒤로
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
