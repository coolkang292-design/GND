"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

type FlowEntry = { element: HTMLElement; back: () => void };
const openFlows: FlowEntry[] = [];
let releaseScroll: (() => void) | null = null;
let historyToken: string | null = null;
let historyHref = "";
let consumingHistory = false;
let pendingLeave: (() => void) | null = null;
let listening = false;

export const FULL_SCREEN_BACK_EVENT = "gnd-fullscreen-back";

function pushFlowHistory() {
  historyToken = `gnd-flow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  historyHref = location.href;
  history.pushState({ ...history.state, gndFullScreenFlow: historyToken }, "", historyHref);
}

/** Consume our local guard before callers close and navigate asynchronously. */
export function leaveFullScreenFlow(action: () => void) {
  if (pendingLeave) return;
  if (consumingHistory) { pendingLeave = action; return; }
  if (historyToken && history.state?.gndFullScreenFlow === historyToken && location.href === historyHref) {
    pendingLeave = action;
    consumingHistory = true;
    history.back();
  } else action();
}

/** A single history entry belongs to the whole nested editor/picker flow. */
function onHistoryBack() {
  if (consumingHistory) {
    consumingHistory = false;
    if (pendingLeave) {
      const action = pendingLeave;
      pendingLeave = null;
      historyToken = null;
      action();
      return;
    }
    // A picker can reopen before the previous history.back() has completed.
    if (openFlows.length > 0 && historyToken === null) pushFlowHistory();
    return;
  }
  const current = openFlows.at(-1);
  if (!current || !historyToken || location.href !== historyHref) return;
  if (history.state?.gndFullScreenFlow === historyToken) return;
  history.pushState({ ...history.state, gndFullScreenFlow: historyToken }, "", historyHref);
  if (isTopFlow(current.element)) current.back();
  else window.dispatchEvent(new Event(FULL_SCREEN_BACK_EVENT));
}

function isTopFlow(element: HTMLElement) {
  if (openFlows.at(-1)?.element !== element) return false;
  // The existing routine import confirmation is a later sibling, above the picker.
  return ![...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
    .some((dialog) => !element.contains(dialog) && !dialog.contains(element) &&
      Boolean(element.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING));
}

function lockBackground() {
  if (releaseScroll) return;
  const body = document.body;
  const root = document.documentElement;
  const saved = { overflow: body.style.overflow, position: body.style.position,
    top: body.style.top, width: body.style.width, rootOverflow: root.style.overflow };
  const scrollY = window.scrollY;
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  root.style.overflow = "hidden";
  releaseScroll = () => {
    Object.assign(body.style, { overflow: saved.overflow, position: saved.position,
      top: saved.top, width: saved.width });
    root.style.overflow = saved.rootOverflow;
    if (scrollY !== 0) window.scrollTo(0, scrollY);
    releaseScroll = null;
  };
}

/**
 * 작은 화면(키보드가 올라와 높이 < 600px) 여부. CSS로만 숨기면 숨은 메뉴가 문서에 남아
 * 같은 글자가 두 번 잡히고 화면 읽기 도구에도 두 벌이 읽힌다 — 그래서 **아예 그리지 않는다**.
 */
const FlowCompactContext = createContext(false);
export function CompactOnly({ children }: { children: ReactNode }) {
  return useContext(FlowCompactContext) ? <>{children}</> : null;
}
export function WideOnly({ children }: { children: ReactNode }) {
  return useContext(FlowCompactContext) ? null : <>{children}</>;
}

export type FlowConfirmation = {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Presentation only: callers continue to own their selected exercises and saving. */
export function FullScreenFlow({ title, subtitle, children, onBack, onClose,
  backLabel = "이전 화면으로 돌아가기", closeLabel = "닫기", busy = false, confirmation,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack: () => void;
  onClose: () => void;
  backLabel?: string;
  closeLabel?: string;
  busy?: boolean;
  confirmation?: FlowConfirmation | null;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const callbacks = useRef({ onBack, busy, confirmation });
  useEffect(() => { callbacks.current = { onBack, busy, confirmation }; });

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry: FlowEntry = { element, back: () => {
      if (callbacks.current.busy) return;
      if (callbacks.current.confirmation) callbacks.current.confirmation.onCancel();
      else callbacks.current.onBack();
    } };
    lockBackground();
    if (openFlows.length === 0 && !consumingHistory) pushFlowHistory();
    openFlows.push(entry);
    if (!listening) {
      window.addEventListener("popstate", onHistoryBack);
      listening = true;
    }
    element.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    function resize() {
      const height = viewport?.height ?? window.innerHeight;
      element!.dataset.compact = String(height < 600);
      setCompact(height < 600);
      element!.style.setProperty("--flow-height", `${height}px`);
      element!.style.setProperty("--flow-top", `${viewport?.offsetTop ?? 0}px`);
    }
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    function keyDown(event: KeyboardEvent) {
      if (!isTopFlow(element!)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        entry.back();
      } else if (event.key === "Tab") {
        const focusRoot = element!.querySelector<HTMLElement>('[role="alertdialog"]') ?? element!;
        const buttons = [...focusRoot.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], summary, [tabindex="0"]',
        )].filter((item) => !item.matches(":disabled") && !item.closest("[hidden], [inert]") &&
          (!item.closest("details:not([open])") || item.matches("summary")));
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first) { event.preventDefault(); focusRoot.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !focusRoot.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !focusRoot.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      const index = openFlows.indexOf(entry);
      if (index !== -1) openFlows.splice(index, 1);
      if (openFlows.length === 0) {
        releaseScroll?.();
        pendingLeave = null;
        if (!consumingHistory && history.state?.gndFullScreenFlow === historyToken && location.href === historyHref) {
          consumingHistory = true;
          history.back();
        }
        historyToken = null;
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-busy={busy} tabIndex={-1} data-fullscreen-flow
      className="group/flow fixed inset-x-0 z-50 flex h-[var(--flow-height,100dvh)] flex-col overflow-hidden bg-surface text-text outline-none"
      style={{ top: "var(--flow-top,0px)", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="mx-auto flex w-full max-w-3xl flex-none items-center gap-2 px-3 py-2">
        <button type="button" aria-label={backLabel} onClick={onBack} disabled={busy}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line text-lg disabled:opacity-40">←</button>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-extrabold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <button type="button" aria-label={closeLabel} onClick={onClose} disabled={busy}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-xl disabled:opacity-40">×</button>
      </header>
      <FlowCompactContext.Provider value={compact}>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 pb-3">{children}</div>
      </FlowCompactContext.Provider>
      {confirmation && <ConfirmPanel {...confirmation} />}
    </div>
  );
}

function ConfirmPanel({ message, confirmLabel, cancelLabel = "계속 고르기", onConfirm, onCancel }: FlowConfirmation) {
  const labelId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-5"
    onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby={labelId}
      className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-card">
      <p id={labelId} className="text-sm font-bold leading-relaxed">{message}</p>
      <button ref={cancelRef} type="button" onClick={onCancel} className="mt-4 h-11 w-full rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink">{cancelLabel}</button>
      <button type="button" onClick={onConfirm} className="mt-2 h-11 w-full rounded-card-sm border border-line text-sm font-bold">{confirmLabel}</button>
    </div>
  </div>;
}
