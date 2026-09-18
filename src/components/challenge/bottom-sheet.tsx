"use client";

import { useEffect, type ReactNode } from "react";

/**
 * 챌린지 탭의 바닥 시트 껍데기 (2026-09-18) — 만들기·목표 설정·관리가 같이 쓴다.
 *
 * ⚠️⚠️ **경고문과 대표 버튼은 `footer`에, 스크롤 영역 밖에 둔다** (2026-08-17 옛
 *    목표 시트에서 배운 것). 경고가 스크롤 안에 있으면 내용이 길어질 때 접힘선
 *    밖으로 밀려서 **버튼을 눌렀는데 아무 일도 안 일어난 것처럼** 보인다.
 *
 * ⚠️ `shrink-0`을 빼지 마라. 시트가 `flex-col`이라 내용이 길면 footer가 눌려
 *    버튼 높이가 26px까지 줄어든다(2026-08-14 실측).
 */
export function BottomSheet({
  titleId,
  onClose,
  header,
  footer,
  children,
}: {
  /** `aria-labelledby` 대상 — 헤더 안의 제목에 같은 id를 단다 */
  titleId: string;
  onClose: () => void;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-[22px] border-t border-line bg-surface px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-2 h-1 w-10 flex-none rounded-full bg-line" />
        <div className="flex-none">{header}</div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>
        {footer && <div className="shrink-0 pt-2">{footer}</div>}
      </div>
    </>
  );
}

/** 시트 상단 줄 — 왼쪽 뒤로/닫기, 가운데 제목 */
export function SheetHeader({
  titleId,
  title,
  onBack,
  onClose,
}: {
  titleId: string;
  title: string;
  /** 있으면 ← 뒤로, 없으면 오른쪽 ✕ 닫기만 */
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-10 items-center gap-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-9 w-9 flex-none place-items-center rounded-full text-lg font-bold text-muted"
        >
          ←
        </button>
      ) : (
        <span className="w-9 flex-none" />
      )}
      <h2
        id={titleId}
        className="min-w-0 flex-1 truncate text-center text-[16px] font-extrabold"
      >
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="grid h-9 w-9 flex-none place-items-center rounded-full text-lg font-bold text-muted"
      >
        ✕
      </button>
    </div>
  );
}

/** 금색으로 채운 대표 버튼 — 한 화면에 **하나만** 둔다 */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-13 min-h-[52px] w-full rounded-card bg-accent text-[16px] font-extrabold text-accent-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}
