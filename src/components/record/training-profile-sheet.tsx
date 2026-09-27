"use client";

import { useEffect, useState } from "react";
import {
  completeProfile,
  emptyProfileDraft,
  EXPERIENCE_LEVELS,
  LIMITATION_PART_CHOICES,
  MAX_PRIORITY_PARTS,
  parseBodyWeight,
  PRIMARY_GOALS,
  PRIORITY_PART_CHOICES,
  SESSION_MINUTES_CHOICES,
  SESSIONS_PER_WEEK_CHOICES,
  togglePart,
  TRAINING_LOCATIONS,
  type TrainingProfile,
  type TrainingProfileDraft,
} from "@/lib/domain/training-profile";

/**
 * AI 코치 목표 설정 (0112, 명령문 §4).
 *
 * ⚠️ 방금 운동을 끝낸 사람이 보는 시트다. 그래서 **전부 칩**이다 — 필수 여섯 개가
 *    탭 여섯 번으로 끝난다. 자유 입력은 "더 알려주기(선택)" 안의 체중 두 칸뿐이다.
 *
 * ⚠️ 우선 부위는 0개여도 저장된다. "딱히 없음"도 답이다 — 강요하면 아무거나 누른다.
 */
function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-10 rounded-full border px-3.5 text-[13px] font-bold ${
        selected
          ? "border-accent bg-accent-weak text-accent"
          : "border-line bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, hint, children }: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-[13px] font-extrabold">
        {title}
        {hint && <span className="ml-1.5 text-[11px] font-bold text-faint">{hint}</span>}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function TrainingProfileSheet({
  initial,
  onSave,
  onClose,
}: {
  initial?: TrainingProfile | null;
  /** 저장 — 실패하면 던진다. 시트가 오류 문구를 띄운다 */
  onSave: (profile: TrainingProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TrainingProfileDraft>(() =>
    initial ? { ...initial } : emptyProfileDraft(),
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [weightText, setWeightText] = useState(
    initial?.currentWeightKg?.toString() ?? "",
  );
  const [targetText, setTargetText] = useState(
    initial?.targetWeightKg?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const set = <K extends keyof TrainingProfileDraft>(
    key: K,
    value: TrainingProfileDraft[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const profile = completeProfile({
    ...draft,
    currentWeightKg: parseBodyWeight(weightText),
    targetWeightKg: parseBodyWeight(targetText),
  });

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(profile);
    } catch {
      setError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-profile-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-[22px] border-t border-line bg-surface shadow-card"
      >
        <div className="flex-none px-4 pt-4">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          <h3 id="training-profile-title" className="text-center text-base font-extrabold">
            AI 코치에게 목표를 알려주세요
          </h3>
          <p className="mt-1 text-center text-[11.5px] text-muted">
            같은 기록도 목표에 따라 다르게 읽어요. 한 번만 정하면 돼요.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <Group title="가장 중요한 목표">
            {PRIMARY_GOALS.map((g) => (
              <Chip
                key={g.value}
                selected={draft.primaryGoal === g.value}
                onClick={() => set("primaryGoal", g.value)}
              >
                {g.label}
              </Chip>
            ))}
          </Group>

          <Group title="운동 경험">
            {EXPERIENCE_LEVELS.map((l) => (
              <Chip
                key={l.value}
                selected={draft.experienceLevel === l.value}
                onClick={() => set("experienceLevel", l.value)}
              >
                {l.label}
              </Chip>
            ))}
          </Group>

          <Group title="일주일에 몇 번">
            {SESSIONS_PER_WEEK_CHOICES.map((n) => (
              <Chip
                key={n}
                selected={draft.sessionsPerWeek === n}
                onClick={() => set("sessionsPerWeek", n)}
              >
                주 {n}회
              </Chip>
            ))}
          </Group>

          <Group title="한 번에 얼마나">
            {SESSION_MINUTES_CHOICES.map((m) => (
              <Chip
                key={m}
                selected={draft.sessionMinutes === m}
                onClick={() => set("sessionMinutes", m)}
              >
                {m}분
              </Chip>
            ))}
          </Group>

          <Group title="주로 어디서">
            {TRAINING_LOCATIONS.map((l) => (
              <Chip
                key={l.value}
                selected={draft.trainingLocation === l.value}
                onClick={() => set("trainingLocation", l.value)}
              >
                {l.label}
              </Chip>
            ))}
          </Group>

          <Group title="키우고 싶은 부위" hint={`최대 ${MAX_PRIORITY_PARTS}개 · 없어도 돼요`}>
            {PRIORITY_PART_CHOICES.map((part) => (
              <Chip
                key={part}
                selected={draft.priorityBodyParts.includes(part)}
                onClick={() =>
                  set(
                    "priorityBodyParts",
                    togglePart(draft.priorityBodyParts, part, MAX_PRIORITY_PARTS),
                  )
                }
              >
                {part}
              </Chip>
            ))}
          </Group>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="mt-5 text-[12.5px] font-bold text-muted"
          >
            {moreOpen ? "▾" : "▸"} 더 알려주기 (선택)
          </button>

          {moreOpen && (
            <div>
              <Group title="불편하거나 아픈 부위" hint="이 부위는 증량을 권하지 않아요">
                {LIMITATION_PART_CHOICES.map((part) => (
                  <Chip
                    key={part}
                    selected={draft.limitationBodyParts.includes(part)}
                    onClick={() =>
                      set(
                        "limitationBodyParts",
                        togglePart(draft.limitationBodyParts, part),
                      )
                    }
                  >
                    {part}
                  </Chip>
                ))}
              </Group>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-[12.5px] font-extrabold">
                  지금 체중 (kg)
                  <input
                    inputMode="decimal"
                    value={weightText}
                    onChange={(e) => setWeightText(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-card border border-line bg-surface-2 px-3 text-sm font-bold"
                  />
                </label>
                <label className="text-[12.5px] font-extrabold">
                  목표 체중 (kg)
                  <input
                    inputMode="decimal"
                    value={targetText}
                    onChange={(e) => setTargetText(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-card border border-line bg-surface-2 px-3 text-sm font-bold"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex-none border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && <p className="mb-2 text-center text-[12px] font-bold text-warn">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={!profile || saving}
            className="h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
          >
            {saving ? "저장 중…" : profile ? "저장하고 분석 받기" : "위 다섯 가지를 골라 주세요"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 h-10 w-full text-[11.5px] font-bold text-faint"
          >
            다음에 할게요
          </button>
        </div>
      </div>
    </>
  );
}
