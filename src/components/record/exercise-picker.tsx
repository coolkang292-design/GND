"use client";

import { useRef, useState } from "react";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";

const PARTS: readonly (BodyPart | "전체")[] = [
  "전체",
  "가슴",
  "등",
  "하체",
  "어깨",
  "팔",
  "코어",
  "유산소",
];

// 부위 칩 + 모달리티 칩(맨몸 = exercise_type 필터, body_part 아님)
const FILTERS = [...PARTS, "맨몸"] as const;

export const TYPE_LABEL: Record<ExerciseType, string> = {
  weight: "웨이트",
  bodyweight: "맨몸",
  cardio: "유산소",
};

type PickerProps = {
  catalog: CatalogExercise[];
  onClose: () => void;
  /** 선택한 운동 여러 개를 한 번에 추가 */
  onPickMany: (items: CatalogExercise[]) => void;
  /** 커스텀 운동 생성 — 생성된 항목을 반환하면 선택 목록에 담긴다 */
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) => Promise<CatalogExercise | null>;
};

/** 운동 추가 바텀시트 — 검색 + 부위 필터 + 다중 선택 + 직접 만들기 (§10) */
export function ExercisePicker({ open, ...props }: PickerProps & { open: boolean }) {
  // 열 때마다 언마운트→마운트로 검색·필터 상태를 초기화 (effect 내 setState 금지)
  if (!open) return null;
  return <PickerSheet {...props} />;
}

function PickerSheet({
  catalog,
  onClose,
  onPickMany,
  onCreateCustom,
}: PickerProps) {
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<(typeof FILTERS)[number]>("전체");
  const [selected, setSelected] = useState<Map<string, CatalogExercise>>(
    () => new Map(),
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [customPart, setCustomPart] = useState<BodyPart>("가슴");
  const [customType, setCustomType] = useState<ExerciseType>("weight");
  const [customMeasure, setCustomMeasure] = useState<"reps" | "time">("reps");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const list = catalog.filter(
    (e) =>
      (part === "전체" ||
        (part === "맨몸"
          ? e.exercise_type === "bodyweight"
          : e.body_part === part)) &&
      (!q || e.name.toLowerCase().includes(q)),
  );

  function toggleSelect(item: CatalogExercise) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  async function createCustom() {
    const name = (nameRef.current?.value ?? "").trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await onCreateCustom({
        name,
        bodyPart: customPart,
        exerciseType: customType,
        measure: customType === "bodyweight" ? customMeasure : null,
      });
      // 만들면 곧바로 선택 목록에 담고 폼을 닫는다 — 기존 선택 유지
      if (created) {
        setSelected((prev) => new Map(prev).set(created.id, created));
        setCustomOpen(false);
        if (nameRef.current) nameRef.current.value = "";
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 className="mb-2.5 text-base font-extrabold">운동 추가</h3>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="운동 검색 (예: 스쿼트, 벤치, 러닝)"
          className="h-11 w-full rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
        />

        <div className="my-3 flex flex-none gap-1.5 overflow-x-auto">
          {FILTERS.map((p) => (
            <button
              key={p}
              onClick={() => setPart(p)}
              className={`flex-none rounded-full border px-3 py-1.5 text-xs font-bold ${
                p === part
                  ? "border-accent bg-accent-weak text-accent"
                  : "border-line bg-surface-2 text-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length > 0 ? (
            list.map((e) => {
              const isSelected = selected.has(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => toggleSelect(e)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between border-b border-line py-2.5 text-left ${
                    isSelected ? "bg-accent-weak/40" : ""
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold">
                      {e.name}
                      {e.is_custom && (
                        <span className="ml-1.5 rounded bg-accent-weak px-1.5 py-0.5 text-[10px] font-bold text-accent">
                          직접
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {e.body_part} · {TYPE_LABEL[e.exercise_type]}
                    </span>
                  </span>
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-sm font-bold ${
                      isSelected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line text-accent"
                    }`}
                  >
                    {isSelected ? "✓" : "＋"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="py-5 text-center text-sm text-muted">
              {query.trim()
                ? `'${query.trim()}' 검색 결과가 없어요. 아래에서 직접 만들 수 있어요.`
                : "운동이 없어요."}
            </p>
          )}
        </div>

        {customOpen ? (
          <div className="mt-3 flex-none rounded-card-sm border border-line bg-surface-2 p-3">
            <label className="text-xs font-bold text-muted">운동명</label>
            <input
              ref={nameRef}
              defaultValue={query.trim()}
              placeholder="예: 케이블 크로스오버"
              maxLength={40}
              className="mt-1 mb-2 h-10 w-full rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold text-muted">부위</label>
                <select
                  value={customPart}
                  onChange={(e) => setCustomPart(e.target.value as BodyPart)}
                  className="mt-1 h-10 w-full rounded-card-sm border border-line bg-bg px-2 text-sm"
                >
                  {PARTS.slice(1).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-muted">유형</label>
                <select
                  value={customType}
                  onChange={(e) =>
                    setCustomType(e.target.value as ExerciseType)
                  }
                  className="mt-1 h-10 w-full rounded-card-sm border border-line bg-bg px-2 text-sm"
                >
                  <option value="weight">웨이트 (kg × 회)</option>
                  <option value="bodyweight">맨몸 (회)</option>
                  <option value="cardio">유산소 (거리·시간)</option>
                </select>
              </div>
              {customType === "bodyweight" && (
                <div className="flex-1">
                  <label className="text-xs font-bold text-muted">측정</label>
                  <select
                    value={customMeasure}
                    onChange={(e) =>
                      setCustomMeasure(e.target.value as "reps" | "time")
                    }
                    className="mt-1 h-10 w-full rounded-card-sm border border-line bg-bg px-2 text-sm"
                  >
                    <option value="reps">횟수 (회)</option>
                    <option value="time">시간 (분)</option>
                  </select>
                </div>
              )}
            </div>
            <button
              onClick={createCustom}
              disabled={saving}
              className="mt-3 h-11 w-full rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
            >
              {saving ? "만드는 중…" : "만들고 추가"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCustomOpen(true)}
            className="mt-3 h-11 w-full flex-none rounded-card-sm border border-line text-sm font-bold text-accent"
          >
            ＋ {query.trim() ? `'${query.trim()}' ` : ""}직접 만들기
          </button>
        )}

        <button
          onClick={() => onPickMany([...selected.values()])}
          disabled={selected.size === 0}
          className="mt-2 h-12 w-full flex-none rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          {selected.size > 0
            ? `선택한 ${selected.size}개 운동 추가`
            : "운동을 선택하세요"}
        </button>
      </div>
    </>
  );
}
