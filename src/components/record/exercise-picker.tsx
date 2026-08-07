"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  exerciseFrequencyMap,
  frequentCatalogPicks,
  sortByFrequency,
} from "@/lib/domain/exercise-frequency";
import {
  categoriesLabel,
  countsTowardChallenge,
  type GoalCategory,
} from "@/lib/challenge";
import { planToSets } from "@/lib/domain/recommended-sets";
import type {
  RecommendPart,
  SituationKey,
} from "@/lib/domain/recommended-exercises";
import type { WorkoutRoutine } from "@/lib/routines";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";
import type { CalendarSession, LocalSet } from "@/lib/workout";
import { RoutineList } from "./routine-list";
import { RecommendedPicker } from "./recommended-picker";
import {
  ExerciseSetupSheet,
  initialSetupEntries,
  type SetupEntry,
} from "./exercise-setup-sheet";

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

/**
 * 시트 안의 화면 (2026-08-06).
 *
 * `hub`가 기본이다 — 열자마자 카탈로그 목록을 들이밀지 않는다. 그 목록은
 * **찾는 종목의 이름을 이미 아는 사람**의 도구이고, 처음 온 사람은 그 이름을
 * 모른다.
 */
type PickerMode =
  | "hub"
  | "situation"
  | "part"
  | "setup"
  | "search"
  | "past"
  | "routine";

/** 고른 종목 + 정해진 세트 — 기록 draft로도, 예정표로도 갈 수 있는 모양 */
export type ConfiguredPick = { item: CatalogExercise; sets: LocalSet[] };

type PickerProps = {
  catalog: CatalogExercise[];
  pastSessions: CalendarSession[];
  pastLoading: boolean;
  onClose: () => void;
  /** 선택한 운동 여러 개를 한 번에 추가 (검색 경로 — 기본 세트) */
  onPickMany: (items: CatalogExercise[]) => void;
  /** 추천 경로 — 세트·목표·무게까지 정해서 추가 (2026-08-06) */
  onPickConfigured?: (picks: ConfiguredPick[]) => void;
  /** 지난 완료 기록 하나를 현재 준비 목록 뒤에 중복 없이 추가 */
  onPickPast: (sessionId: string) => Promise<boolean>;
  /** 열자마자 보여줄 화면. 빈 기록 화면의 '최근 운동 불러오기'가 `past`로 연다 */
  initialMode?: PickerMode;
  /**
   * 🔥 타바타 진입 (2026-08-06) — 넘기지 않으면 카드 자체가 안 나온다.
   *
   * 타바타도 "오늘 운동을 어떻게 할까"의 한 가지라 여기 있는 게 맞다. 다만
   * 다른 넷과 달리 **담는 게 아니라 목록을 갈아엎고 바로 시작한다** — 그래서
   * 문구로 그렇게 말하고, 목록이 있으면 `beginTabata`가 확인을 한 번 더 받는다.
   *
   * 달력의 예정표 피커는 안 넘긴다: 빈 날짜에 타바타를 *새로* 짜는 경로는
   * 2026-08-05에 범위 밖으로 정했다.
   */
  onOpenTabata?: () => void;
  /** 내 루틴 (0056). **저장된 루틴이 있을 때만** 진입 카드가 나온다 */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  /** 루틴 하나를 불러온다 — true면 시트를 닫는다 */
  onPickRoutine?: (routine: WorkoutRoutine) => Promise<boolean>;
  onRenameRoutine?: (routineId: string, name: string) => Promise<boolean>;
  onDeleteRoutine?: (routine: WorkoutRoutine) => Promise<void>;
  /**
   * 진행 중인 챌린지에서 내 목표가 덮는 분류 (2026-08-04).
   *
   * null이면 챌린지가 없거나 아직 못 불러온 것 — 그때는 아무 경고도 하지 않는다.
   */
  challengeCategories?: ReadonlySet<GoalCategory> | null;
  /** 커스텀 운동 생성 — 생성된 항목을 반환하면 선택 목록에 담긴다 */
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) => Promise<CatalogExercise | null>;
};

