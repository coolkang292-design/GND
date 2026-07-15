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

export const TYPE_LABEL: Record<ExerciseType, string> = {
  weight: "웨이트",
  bodyweight: "맨몸",
  cardio: "유산소",
};

type PickerProps = {
  catalog: CatalogExercise[];
  onClose: () => void;
  onPick: (item: CatalogExercise) => void;
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
  }) => Promise<void>;
};

/** 운동 추가 바텀시트 — Burnfit식 검색 + 부위 필터 + 직접 만들기 (§10) */
export function ExercisePicker({ open, ...props }: PickerProps & { open: boolean }) {
  // 열 때마다 언마운트→마운트로 검색·필터 상태를 초기화 (effect 내 setState 금지)
  if (!open) return null;
  return <PickerSheet {...props} />;
}

function PickerSheet({ catalog, onClose, onPick, onCreateCustom }: PickerProps) {
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<(typeof PARTS)[number]>("전체");
  const [customOpen, setCustomOpen] = useState(false);
  const [customPart, setCustomPart] = useState<BodyPart>("가슴");
  const [customType, setCustomType] = useState<ExerciseType>("weight");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const list = catalog.filter(
    (e) =>
      (part === "전체" || e.body_part === part) &&
      (!q || e.name.toLowerCase().includes(q)),
  );

  async function createCustom() {
    const name = (nameRef.current?.value ?? "").trim();
    if (!name) return;
    setSaving(true);
    try {
      await onCreateCustom({
        name,
        bodyPart: customPart,
        exerciseType: customType,
      });
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
          {PARTS.map((p) => (
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
            list.map((e) => (
              <button
                key={e.id}
                onClick={() => onPick(e)}
                className="flex w-full items-center justify-between border-b border-line py-2.5 text-left"
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
                <span className="text-lg font-bold text-accent">＋</span>
              </button>
            ))
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
      </div>
    </>
  );
}
