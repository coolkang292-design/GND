"use client";

import { useMemo, useRef, useState } from "react";
import {
  exerciseFrequencyMap,
  frequentCatalogPicks,
  sortByFrequency,
} from "@/lib/domain/exercise-frequency";
import type { WorkoutRoutine } from "@/lib/routines";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";
import type { CalendarSession } from "@/lib/workout";
import { RoutineList } from "./routine-list";

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
  pastSessions: CalendarSession[];
  pastLoading: boolean;
  onClose: () => void;
  /** 선택한 운동 여러 개를 한 번에 추가 */
  onPickMany: (items: CatalogExercise[]) => void;
  /** 지난 완료 기록 하나를 현재 준비 목록 뒤에 중복 없이 추가 */
  onPickPast: (sessionId: string) => Promise<boolean>;
  /** 내 루틴 (0056). 넘기지 않으면 '내 루틴' 탭 자체가 안 나온다 */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  /** 루틴 하나를 불러온다 — true면 시트를 닫는다 */
  onPickRoutine?: (routine: WorkoutRoutine) => Promise<boolean>;
  onRenameRoutine?: (routineId: string, name: string) => Promise<boolean>;
  onDeleteRoutine?: (routine: WorkoutRoutine) => Promise<void>;
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
  pastSessions,
  pastLoading,
  onClose,
  onPickMany,
  onPickPast,
  onCreateCustom,
  routines,
  routinesLoading = false,
  onPickRoutine,
  onRenameRoutine,
  onDeleteRoutine,
}: PickerProps) {
  const routinesEnabled = Boolean(routines && onPickRoutine);
  const [tab, setTab] = useState<"catalog" | "past" | "routine">("catalog");
  const [routineBusyId, setRoutineBusyId] = useState<string | null>(null);
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
  const [pastBusyId, setPastBusyId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // 시트가 열려 있는 동안 고정 — 매 렌더마다 now가 바뀌면 90일 창이 미세하게 흔들린다.
  // 시트는 닫힐 때 언마운트되므로 다음에 열면 새로 계산된다.
  const openedAt = useMemo(() => new Date(), []);

  /** 이름 → 최근 90일 사용 횟수. 목록 정렬과 횟수 뱃지가 같은 수를 쓴다. */
  const frequency = useMemo(
    () => exerciseFrequencyMap(pastSessions, openedAt),
    [pastSessions, openedAt],
  );

  /**
   * ⭐ 자주 한 운동 — 최근 90일간 완료 세션 수 상위 (2026-08-02).
   * 검색·부위 필터 중에는 숨긴다(아래 렌더 조건). 필터링과 싸우지 않게.
   */
  const frequent = useMemo(
    () =>
      frequentCatalogPicks(
        pastSessions,
        openedAt,
        catalog,
        (item) => item.name,
      ),
    [pastSessions, openedAt, catalog],
  );

  const q = query.trim().toLowerCase();
  /**
   * 목록도 **사용 횟수 내림차순**이다 (사용자 요청 2026-08-02).
   *
   * 전에는 `getExerciseCatalog()`가 준 `created_at` 순(시드 입력 순서)
   * 그대로였다. 부위를 골라도 그 안에서 많이 한 종목이 위로 오지 않아,
   * 늘 하는 운동을 매번 목록에서 눈으로 찾아야 했다.
   *
   * 동수·0회는 원래 순서를 유지한다 — 카탈로그가 부위별로 묶인 시드
   * 순서라 이름순으로 흩뜨리면 안 쓰던 종목 찾기가 오히려 어려워진다.
   */
  const list = sortByFrequency(
    catalog.filter(
      (e) =>
        (part === "전체" ||
          (part === "맨몸"
            ? e.exercise_type === "bodyweight"
            : e.body_part === part)) &&
        (!q || e.name.toLowerCase().includes(q)),
    ),
    frequency,
    (item) => item.name,
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

  async function pickPast(sessionId: string) {
    setPastBusyId(sessionId);
    try {
      const added = await onPickPast(sessionId);
      if (added) onClose();
    } finally {
      setPastBusyId(null);
    }
  }

  async function pickRoutine(routine: WorkoutRoutine) {
    if (!onPickRoutine) return;
    setRoutineBusyId(routine.id);
    try {
      if (await onPickRoutine(routine)) onClose();
    } finally {
      setRoutineBusyId(null);
    }
  }

  async function removeRoutine(routine: WorkoutRoutine) {
    if (!onDeleteRoutine) return;
    if (!window.confirm(`'${routine.name}' 루틴을 삭제할까요?`)) return;
    setRoutineBusyId(routine.id);
    try {
      await onDeleteRoutine(routine);
    } finally {
      setRoutineBusyId(null);
    }
  }

  async function renameRoutine(routineId: string, name: string) {
    if (!onRenameRoutine) return false;
    setRoutineBusyId(routineId);
    try {
      return await onRenameRoutine(routineId, name);
    } finally {
      setRoutineBusyId(null);
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

        <div className="mb-3 flex flex-none gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
          {(
            [
              ["catalog", "운동 찾기"],
              ["past", "지난 기록"],
              ...(routinesEnabled ? ([["routine", "내 루틴"]] as const) : []),
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-9 flex-1 rounded-[7px] text-sm font-bold ${
                tab === value
                  ? "bg-surface text-accent shadow-card"
                  : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "catalog" ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 운동 검색 (예: 스쿼트, 벤치)"
              className="h-16 w-full flex-none rounded-card border-2 border-line bg-bg px-4 text-base outline-none focus:border-accent"
            />

            {/* ⭐ 자주 한 운동 — 검색·부위 필터 중에는 숨긴다 (설계 2026-08-02).
                세로 목록이 아니라 가로 칩 한 줄이다: 시트가 max-h-[82dvh]라
                5행짜리 섹션은 카탈로그 목록을 화면 밖으로 밀어낸다. */}
            {frequent.length > 0 && !q && part === "전체" && (
              <div className="mt-3 flex-none">
                <p className="mb-1.5 text-[11px] font-bold text-muted">
                  ⭐ 자주 한 운동
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {frequent.map(({ item, count }) => {
                    const isSelected = selected.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleSelect(item)}
                        aria-pressed={isSelected}
                        className={`flex flex-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                          isSelected
                            ? "border-accent bg-accent text-accent-ink"
                            : "border-accent/40 bg-accent-weak text-accent"
                        }`}
                      >
                        <span>{item.name}</span>
                        <span
                          className={`font-mono text-[10px] ${
                            isSelected ? "text-accent-ink/80" : "text-accent/70"
                          }`}
                        >
                          {isSelected ? "✓" : `${count}회`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                      {/* 횟수를 같이 보여야 왜 이 순서인지 알 수 있다 */}
                      {(frequency.get(e.name) ?? 0) > 0 && (
                        <span className="ml-1 font-bold text-accent">
                          · {frequency.get(e.name)}회
                        </span>
                      )}
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
          </>
        ) : tab === "routine" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RoutineList
              routines={routines ?? []}
              loading={routinesLoading}
              busyId={routineBusyId}
              onPick={(routine) => void pickRoutine(routine)}
              onRename={renameRoutine}
              onDelete={(routine) => void removeRoutine(routine)}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pastLoading ? (
              <p className="py-8 text-center text-sm text-muted">
                지난 기록을 불러오는 중…
              </p>
            ) : pastSessions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-bold">아직 완료한 운동이 없어요</p>
                <p className="mt-1 text-xs text-muted">
                  운동을 한 번 완료하면 여기서 다시 불러올 수 있어요.
                </p>
              </div>
            ) : (
              pastSessions.map((session) => {
                const date = new Intl.DateTimeFormat("ko-KR", {
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                }).format(session.completedAt);
                const duration = Math.round(session.durationSeconds / 60);
                return (
                  <button
                    key={session.id}
                    type="button"
                    disabled={pastBusyId !== null}
                    onClick={() => void pickPast(session.id)}
                    className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold">
                        {date}
                        {duration > 0 && (
                          <span className="ml-2 text-xs font-bold text-muted">
                            {duration}분
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {session.exerciseNames.length > 0
                          ? session.exerciseNames.join(" · ")
                          : "운동 완료"}
                      </span>
                    </span>
                    <span className="flex-none text-xs font-extrabold text-accent">
                      {pastBusyId === session.id ? "불러오는 중…" : "불러오기"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}