/** 운동 추가 바텀시트 — 진입 허브 + 추천/검색/지난 기록/내 루틴 (§10) */
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
  onPickConfigured,
  onPickPast,
  onCreateCustom,
  initialMode = "hub",
  onOpenTabata,
  challengeCategories = null,
  routines,
  routinesLoading = false,
  onPickRoutine,
  onRenameRoutine,
  onDeleteRoutine,
}: PickerProps) {
  /**
   * ⚠️ **저장된 루틴이 하나라도 있어야 진입 카드를 낸다** (사용자 지시 2026-08-06).
   *
   * 2026-08-02에는 `[]`("루틴 0개")와 `undefined`("0056 미적용이라 사용 불가")를
   * 구별하려고 `[]`에도 탭을 띄웠다. 그 구별의 목적 — 기능이 멀쩡한 척하지
   * 않는 것 — 은 기록 페이지의 루틴 저장 버튼(`routines !== null`)이 그대로
   * 지킨다. **고를 것이 없는 진입 카드**는 처음 온 사람에게 막다른 길일 뿐이다.
   */
  const routinesEnabled = Boolean(routines?.length && onPickRoutine);
  const [mode, setMode] = useState<PickerMode>(initialMode);
  const [routineBusyId, setRoutineBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<(typeof FILTERS)[number]>("전체");
  const [selected, setSelected] = useState<Map<string, CatalogExercise>>(
    () => new Map(),
  );
  // 추천 경로는 검색 경로와 선택 목록을 공유하지 않는다 — 확정 버튼이 서로
  // 다른 일(기본 세트 / 정한 세트)을 하므로 섞이면 어느 쪽으로 갈지 모호해진다
  const [recommendPart, setRecommendPart] = useState<RecommendPart>("가슴");
  const [situation, setSituation] = useState<SituationKey>("beginner");
  /** 설정 화면의 ←가 상황별/부위별 중 **왔던 쪽**으로 돌아가게 한다 */
  const [lastRecommendMode, setLastRecommendMode] = useState<
    "situation" | "part"
  >("situation");
  const [recommendSelected, setRecommendSelected] = useState<
    Map<string, CatalogExercise>
  >(() => new Map());
  const [setupEntries, setSetupEntries] = useState<SetupEntry[]>([]);
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

  /**
   * 웨이트/맨몸이 섞여 나오는 검색이면 안내를 띄운다 (신고 0783ca35, 2026-08-03).
   *
   * '스쿼트'(웨이트)와 '맨몸 스쿼트'(맨몸)는 이름이 겹쳐서, 맨몸 스쿼트를 하고도
   * 웨이트판을 골라 챌린지 맨몸 실적이 100회 내내 0이었다. 늘 띄우면 아무도 안
   * 읽으므로 **실제로 두 유형이 같이 잡힐 때만** 띄운다.
   */
  const mixedTypes =
    q.length > 0 &&
    list.some((e) => e.exercise_type === "weight") &&
    list.some((e) => e.exercise_type === "bodyweight");

  /** 이 종목을 해도 챌린지 실적이 안 오르는가 (목표를 모르면 항상 false) */
  const missesChallenge = (type: ExerciseType) =>
    !countsTowardChallenge(type, challengeCategories);

  /** 지금 담은 것 중 챌린지에 안 잡히는 게 있으면 배너로 알린다 */
  const pickedMisses = [...selected.values()].some((e) =>
    missesChallenge(e.exercise_type),
  );

  function toggleSelect(item: CatalogExercise) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  function toggleRecommend(item: CatalogExercise) {
    setRecommendSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  /** 추천에서 고른 것들을 설정 화면으로 넘긴다 (기본 3세트·10회·운동 중 입력) */
  function goToSetup() {
    const picked = [...recommendSelected.values()];
    if (picked.length === 0) return;
    if (mode === "situation" || mode === "part") setLastRecommendMode(mode);
    setSetupEntries(initialSetupEntries(picked));
    setMode("setup");
  }

  function confirmSetup() {
    if (!onPickConfigured || setupEntries.length === 0) return;
    onPickConfigured(
      setupEntries.map(({ item, plan }) => ({
        item,
        sets: planToSets(item.exercise_type, item.measure, plan),
      })),
    );
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

  /** 허브로 돌아가는 머리글 — 허브에서 온 화면에만 붙인다 */
  const backHeader = (title: string) => (
    <div className="mb-2 flex flex-none items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("hub")}
        aria-label="진입 화면으로 돌아가기"
        /* ⚠️ 테두리 있는 원으로 그린다 (2026-08-07 사용자 지적 "뒤로가기도 잘보이게").
           옛 모양은 배경도 테두리도 없는 `text-muted` 글리프 하나여서, 어두운
           배경에서 **눌 수 있는 것으로 보이지 않았다.** 44px 손가락 표적도
           확보한다(옛 32px). */
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-surface-2 text-lg text-text"
      >
        ←
      </button>
      <p className="text-sm font-extrabold">{title}</p>
    </div>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        {mode === "hub" ? (
          <>
            <h3 className="text-base font-extrabold">운동 추가</h3>
            <p className="mt-0.5 mb-3 text-[12.5px] text-muted">
              처음이라면 추천 운동으로 시작해보세요
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <HubCard
                primary
                iconSrc="/ui-icons/hub-situation.webp"
                title="상황별 추천"
                sub="처음 운동해요, 집에서, 30분만 등 상황에 맞게"
                onClick={() => setMode("situation")}
              />
              <HubCard
                iconSrc="/ui-icons/hub-part.webp"
                title="부위별 추천"
                sub="가슴, 등, 하체 등 운동할 부위로 고르기"
                onClick={() => setMode("part")}
              />
              <HubCard
                iconSrc="/ui-icons/hub-search.webp"
                title="운동 이름 검색"
                sub="알고 있는 운동을 직접 찾아요"
                onClick={() => setMode("search")}
              />
              <HubCard
                iconSrc="/ui-icons/hub-past.webp"
                title="지난 운동 불러오기"
                sub="예전에 했던 운동을 그대로 추가해요"
                onClick={() => setMode("past")}
              />
              {routinesEnabled && (
                <HubCard
                  iconSrc="/ui-icons/hub-routine.webp"
                  title="내 루틴"
                  sub={`저장해 둔 루틴 ${routines?.length ?? 0}개에서 불러와요`}
                  onClick={() => setMode("routine")}
                />
              )}
              {/* 다른 넷과 달리 담는 게 아니라 바로 시작한다 — 문구로 말한다 */}
              {onOpenTabata && (
                <HubCard
                  iconSrc="/ui-icons/hub-tabata.webp"
                  title="타바타로 바로 시작"
                  sub="음원 따라 4분, 기록은 자동 — 목록은 새로 시작해요"
                  onClick={onOpenTabata}
                />
              )}
            </div>
          </>
        ) : mode === "situation" || mode === "part" ? (
          <RecommendedPicker
            mode={mode}
            catalog={catalog}
            challengeCategories={challengeCategories}
            part={recommendPart}
            onPart={setRecommendPart}
            situation={situation}
            onSituation={setSituation}
            selected={new Set(recommendSelected.keys())}
            onToggle={toggleRecommend}
            onBack={() => setMode("hub")}
            onSearch={() => setMode("search")}
            onNext={goToSetup}
          />
        ) : mode === "setup" ? (
          <ExerciseSetupSheet
            entries={setupEntries}
            onChange={(index, plan) =>
              setSetupEntries((prev) =>
                prev.map((entry, i) => (i === index ? { ...entry, plan } : entry)),
              )
            }
            onBack={() => setMode(lastRecommendMode)}
            onConfirm={confirmSetup}
          />
        ) : mode === "search" ? (
          <>
            {backHeader("운동 이름 검색")}
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
                        {/* 유형을 칩에도 붙인다 — 목록 행에만 있어서, 칩으로
                            담으면 웨이트/맨몸을 볼 기회가 없었다 (신고 0783ca35) */}
                        <span
                          className={`rounded px-1 text-[10px] font-bold ${
                            isSelected
                              ? "bg-accent-ink/15 text-accent-ink"
                              : "bg-accent/15 text-accent"
                          }`}
                        >
                          {TYPE_LABEL[item.exercise_type]}
                        </span>
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

            {/* 챌린지 목표를 아는 경우가 더 구체적이므로 먼저 보여준다.
                둘을 같이 띄우면 배너가 두 줄이 되어 목록을 밀어낸다. */}
            {pickedMisses && challengeCategories !== null ? (
              <p className="mb-2 flex-none rounded-card-sm border border-warn/40 bg-surface-2 px-3 py-2 text-[11px] font-bold text-warn">
                고른 운동 중에 <b>챌린지 성과에는 안 잡혀요</b>가 있어요. 지금
                챌린지 목표는 <b>{categoriesLabel(challengeCategories)}</b>{" "}
                뿐이에요 — 운동 기록·XP는 그대로 쌓이지만 챌린지 달성률은 안
                올라가요.
              </p>
            ) : mixedTypes ? (
              <p className="mb-2 flex-none rounded-card-sm border border-accent/40 bg-accent-weak px-3 py-2 text-[11px] font-bold text-accent">
                맨몸으로 한 운동은 <b>맨몸</b> 유형을 골라야 챌린지 맨몸 실적에
                들어가요. 기구·무게를 썼다면 <b>웨이트</b>예요.
              </p>
            ) : null}

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
                      {e.body_part} ·{" "}
                      {/* 유형은 회색 본문에 묻히면 안 된다 — 웨이트/맨몸을
                          잘못 고르면 챌린지 실적이 통째로 다른 칸에 쌓인다 */}
                      <span
                        className={`rounded px-1 py-0.5 text-[10px] font-bold ${
                          e.exercise_type === "bodyweight"
                            ? "bg-good/15 text-good"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {TYPE_LABEL[e.exercise_type]}
                      </span>
                      {/* 고르는 자리에서 말해 준다 — 신고 0783ca35는 100회를
                          기록하고 나서야 안 잡힌다는 걸 알았다 */}
                      {missesChallenge(e.exercise_type) && (
                        <span className="ml-1 rounded bg-warn/15 px-1 py-0.5 text-[10px] font-bold text-warn">
                          챌린지 미반영
                        </span>
                      )}
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

            {/*
              '직접 만들기'는 **검색 결과가 없을 때만** 낸다 (사용자 지시 2026-08-06).
              늘 띄우면 초보자에게는 고를 것이 하나 더 늘어난 것으로 보인다 —
              카탈로그에 이미 있는 종목을 직접 만들게 유도할 이유가 없다.
            */}
            {list.length === 0 &&
              (customOpen ? (
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
              ))}

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
        ) : mode === "routine" ? (
          <>
            {backHeader("내 루틴")}
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
          </>
        ) : (
          <>
            {backHeader("지난 운동 불러오기")}
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
          </>
        )}
      </div>
    </>
  );
}

function HubCard({
  iconSrc,
  title,
  sub,
  onClick,
  primary = false,
}: {
  /**
   * ⚠️ 이모지가 아니라 **이미지 경로**다 (2026-08-07 사용자 제공 시안).
   * 이름을 `icon`에서 바꾼 것은 의도적이다 — 그냥 두면 남은 호출부가
   * 경로 **문자열을 글자 그대로 렌더**해도 타입이 통과한다.
   */
  iconSrc: string;
  title: string;
  sub: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-2 flex w-full items-center gap-3 rounded-card border p-4 text-left ${
        primary
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-surface-2"
      }`}
    >
      {/* ⚠️ `alt=""` — 바로 옆 `title`이 같은 뜻을 글자로 말한다. alt를 채우면
          스크린리더가 같은 말을 두 번 읽는다. 이미지가 안 떠도 제목·설명·이동은
          그대로 성립한다(설계 §5).

          ⚠️ **primary 카드에서는 아이콘을 검게 칠한다** (2026-08-07 사용자 지적).
          그 카드만 `bg-accent`(골드 채움)라, 골드 아이콘을 그대로 얹으면
          배경과 같은 색이라 **아예 안 보인다.** 글자가 `text-accent-ink`로
          어두워지는 것과 같은 이유다.
          별도 검정 자산을 만들지 않고 `brightness-0`로 눕힌다 — 자산이 두 벌이
          되면 시안을 다시 자를 때 한쪽만 갱신되어 갈라진다. */}
      <Image
        src={iconSrc}
        alt=""
        width={40}
        height={40}
        className={`h-10 w-10 flex-none ${primary ? "brightness-0" : ""}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{title}</span>
        <span
          className={`mt-0.5 block text-xs ${
            primary ? "text-accent-ink/75" : "text-muted"
          }`}
        >
          {sub}
        </span>
      </span>
      <span className={primary ? "text-accent-ink/60" : "text-faint"}>›</span>
    </button>
  );
}
