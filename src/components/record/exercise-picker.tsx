"use client";

import { useMemo, useRef, useState } from "react";
import {
  exerciseFrequencyMap,
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
import type { PlanExercise } from "@/lib/domain/workout-plan";
import {
  buildPresetRoutineExercises,
  visiblePresetRoutines,
} from "@/lib/domain/preset-routines";
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
import { ExerciseThumbTile } from "./exercise-thumb";
import { PickActions } from "./pick-actions";
import { imagesFirst } from "@/lib/domain/exercise-images";
import { CompactOnly, FullScreenFlow, WideOnly, leaveFullScreenFlow, type FlowConfirmation } from "./full-screen-flow";

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
 * 예전 `hub` 진입도 이제 검색·부위 목록을 바로 연다. 추천은 작은 메뉴로 유지한다.
 */
type PickerMode =
  | "hub"
  | "situation"
  | "part"
  | "setup"
  | "search"
  | "past"
  | "routine"
  /**
   * 추천 루틴 (2026-09-03) — 앱이 미리 만들어 둔 루틴.
   *
   * ⚠️ **허브(`hub`)가 아니라 '운동 직접 고르기' 안의 '빠르게 찾기'에 둔다.**
   *    허브는 "네 개만 둔다"가 사용자 지시로 고정돼 있다
   *    (`exercise-entry-hub.tsx` 주석, 2026-08-12). 또 `내 루틴`은
   *    `routines?.length`가 0이면 입구가 숨는데, 추천 루틴이 가장 필요한
   *    사람이 바로 **루틴 0개인 신규 사용자**라 거기 두면 볼 사람이 못 본다.
   */
  | "preset";

/** 고른 종목 + 정해진 세트 — 기록 draft로도, 예정표로도 갈 수 있는 모양 */
export type ConfiguredPick = { item: CatalogExercise; sets: LocalSet[] };

type PickerProps = {
  catalog: CatalogExercise[];
  pastSessions: CalendarSession[];
  pastLoading: boolean;
  onClose: () => void;
  /** 선택한 운동 여러 개를 한 번에 추가 (검색 경로 — 기본 세트) */
  onPickMany: (items: CatalogExercise[]) => void | Promise<void>;
  /**
   * 세트까지 정해서 추가 (2026-08-06). **넘기면 검색 경로도 이리로 온다**
   * (2026-10-05) — `바로 추가`는 기본 3세트·10회, `세트 조절`은 정한 값으로.
   * `onPickMany`는 이걸 안 넘기는 화면(로컬 이미지 검수)의 대비다.
   */
  onPickConfigured?: (picks: ConfiguredPick[]) => void | Promise<void>;
  /**
   * `세트 조절` 버튼을 낼지 (기본 true).
   *
   * 인터벌 고르기는 `false`다 — 세트는 코스 분수가 정해서(`tabataRepsForMinutes`)
   * 여기서 정한 값을 버린다. 정하게 해 놓고 버리면 그 화면이 거짓말을 한다.
   */
  setupAdjustable?: boolean;
  /**
   * 운동 중 '바꾸기'로 열었으면 **바꿀 운동 이름** (2026-10-05 2단계).
   *
   * 바꾸기는 한 종목을 한 종목으로 바꾸는 일이라:
   * - **하나만** 고르게 한다 — 새로 고르면 앞의 것을 놓는다. 예전엔 여러 개를 고를 수
   *   있었고 첫 번째만 쓰여 나머지가 말없이 버려졌다(`replaceFocusedExercise` 주석)
   * - 담는 버튼은 `이 운동으로 바꾸기`, `세트 조절`은 없다(세트 수는 원래 것을 유지)
   * - 프로그램·지난 운동·내 루틴·추천 루틴·인터벌 입구를 숨긴다 — 그 길들은
   *   **목록을 통째로 담거나 시작해서** 바꾸기가 아니라 추가가 된다
   */
  replacing?: string | null;
  /** 진입 화면 제목 — 달력은 "8월 17일 계획 만들기", 인터벌은 "인터벌 운동 고르기" (없으면 `운동 계획하기`) */
  heading?: { title: string; sub: string };
  /** 담는 버튼 문구 (개수 → 문구) — `PickActions` 참조 */
  addLabel?: (count: number) => string;
  /** 설정 화면 확정 버튼 문구 */
  confirmLabel?: (count: number) => string;
  /** 저장 중 — 달력은 담는 즉시 DB에 쓰므로 그동안 버튼을 잠근다 */
  busy?: boolean;
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
  /** 공식 프로그램 카탈로그 진입 — 기록 화면에서만 넘긴다 */
  onOpenPrograms?: () => void;
  /**
   * 전신 인터벌 진입 — 상황별 추천의 `전신 인터벌 할래요` 칸이 쓴다
   * (사용자 지시 2026-08-13). 안 넘기면 그 칸은 미리보기만 보여 준다.
   */
  onStartInterval?: () => void;
  /** 인터벌 칸의 버튼 문구 */
  intervalCta?: string;
  /** 내 루틴 (0056). **저장된 루틴이 있을 때만** 진입 카드가 나온다 */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  /** 루틴 하나를 불러온다 — true면 시트를 닫는다 */
  onPickRoutine?: (routine: WorkoutRoutine) => Promise<boolean>;
  /**
   * 추천 루틴 담기 (2026-09-03). `onPickRoutine`과 **같은 핸들러**를 받는다 —
   * 기록 페이지의 `addRoutine`이 `name`·`exercises`·`tabataMinutes`만 읽도록
   * 좁혀져 있어서 DB 행이 아닌 추천 루틴도 그대로 통과한다.
   */
  onPickPreset?: (routine: {
    name: string;
    exercises: PlanExercise[];
    tabataMinutes: number | null;
  }) => Promise<boolean>;
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

/** 전체 화면 운동 고르기 — 선택과 저장은 기존 호출 화면이 계속 소유한다. */
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
  setupAdjustable = true,
  replacing = null,
  heading,
  addLabel,
  confirmLabel,
  busy = false,
  onPickPast,
  onCreateCustom,
  onStartInterval,
  intervalCta,
  initialMode = "hub",
  onOpenPrograms,
  challengeCategories = null,
  routines,
  routinesLoading = false,
  onPickRoutine,
  onPickPreset,
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
  const replaceMode = replacing !== null;
  const routinesEnabled = Boolean(
    !replaceMode && routines?.length && onPickRoutine,
  );
  // 바꾸기에서는 '담거나 시작하는' 입구를 숨긴다 (`replacing` 주석)
  const programsEntry = replaceMode ? undefined : onOpenPrograms;
  const intervalEntry = replaceMode ? undefined : onStartInterval;
  const presetEntry = replaceMode ? undefined : onPickPreset;
  const pickLabel = replaceMode ? () => "이 운동으로 바꾸기" : addLabel;
  /** 카탈로그에 종목이 있는 추천 루틴만 (없으면 카드를 아예 안 낸다) */
  const presetRoutines = useMemo(() => visiblePresetRoutines(catalog), [catalog]);
  const [presetBusyKey, setPresetBusyKey] = useState<string | null>(null);

  async function pickPreset(key: string) {
    const preset = presetRoutines.find((p) => p.key === key);
    if (!preset || !presetEntry || blocked || pendingRef.current) return;
    const exercises = buildPresetRoutineExercises(preset, catalog);
    if (!exercises) return;
    pendingRef.current = true;
    setError(null);
    setPresetBusyKey(key);
    try {
      // ⚠️ tabataMinutes는 **null**이다. 값을 넣으면 `addRoutine`이 인터벌로
      //    되살려 사다리가 통째로 사라진다(그 분기가 먼저 걸린다).
      if (await presetEntry({ name: preset.name, exercises, tabataMinutes: null }))
        onClose();
    } catch {
      setError("추천 루틴을 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setPresetBusyKey(null);
    }
  }
  const [mode, setMode] = useState<PickerMode>(initialMode === "hub" ? "search" : initialMode);
  const [routineBusyId, setRoutineBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<(typeof FILTERS)[number]>("전체");
  /**
   * 고른 운동 — 검색·자주 한 운동·직접 만들기·상황별·부위별이 **전부 여기 하나**에 담는다.
   *
   * ⚠️ 2026-08-06에는 추천 경로가 따로 `recommendSelected`를 들고 있었다(확정 버튼이
   *    기본 세트 / 정한 세트로 달랐기 때문). 그 결과 추천에서 고른 것이 검색 화면에서
   *    안 보이고 검색 화면의 추가 버튼으로는 안 담겼다 — 사용자에게는 "추가가 안
   *    된다"였다(2026-10-05 신고, 화면에서 재현). 확정 버튼을 하나로 합치면서 갈라
   *    둘 이유가 없어졌다.
   */
  const [selected, setSelected] = useState<Map<string, CatalogExercise>>(
    () => new Map(),
  );
  const [recommendPart, setRecommendPart] = useState<RecommendPart>("가슴");
  const [situation, setSituation] = useState<SituationKey>("beginner");
  /** 설정 화면의 ←가 **왔던 화면**(상황별·부위별·검색)으로 돌아가게 한다 */
  const [setupReturnMode, setSetupReturnMode] = useState<
    "situation" | "part" | "search"
  >("search");
  const [setupEntries, setSetupEntries] = useState<SetupEntry[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPart, setCustomPart] = useState<BodyPart>("가슴");
  const [customType, setCustomType] = useState<ExerciseType>("weight");
  const [customMeasure, setCustomMeasure] = useState<"reps" | "time">("reps");
  const [saving, setSaving] = useState(false);
  const [pastBusyId, setPastBusyId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState<FlowConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const blocked = busy || submitting || saving || pastBusyId !== null || routineBusyId !== null || presetBusyKey !== null;


  // 시트가 열려 있는 동안 고정 — 매 렌더마다 now가 바뀌면 90일 창이 미세하게 흔들린다.
  // 시트는 닫힐 때 언마운트되므로 다음에 열면 새로 계산된다.
  const openedAt = useMemo(() => new Date(), []);

  /** 이름 → 최근 90일 사용 횟수. 목록 정렬과 횟수 뱃지가 같은 수를 쓴다. */
  const frequency = useMemo(
    () => exerciseFrequencyMap(pastSessions, openedAt),
    [pastSessions, openedAt],
  );

  const q = query.trim().toLowerCase();
  // 빈도 우선, 동수는 그림 유무와 원래 순서. 이력이 없으면 기존 그림 우선 순서다.
  const list = sortByFrequency(
    imagesFirst(catalog.filter((e) =>
      (part === "전체" || (part === "맨몸" ? e.exercise_type === "bodyweight" : e.body_part === part)) &&
      (!q || e.name.toLowerCase().includes(q))), (item) => item.id),
    frequency, (item) => item.name,
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
    if (blocked || pendingRef.current) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      // 바꾸기는 하나만 — 새로 고르면 앞의 것을 놓는다
      else if (replaceMode) return new Map([[item.id, item]]);
      else next.set(item.id, item);
      return next;
    });
  }

  function openRecommendation(next: "situation" | "part") {
    setMode(next);
  }

  /**
   * 고른 순서대로 설정값을 붙인다 — `세트 조절`에서 이미 바꾼 값은 **살린다.**
   * 조절하고 뒤로 가서 하나 더 고른 뒤 다시 들어와도 앞의 조절이 지워지지 않게.
   */
  function currentEntries(): SetupEntry[] {
    const adjusted = new Map(setupEntries.map((e) => [e.item.id, e.plan]));
    return initialSetupEntries([...selected.values()]).map((entry) => ({
      ...entry,
      plan: adjusted.get(entry.item.id) ?? entry.plan,
    }));
  }

  async function submitEntries(entries: SetupEntry[]) {
    if (entries.length === 0 || blocked || pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!onPickConfigured) await onPickMany(entries.map((e) => e.item));
      else await onPickConfigured(entries.map(({ item, plan }) => ({
        item, sets: planToSets(item.exercise_type, item.measure, plan),
      })));
    } catch {
      setError("담지 못했어요. 고른 운동은 그대로예요. 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  }

  /** `바로 추가` — 기본 3세트·10회·무게 운동 중 입력 (사용자 결정 2026-10-05) */
  function addSelected() {
    void submitEntries(currentEntries());
  }

  /** `세트 조절` — 고른 것들을 설정 화면으로 넘긴다 */
  function goToSetup() {
    const entries = currentEntries();
    if (entries.length === 0) return;
    if (mode === "situation" || mode === "part" || mode === "search")
      setSetupReturnMode(mode);
    setSetupEntries(entries);
    setMode("setup");
  }

  function confirmSetup() {
    void submitEntries(setupEntries);
  }

  /** 세트를 정할 수 있는 화면에서만 `세트 조절`을 낸다 */
  const adjustSets =
    onPickConfigured && setupAdjustable && !replaceMode ? goToSetup : undefined;

  function requestClose() {
    if (blocked || pendingRef.current) return;
    if (selected.size > 0 || customOpen) {
      setConfirmation({
        message: selected.size > 0 ? `고른 운동 ${selected.size}개를 담지 않고 닫을까요?` : "만들던 운동을 저장하지 않고 닫을까요?",
        confirmLabel: "담지 않고 닫기", onConfirm: onClose,
        onCancel: () => setConfirmation(null),
      });
    } else onClose();
  }

  function requestImport(action: () => void) {
    if (blocked || pendingRef.current) return;
    if (selected.size === 0) { action(); return; }
    setConfirmation({
      message: `고른 운동 ${selected.size}개 대신 다른 운동을 불러올까요?`,
      confirmLabel: "다른 운동 불러오기",
      onCancel: () => setConfirmation(null),
      onConfirm: () => { setConfirmation(null); action(); },
    });
  }

  function leavePicker(action: () => void) {
    if (blocked || pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    leaveFullScreenFlow(() => {
      pendingRef.current = false;
      setSubmitting(false);
      action();
    });
  }

  function goBack() {
    if (blocked) return;
    if (confirmation) { setConfirmation(null); return; }
    if (mode === "setup") setMode(setupReturnMode);
    else if (mode === "situation" || mode === "part" || mode === "preset") setMode("search");
    else if (customOpen) {
      if (nameRef.current?.value.trim()) setConfirmation({
        message: "만들던 운동을 저장하지 않고 돌아갈까요?", confirmLabel: "만들기 취소", cancelLabel: "계속 만들기",
        onCancel: () => setConfirmation(null), onConfirm: () => { setConfirmation(null); setCustomOpen(false); },
      });
      else setCustomOpen(false);
    }
    else requestClose();
  }

  async function createCustom() {
    const name = (nameRef.current?.value ?? "").trim();
    if (!name || blocked || pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
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
        setSelected((prev) =>
          replaceMode
            ? new Map([[created.id, created]])
            : new Map(prev).set(created.id, created),
        );
        setCustomOpen(false);
        if (nameRef.current) nameRef.current.value = "";
      }
    } catch {
      setError("운동을 만들지 못했어요. 입력한 내용을 확인하고 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  async function pickPast(sessionId: string) {
    if (blocked || pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setPastBusyId(sessionId);
    try {
      const added = await onPickPast(sessionId);
      if (added) onClose();
    } catch {
      setError("지난 운동을 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setPastBusyId(null);
    }
  }

  async function pickRoutine(routine: WorkoutRoutine) {
    if (!onPickRoutine || blocked || pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setRoutineBusyId(routine.id);
    try {
      if (await onPickRoutine(routine)) onClose();
    } catch {
      setError("루틴을 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      pendingRef.current = false;
      setRoutineBusyId(null);
    }
  }

  async function removeRoutine(routine: WorkoutRoutine) {
    if (!onDeleteRoutine) return;
    setConfirmation({ message: `'${routine.name}' 루틴을 삭제할까요?`, confirmLabel: "루틴 삭제", cancelLabel: "취소",
      onCancel: () => setConfirmation(null), onConfirm: () => { setConfirmation(null); void deleteConfirmedRoutine(routine); } });
  }

  async function deleteConfirmedRoutine(routine: WorkoutRoutine) {
    if (!onDeleteRoutine || blocked) return;
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

  const nestedTitle = customOpen && mode === "search" ? "운동 직접 만들기" : mode === "setup" ? "세트와 횟수 설정"
    : mode === "situation" ? "상황별 추천" : mode === "part" ? "부위별 추천"
    : mode === "preset" ? "추천 루틴" : null;

  return (
    <FullScreenFlow title={nestedTitle ?? (replaceMode ? `'${replacing}' 바꾸기` : heading?.title ?? "운동 계획하기")}
      subtitle={nestedTitle ? undefined : heading?.sub}
      onBack={goBack} onClose={requestClose} busy={blocked} confirmation={confirmation}
      backLabel={mode === "setup" ? "고르던 화면으로 돌아가기" : mode === "situation" || mode === "part" || mode === "preset" ? "이전 화면으로 돌아가기" : "진입 화면으로 돌아가기"}
      closeLabel="운동 선택 닫기">
      <fieldset disabled={blocked} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error && <p role="alert" className="mb-2 flex-none rounded-card-sm border border-warn/40 px-3 py-2 text-xs text-warn">{error}</p>}
        {(mode === "search" || mode === "routine" || mode === "past") && !replaceMode && !customOpen && (<WideOnly>
          <nav aria-label="운동을 담는 방법" className="mb-2 flex flex-none gap-1 border-b border-line pb-2">
            {([['search', '운동 직접 고르기'], ...(routinesEnabled ? [['routine', '내 루틴']] : []), ['past', '지난 운동']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setMode(key as PickerMode)} aria-current={mode === key ? 'page' : undefined}
                className={`min-h-10 min-w-0 flex-1 rounded-card-sm px-1 text-xs font-bold ${mode === key ? 'bg-accent-weak text-accent' : 'text-muted'}`}>{label}</button>
            ))}
          </nav>
        </WideOnly>)}
        {(mode === "search" || mode === "routine" || mode === "past") && !customOpen && (<CompactOnly>
          <div className="mb-2 flex flex-none gap-2" data-compact-toolbar>
            {/* 작은 화면에서는 탭·추천 줄이 숨으므로 **모든 입구**가 이 메뉴 하나에 있어야 한다.
                프로그램은 화면 이동이라 값으로 남기지 않고, 고른 운동이 있으면 먼저 묻는다. */}
            <select aria-label="운동을 담는 방법 선택" value={mode} onChange={(event) => {
              const next = event.target.value;
              if (next === "program") { if (programsEntry) requestImport(() => leavePicker(programsEntry)); return; }
              setMode(next as PickerMode);
            }}
              className="h-11 min-w-0 flex-1 rounded-card-sm border border-line bg-surface-2 px-2 text-base">
              <option value="search">직접 선택</option>
              {routinesEnabled && <option value="routine">저장한 루틴</option>}
              {!replaceMode && <option value="past">지난 운동 불러오기</option>}
              <option value="situation">상황별 추천</option>
              <option value="part">부위별 추천</option>
              {presetEntry && presetRoutines.length > 0 && <option value="preset">추천 루틴</option>}
              {programsEntry && <option value="program">프로그램으로 시작하기</option>}
            </select>
            {mode === "search" && <select aria-label="운동 부위 선택" value={part} onChange={(event) => setPart(event.target.value as (typeof FILTERS)[number])}
              className="h-11 min-w-0 flex-1 rounded-card-sm border border-line bg-surface-2 px-2 text-base">
              {FILTERS.map((filter) => <option key={filter} value={filter}>{filter}</option>)}
            </select>}
          </div>
        </CompactOnly>)}
        {mode === "situation" || mode === "part" ? (
          <RecommendedPicker
            mode={mode}
            embedded
            catalog={catalog}
            challengeCategories={challengeCategories}
            part={recommendPart}
            onPart={setRecommendPart}
            situation={situation}
            onSituation={setSituation}
            // 인터벌은 같은 화면 안에서 시트를 연다 — 주소 이동이 아니라서 기록 정리를 기다리지
            // 않는다(기다리면 한 박자 늦게 열린다). 주소가 바뀌는 프로그램만 leavePicker를 쓴다.
            onStartInterval={intervalEntry ? () => requestImport(intervalEntry) : undefined}
            intervalCta={intervalCta}
            selected={new Set(selected.keys())}
            onToggle={toggleSelect}
            onBack={() => setMode("search")}
            onSearch={() => setMode("search")}
            onAdd={addSelected}
            onAdjust={adjustSets}
            addLabel={pickLabel}
            busy={blocked}
          />
        ) : mode === "setup" ? (
          <ExerciseSetupSheet
            embedded
            entries={setupEntries}
            onChange={(index, plan) =>
              setSetupEntries((prev) =>
                prev.map((entry, i) => (i === index ? { ...entry, plan } : entry)),
              )
            }
            onBack={() => setMode(setupReturnMode)}
            onConfirm={confirmSetup}
            confirmLabel={confirmLabel}
            busy={blocked}
          />
        ) : mode === "search" ? (
          <>
            {!customOpen && <><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              aria-label="운동 검색" placeholder="🔍 운동 검색 (예: 스쿼트, 벤치)"
              className="mb-2 h-11 w-full flex-none rounded-card-sm border border-line bg-bg px-3 text-base outline-none focus:border-accent" />
            <WideOnly><div aria-label="운동 부위" className="mb-2 grid flex-none grid-cols-5 gap-1">
              {FILTERS.map((p) => <button key={p} type="button" onClick={() => setPart(p)} aria-pressed={p === part}
                className={`min-h-11 rounded-card-sm border px-1 text-xs font-bold ${p === part ? 'border-accent bg-accent-weak text-accent' : 'border-line bg-surface-2 text-muted'}`}>{p}</button>)}
            </div></WideOnly>
            <div className="mb-1 flex flex-none justify-between text-xs text-muted"><span>운동 {list.length}개</span><span>{pastLoading ? '횟수 불러오는 중…' : frequency.size > 0 ? '빈도순' : '기본순'}</span></div></>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* 챌린지 목표를 아는 경우가 더 구체적이므로 먼저 보여준다.
                둘을 같이 띄우면 배너가 두 줄이 되어 목록을 밀어낸다. */}
            {!customOpen && (pickedMisses && challengeCategories !== null ? (
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
            ) : null)}

            {!customOpen && <div>
          {list.length > 0 ? (
            list.map((e) => {
              const isSelected = selected.has(e.id);
              return (
                <button
                  key={e.id}
                  data-exercise-row
                  onClick={() => toggleSelect(e)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between gap-2 border-b border-line py-1.5 text-left ${
                    isSelected ? "bg-accent-weak/40" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded border text-sm font-bold ${
                      isSelected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line text-accent"
                    }`}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <ExerciseThumbTile id={e.id} name={e.name} bodyPart={e.body_part} />
                  <span className="min-w-0 flex-1">
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
            </div>}

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
              className="mt-1 mb-2 h-10 w-full rounded-card-sm border border-line bg-bg px-3 text-base outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-bold text-muted">부위</label>
                <select
                  value={customPart}
                  onChange={(e) => setCustomPart(e.target.value as BodyPart)}
                  className="mt-1 h-11 w-full min-w-0 max-w-full rounded-card-sm border border-line bg-bg px-2 text-base"
                >
                  {PARTS.slice(1).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-bold text-muted">유형</label>
                <select
                  value={customType}
                  onChange={(e) =>
                    setCustomType(e.target.value as ExerciseType)
                  }
                  className="mt-1 h-11 w-full min-w-0 max-w-full rounded-card-sm border border-line bg-bg px-2 text-base"
                >
                  <option value="weight">웨이트 (kg × 회)</option>
                  <option value="bodyweight">맨몸 (회)</option>
                  <option value="cardio">유산소 (거리·시간)</option>
                </select>
              </div>
              {customType === "bodyweight" && (
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-bold text-muted">측정</label>
                  <select
                    value={customMeasure}
                    onChange={(e) =>
                      setCustomMeasure(e.target.value as "reps" | "time")
                    }
                    className="mt-1 h-11 w-full min-w-0 max-w-full rounded-card-sm border border-line bg-bg px-2 text-base"
                  >
                    <option value="reps">횟수 (회)</option>
                    <option value="time">시간 (초) — 플랭크·매달리기처럼</option>
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
            </div>

            {!customOpen && (!q || programsEntry) && <WideOnly><div className="mt-1 flex flex-none items-center gap-2 border-t border-line pt-1">
              {!q && <details className="relative min-w-0 flex-1">
                <summary className="flex min-h-10 cursor-pointer items-center text-xs font-bold text-muted">운동 추천 <span className="ml-1" aria-hidden>⌄</span></summary>
                <div className="absolute inset-x-0 bottom-full z-20 rounded-card border border-line bg-surface p-2 shadow-card">
                  <button type="button" onClick={() => openRecommendation("situation")} className="min-h-11 w-full rounded-card-sm px-3 text-left text-sm font-bold">상황별 추천</button>
                  <button type="button" onClick={() => openRecommendation("part")} className="min-h-11 w-full rounded-card-sm px-3 text-left text-sm font-bold">부위별 추천</button>
                  {presetEntry && presetRoutines.length > 0 && <button type="button" onClick={() => setMode("preset")} className="min-h-11 w-full rounded-card-sm px-3 text-left text-sm font-bold">추천 루틴</button>}
                </div>
              </details>}
              {programsEntry && <button type="button" onClick={() => requestImport(() => leavePicker(programsEntry))} className="ml-auto min-h-10 px-2 text-xs font-bold text-accent">프로그램으로 시작하기</button>}
            </div></WideOnly>}
            {!customOpen && <PickActions
              count={selected.size}
              onAdd={addSelected}
              onAdjust={adjustSets}
              addLabel={pickLabel}
              busy={blocked}
            />}
          </>
        ) : mode === "routine" ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RoutineList
                routines={routines ?? []}
                loading={routinesLoading}
                busyId={routineBusyId}
                onPick={(routine) => requestImport(() => void pickRoutine(routine))}
                onRename={renameRoutine}
                onDelete={(routine) => void removeRoutine(routine)}
              />
            </div>
          </>
        ) : mode === "preset" ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-2 pb-2">
                {presetRoutines.map((preset) => (
                  <li
                    key={preset.key}
                    className="rounded-card border border-line bg-surface p-4 shadow-card"
                  >
                    <p className="text-sm font-extrabold">{preset.name}</p>
                    <p className="mt-0.5 text-[11px] text-faint">{preset.sub}</p>
                    <p className="mt-2 text-[12.5px] font-bold text-text">
                      {preset.summary}
                    </p>
                    {/* 앱이 매일 자동으로 올려 주지 않는다는 사실을 여기서 밝힌다 —
                        안 밝히면 사용자가 진행을 앱이 해 줄 거라고 믿는다. */}
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      {preset.howTo}
                    </p>
                    <button
                      type="button"
                      disabled={presetBusyKey !== null}
                      onClick={() => requestImport(() => void pickPreset(preset.key))}
                      className="mt-3 h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
                    >
                      {presetBusyKey === preset.key ? "담는 중…" : "담기"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
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
                /*
                  인터벌은 눈에 띄게 갈라 놓는다 (사용자 지시 2026-08-13).

                  목록에서는 종목 이름만 보여서, 맨몸 4종이 인터벌인지 그냥
                  운동인지 구별할 수 없었다. 고르면 하는 일도 다르다 —
                  인터벌은 음원과 함께 되살아난다 (`tabataResumeFromSession`).
                */
                const intervalMinutes = session.tabataMinutes;
                return (
                  <button
                    key={session.id}
                    type="button"
                    disabled={pastBusyId !== null}
                    onClick={() => requestImport(() => void pickPast(session.id))}
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
                        {intervalMinutes ? (
                          <span
                            data-testid="past-interval-badge"
                            className="ml-2 rounded-full bg-accent-weak px-2 py-0.5 text-[10px] font-extrabold text-accent"
                          >
                            🔥 인터벌 {intervalMinutes}분
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {session.exerciseNames.length > 0
                          ? session.exerciseNames.join(" · ")
                          : "운동 완료"}
                      </span>
                    </span>
                    <span className="flex-none text-xs font-extrabold text-accent">
                      {pastBusyId === session.id
                        ? "불러오는 중…"
                        : intervalMinutes
                          ? "인터벌 시작"
                          : "불러오기"}
                    </span>
                  </button>
                );
              })
            )}
            </div>
          </>
        )}
      </fieldset>
    </FullScreenFlow>
  );
}
