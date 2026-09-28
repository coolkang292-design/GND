"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { recordFunnelEvent } from "@/lib/analytics-events";
import {
  loadSessionFeedback,
  loadTrainingProfile,
  requestCoachFeedback,
  saveSessionFeedback,
  saveTrainingProfile,
  type CoachResponse,
} from "@/lib/coach";
import type { CoachFeedback, CoachItem } from "@/lib/domain/coach-feedback";
import { pickHighlights, type Highlight } from "@/lib/domain/coach-highlights";
import type { TrainingProfile } from "@/lib/domain/training-profile";
import type {
  EffortLevel,
  SessionFlag,
  Signal,
  WorkoutAnalysis,
} from "@/lib/domain/workout-analysis";
import { TrainingProfileSheet } from "./training-profile-sheet";

/**
 * 운동 완료 화면의 AI 코치 칸 (0112, 명령문 §26~§29·§43).
 *
 * ⚠️⚠️ 완료·XP·배지는 **이미 끝난 뒤**에 그려진다. 이 칸이 무엇에 실패해도
 *    위의 완료 카드·챌린지 기여·사진은 그대로다. 그래서 이 컴포넌트는 던지지 않고,
 *    테이블이 아직 없으면(0112 미적용) 칸 자체를 숨긴다.
 *
 * ⚠️ 체감을 **먼저** 받는다. 명령문 예시(§20·§45-D)가 이번 세션의 체감을 AI 입력에
 *    쓰기 때문이다. 이모지 한 탭이 곧 "분석 시작"이라 추가 비용은 탭 1회다.
 */

const EFFORT_CHOICES: readonly { value: EffortLevel; emoji: string; label: string }[] = [
  { value: "too_light", emoji: "😴", label: "너무 쉬움" },
  { value: "light", emoji: "🙂", label: "쉬움" },
  { value: "on_target", emoji: "👍", label: "적당" },
  { value: "heavy", emoji: "🥵", label: "힘듦" },
  { value: "too_heavy", emoji: "💀", label: "너무 힘듦" },
];

const FLAG_CHOICES: readonly { value: SessionFlag; label: string }[] = [
  { value: "pain", label: "통증 있었음" },
  { value: "low_condition", label: "컨디션 안 좋음" },
  { value: "short_time", label: "시간 부족" },
  { value: "equipment_unavailable", label: "기구 사용 불가" },
];

const SIGNAL_LABEL: Record<Signal, string> = {
  progress: "성장 신호",
  stable: "유지",
  fatigue_signal: "피로 신호",
  baseline: "첫 기준 기록",
};

/** 다른 요청이 생성 중(202)이면 이 간격으로 다시 묻는다 */
export const POLL_MS = 3_000;
export const MAX_POLLS = 20;

type Phase =
  | "checking"
  | "needs_profile"
  | "needs_effort"
  | "loading"
  | "completed"
  | "failed"
  | "dismissed"
  | "unavailable";

function toneClass(tone: Highlight["tone"]): string {
  if (tone === "up") return "text-accent";
  if (tone === "down") return "text-warn";
  return "text-muted";
}

function Performance({ metrics }: { metrics: WorkoutAnalysis }) {
  const highlights = pickHighlights(metrics.exercises);
  const pct = metrics.session.comparableVolumeDeltaPct;
  if (highlights.length === 0 && pct === null) return null;
  return (
    <div className="mt-3 rounded-card-sm bg-surface-2 p-3">
      <p className="text-[11px] font-bold text-faint">오늘의 성과</p>
      {pct !== null && (
        <p className="mt-1 text-sm font-extrabold">
          같은 종목 볼륨{" "}
          <span className={pct > 0 ? "text-accent" : pct < 0 ? "text-warn" : ""}>
            {pct > 0 ? "+" : ""}
            {pct}%
          </span>
          <span className="ml-1 text-[11px] font-bold text-muted">지난번 대비</span>
        </p>
      )}
      <ul className="mt-1.5 flex flex-col gap-1">
        {highlights.map((h) => (
          <li key={h.name} className="text-[12.5px] leading-snug">
            <span className="font-extrabold">{h.name}</span>{" "}
            <span className={`font-bold ${toneClass(h.tone)}`}>{h.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemList({ title, mark, items }: {
  title: string;
  mark: string;
  items: readonly CoachItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2.5">
      <p className="text-[11px] font-bold text-faint">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-[13px] leading-snug">
            <span aria-hidden className="flex-none font-extrabold text-accent">
              {mark}
            </span>
            <span>
              {item.exercise && <span className="font-extrabold">{item.exercise} · </span>}
              {item.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackView({ feedback }: { feedback: CoachFeedback }) {
  const primary = feedback.primary_result;
  return (
    <div className="mt-3">
      <span className="inline-block rounded-full bg-accent-weak px-2 py-0.5 text-[11px] font-extrabold text-accent">
        {SIGNAL_LABEL[primary.type]}
      </span>
      <p className="mt-1.5 text-[15px] font-extrabold leading-snug">{feedback.summary}</p>
      {primary.message !== feedback.summary && (
        <p className="mt-1 text-[13px] text-muted">{primary.message}</p>
      )}
      <ItemList title="잘한 점" mark="✓" items={feedback.wins} />
      <ItemList title="주의할 점" mark="!" items={feedback.cautions} />
      <ItemList title="다음 운동에서" mark="→" items={feedback.next_actions} />
      <p className="mt-3 text-[13px] leading-relaxed text-muted">{feedback.coach_message}</p>
      <p className="mt-2 text-[10.5px] text-faint">
        내 지난 기록을 같은 기준으로 비교하고, AI가 문장으로 정리한 참고용 분석이에요.
        계획은 자동으로 바뀌지 않아요.
      </p>
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="mt-3" role="status" aria-live="polite">
      <p className="text-[13px] font-bold text-muted">{label}</p>
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="mt-1.5 h-3 w-3/5 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

export function CoachCard({
  userId,
  sessionId,
  onEffortChosen,
  captionSlot,
  onHidden,
}: {
  userId: string;
  sessionId: string;
  /**
   * 강도를 골랐다(건너뛰면 null) — 페이지가 이걸로 크루 피드 한마디를 채운다
   * (2026-09-29 사용자 결정: "강도 한 번 = AI 분석 + 한마디").
   */
  onEffortChosen?: (effort: EffortLevel | null) => void;
  /** 강도 이후(분석 중·결과·실패)에 보이는 크루 피드 한마디 줄 */
  captionSlot?: ReactNode;
  /**
   * 이 칸이 사라졌다(0112 미적용·오류·"다음에"). 페이지는 한마디 칸을 따로 되살린다 —
   * 코치가 없다고 한마디를 남길 길까지 없어지면 안 된다.
   */
  onHidden?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [metrics, setMetrics] = useState<WorkoutAnalysis | null>(null);
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  const [failure, setFailure] = useState<{ code: string; retryable: boolean } | null>(null);
  const [flags, setFlags] = useState<SessionFlag[]>([]);
  const [hasSessionFeedback, setHasSessionFeedback] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const aliveRef = useRef(true);

  const run = useCallback(
    async (retry: boolean): Promise<void> => {
      setPhase("loading");
      let res: CoachResponse = await requestCoachFeedback(sessionId, retry);
      // 다른 요청(새로고침·중복 마운트)이 생성 중이면 기다렸다 다시 묻는다.
      // 다시 묻는 것은 재시도가 아니다 — 서버가 끝난 결과를 돌려줄 뿐이다.
      for (let polls = 0; res.status === "pending" && polls < MAX_POLLS; polls++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (!aliveRef.current) return;
        res = await requestCoachFeedback(sessionId, false);
      }
      if (!aliveRef.current) return;
      switch (res.status) {
        case "completed":
          setMetrics(res.metrics);
          setFeedback(res.feedback);
          setPhase("completed");
          return;
        case "pending":
          setFailure({ code: "timeout", retryable: true });
          setPhase("failed");
          return;
        case "failed":
          setMetrics(res.metrics);
          setFailure({ code: res.errorCode, retryable: res.retryable });
          setPhase("failed");
          return;
        case "profile_required":
          setPhase("needs_profile");
          return;
        case "error":
          setFailure({ code: res.errorCode, retryable: res.errorCode !== "unauthorized" });
          setPhase("failed");
      }
    },
    [sessionId],
  );

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [profile, sessionFeedback] = await Promise.all([
          loadTrainingProfile(userId),
          loadSessionFeedback(sessionId),
        ]);
        if (cancelled) return;
        setHasSessionFeedback(sessionFeedback !== null);
        if (sessionFeedback) setFlags(sessionFeedback.flags);
        if (!profile) setPhase("needs_profile");
        else if (!sessionFeedback) setPhase("needs_effort");
        else void run(false);
      } catch {
        // 0112 미적용·오프라인 — 칸을 숨긴다. 완료 화면의 나머지는 멀쩡하다
        if (!cancelled) setPhase("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [userId, sessionId, run]);

  async function submitEffort(effort: EffortLevel | null) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await saveSessionFeedback(userId, sessionId, { effort, flags });
      setHasSessionFeedback(true);
    } catch {
      // 체감 저장이 실패해도 분석은 받는다 — 체감 없이 분석할 뿐이다
    }
    setSubmitting(false);
    onEffortChosen?.(effort);
    void run(false);
  }

  async function saveProfile(profile: TrainingProfile) {
    await saveTrainingProfile(userId, profile);
    setSheetOpen(false);
    if (hasSessionFeedback) void run(false);
    else setPhase("needs_effort");
  }

  function openSheet() {
    setSheetOpen(true);
    void recordFunnelEvent("ai_coach_onboarding_started", userId);
  }

  function toggleFlag(flag: SessionFlag) {
    setFlags((current) =>
      current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag],
    );
  }

  const hidden = phase === "unavailable" || phase === "dismissed";
  useEffect(() => {
    if (hidden) onHidden?.();
  }, [hidden, onHidden]);

  if (hidden) return null;

  return (
    <section
      aria-labelledby="coach-card-title"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      {/*
        문구 (2026-09-29 사용자 요청 — "운동을 분석하는 거니까 목적에 맞는 퀄리티 있는
        마케팅 문구로"). 축은 **"기록은 숫자로, 체감은 당신이 — 둘을 겹쳐 읽는다"**다.

        ⚠️ 이름은 "GND 퍼포먼스 리포트"다 (2026-09-29 사용자 결정 — "AI 코치" 워딩 삭제).
        ⚠️ **"전문가가 분석했다"로 쓰지 마라.** 사람이 보지 않는다 — 코드 판정 + AI
           문장화다. 전문성은 방법(내 기록·같은 기준·숫자 근거)으로 말한다.
        ⚠️ 맨 아래 안내문의 **"AI가 문장으로 정리"는 지우지 마라.** 인공지능기본법
           (2026-01 시행)의 생성형 AI 결과물 고지다. 머리글에서 뺀 대신 여기 남긴다.
      */}
      <p id="coach-card-title" className="flex items-center gap-1.5 text-xs font-extrabold text-accent">
        <span aria-hidden>📊</span> GND 퍼포먼스 리포트
        <span className="font-bold text-faint">· 내 기록 기준</span>
      </p>

      {metrics && <Performance metrics={metrics} />}

      {phase === "checking" && <Skeleton label="지난 기록을 불러오는 중…" />}

      {phase === "needs_profile" && (
        <div className="mt-2">
          <p className="text-[15px] font-extrabold leading-snug">
            쌓인 기록, 이제 읽어 드릴게요
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            지난 기록과 오늘을 겹쳐 보고 성장·유지·피로 신호를 짚어 드려요.
            목표만 한 번 알려 주세요 · 30초
          </p>
          <button
            type="button"
            onClick={openSheet}
            className="mt-3 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
          >
            목표 알려 주고 분석 받기
          </button>
          <button
            type="button"
            onClick={() => setPhase("dismissed")}
            className="mt-1 h-9 w-full text-[11.5px] font-bold text-faint"
          >
            다음에
          </button>
        </div>
      )}

      {phase === "needs_effort" && (
        <div className="mt-2">
          <p className="text-[15px] font-extrabold leading-snug">
            기록은 숫자로 남았어요. 체감은요?
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            숫자와 체감을 겹쳐 봐야 진짜 컨디션이 보여요. 강도를 누르면 바로 분석하고,
            크루 피드에도 한마디로 남겨요.
          </p>
          <p className="mt-3 text-[11px] font-bold text-faint">해당되면 먼저 체크</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {FLAG_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={flags.includes(choice.value)}
                onClick={() => toggleFlag(choice.value)}
                className={`h-8 rounded-full border px-3 text-[12px] font-bold ${
                  flags.includes(choice.value)
                    ? "border-warn bg-surface-2 text-warn"
                    : "border-line bg-surface-2 text-muted"
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {EFFORT_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                disabled={submitting}
                onClick={() => void submitEffort(choice.value)}
                className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-card border border-line bg-surface-2 disabled:opacity-50"
              >
                <span aria-hidden className="text-2xl leading-none">{choice.emoji}</span>
                <span className="text-[10.5px] font-bold">{choice.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitEffort(null)}
            className="mt-1.5 h-9 w-full text-[11.5px] font-bold text-faint"
          >
            체감 없이 기록만으로 분석
          </button>
        </div>
      )}

      {phase === "loading" && <Skeleton label="지난 기록과 오늘을 겹쳐 보는 중…" />}

      {phase === "completed" && feedback && <FeedbackView feedback={feedback} />}

      {phase === "failed" && (
        <div className="mt-3">
          <p className="text-[13px] font-bold text-muted">
            {failure?.code === "not_configured"
              ? "리포트를 준비하고 있어요. 위의 기록은 그대로 저장됐어요."
              : "리포트를 불러오지 못했어요. 운동 기록은 그대로 저장됐어요."}
          </p>
          {failure?.retryable && failure.code !== "not_configured" && (
            <button
              type="button"
              onClick={() => void run(true)}
              className="mt-2 h-10 rounded-card border border-line bg-surface-2 px-4 text-[13px] font-extrabold"
            >
              다시 분석
            </button>
          )}
        </div>
      )}

      {/* 강도를 지난 뒤에만 — 강도가 곧 한마디를 정하므로 그 전엔 보여줄 게 없다 */}
      {captionSlot && (phase === "loading" || phase === "completed" || phase === "failed") && (
        <div className="mt-3 border-t border-line pt-3">{captionSlot}</div>
      )}

      {flags.includes("pain") && (
        <p className="mt-3 rounded-card-sm border border-warn/40 px-3 py-2 text-[12px] font-bold text-warn">
          통증이 있었다면 무리하지 마세요. 심하거나 계속되면 운동을 멈추고 전문가와 상담하세요.
        </p>
      )}

      {sheetOpen && (
        <TrainingProfileSheet onSave={saveProfile} onClose={() => setSheetOpen(false)} />
      )}
    </section>
  );
}
