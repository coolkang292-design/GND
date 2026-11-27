import { describe, expect, it } from "vitest";
import {
  decideGeneralPull,
  decideGeneralPush,
  decideIntervalPull,
  decideIntervalPush,
  hasPendingPlanWrites,
  inferIntervalLink,
  intervalPayloadKey,
  pendingIntervalRemoval,
  removeIntervalBlockFromDraft,
  replaceGeneralPart,
  replaceIntervalPart,
  restoreIntervalBlock,
  restoreRemovedExercise,
  splitQuestDraft,
  withoutIntervalPart,
} from "./quest-plan-sync";
import { planExercisesKey, toPlanExercises } from "./workout-plan";

/*
  재현 모양 (이슈 #33): 같은 날 일반 계획 G(웨이트)와 인터벌 계획 I(4분, 블록 4종 + 이어하기 1종).
  퀘스트가 I를 목록 뒤에 이어 담은 상태에서 시작한다.
*/
let seq = 0;
const key = () => `k${++seq}`;
const ex = (
  name: string,
  over: Partial<{ reps: number; weightKg: number; exerciseType: "weight" | "bodyweight" | "cardio"; durationMin: number }> = {},
) => ({
  key: key(),
  name,
  bodyPart: "가슴" as const,
  exerciseType: over.exerciseType ?? ("weight" as const),
  measure: null,
  isCustom: false,
  sets: [
    {
      key: key(),
      weightKg: over.weightKg ?? 40,
      reps: over.reps ?? 10,
      distanceKm: 0,
      durationMin: over.durationMin ?? 0,
      done: false,
    },
  ],
});

const bench = ex("벤치프레스");
const row = ex("바벨 로우");
const block = ["버피", "점프 스쿼트", "마운틴 클라이머", "하이 니"].map((name) =>
  ex(name, { exerciseType: "bodyweight", reps: 2, weightKg: 0 }),
);
const plank = ex("플랭크", { exerciseType: "bodyweight", weightKg: 0 });

const base = {
  sessionId: null,
  startedAtMs: null,
  suggestedForDayKey: null,
  program: null,
};
/** G에 묶인 목록 + I를 이어 담은 목록 — 이 기능 뒤의 모양 */
const merged = {
  ...base,
  exercises: [bench, row, ...block, plank],
  scheduledPlanId: "G",
  tabataMinutes: 4,
  intervalStartIndex: 2,
  intervalPlanId: "I",
  intervalFollowUpKeys: [plank.key],
};
const gExercises = toPlanExercises([bench, row]);
const iExercises = toPlanExercises([...block, plank]);
const gMark = { planId: "G", updatedAt: "g1", json: planExercisesKey(gExercises) };
const iMark = { planId: "I", updatedAt: "i1", json: intervalPayloadKey(4, iExercises) };
const plan = (id: string, over: Partial<{ planDate: string; updatedAt: string; tabataMinutes: number | null; exercises: ReturnType<typeof toPlanExercises> }> = {}) => ({
  id,
  planDate: "2026-11-28",
  updatedAt: id === "G" ? "g1" : "i1",
  tabataMinutes: id === "I" ? 4 : null,
  programEnrollmentId: null,
  exercises: id === "G" ? gExercises : iExercises,
  ...over,
});

describe("splitQuestDraft — 출처별로 가른다", () => {
  it("블록·I의 이어하기·일반 부분을 나눈다", () => {
    const parts = splitQuestDraft(merged);
    expect(parts.general.map((e) => e.name)).toEqual(["벤치프레스", "바벨 로우"]);
    expect(parts.block.map((e) => e.name)).toEqual(block.map((e) => e.name));
    expect(parts.followUps.map((e) => e.name)).toEqual(["플랭크"]);
  });
});

describe("push — 두 계획에 각각 쓴다", () => {
  it("맞춘 그대로면 둘 다 쓰지 않는다", () => {
    expect(decideGeneralPush(merged, gMark).kind).toBe("none");
    expect(decideIntervalPush(merged, iMark).kind).toBe("none");
    expect(hasPendingPlanWrites(merged, { general: gMark, interval: iMark })).toBe(false);
  });

  it("T05 인터벌이 든 목록에서 일반 종목 무게를 고치면 G만 고친다 (예전엔 아무것도 안 썼다)", () => {
    const heavier = { ...bench, sets: [{ ...bench.sets[0], weightKg: 60 }] };
    const draft = { ...merged, exercises: [heavier, row, ...block, plank] };
    const push = decideGeneralPush(draft, gMark);
    expect(push.kind).toBe("update");
    expect(push.kind === "update" && push.planId).toBe("G");
    expect(push.kind === "update" && push.exercises.map((e) => e.name)).toEqual(["벤치프레스", "바벨 로우"]);
    expect(push.kind === "update" && push.exercises[0].sets[0].weightKg).toBe(60);
    expect(decideIntervalPush(draft, iMark).kind).toBe("none");
  });

  it("I의 이어하기를 고치면 I만 고친다 — 출처가 유지된다", () => {
    const longer = { ...plank, sets: [{ ...plank.sets[0], reps: 30 }] };
    const draft = { ...merged, exercises: [bench, row, ...block, longer] };
    expect(decideGeneralPush(draft, gMark).kind).toBe("none");
    const push = decideIntervalPush(draft, iMark);
    expect(push.kind).toBe("update");
    expect(push.kind === "update" && push.exercises.map((e) => e.name)).toEqual([
      ...block.map((e) => e.name),
      "플랭크",
    ]);
  });

  it("T06 일반 종목 순서를 바꾸면 G에 순서대로 쓴다", () => {
    const draft = { ...merged, exercises: [row, bench, ...block, plank] };
    const push = decideGeneralPush(draft, gMark);
    expect(push.kind === "update" && push.exercises.map((e) => e.name)).toEqual(["바벨 로우", "벤치프레스"]);
  });

  it("목록에서 새로 담은 인터벌은 오늘 인터벌 계획을 만든다", () => {
    const draft = { ...merged, intervalPlanId: null, intervalFollowUpKeys: [] };
    const push = decideIntervalPush(draft, null);
    expect(push.kind).toBe("create");
    expect(push.kind === "create" && push.tabataMinutes).toBe(4);
    expect(push.kind === "create" && push.exercises).toHaveLength(4);
  });

  it("옛 draft(연결 칸 없음)는 예전처럼 아무것도 쓰지 않는다 — 이어하기가 두 계획에 겹치지 않게", () => {
    const legacy = { ...merged, intervalPlanId: undefined, intervalFollowUpKeys: undefined };
    expect(decideGeneralPush(legacy, null).kind).toBe("none");
    expect(decideIntervalPush(legacy, null).kind).toBe("none");
  });

  it("운동 중에는 쓰지 않는다", () => {
    const started = { ...merged, startedAtMs: 1, exercises: [ex("새 종목"), ...merged.exercises] };
    expect(decideGeneralPush(started, gMark).kind).toBe("none");
    expect(decideIntervalPush({ ...started, tabataMinutes: null }, iMark).kind).toBe("none");
  });
});

describe("BUG-01 인터벌 삭제 — 원본 계획에 삭제 의도가 남는다", () => {
  const removed = removeIntervalBlockFromDraft(merged).draft;

  it("T01·T02 블록을 빼면 I를 지울 차례로 남긴다 (draft는 이 폰 저장소에 남아 새로고침에도 유지)", () => {
    expect(removed.tabataMinutes).toBeNull();
    expect(pendingIntervalRemoval(removed)).toBe("I");
    expect(decideIntervalPush(removed, iMark).kind).toBe("none");
    expect(hasPendingPlanWrites(removed, { general: gMark, interval: iMark })).toBe(true);
  });

  it("T21 인터벌만 지우면 이어하기(플랭크)는 일반 계획으로 옮겨 보존한다", () => {
    expect(removed.exercises.map((e) => e.name)).toEqual(["벤치프레스", "바벨 로우", "플랭크"]);
    const push = decideGeneralPush(removed, gMark);
    expect(push.kind === "update" && push.exercises.map((e) => e.name)).toEqual([
      "벤치프레스",
      "바벨 로우",
      "플랭크",
    ]);
  });

  it("인터벌 계획에 묶였던 옛 목록이면 묶음을 풀어 일반 부분이 일반 계획으로 간다", () => {
    const boundToI = { ...merged, scheduledPlanId: "I" };
    const next = removeIntervalBlockFromDraft(boundToI).draft;
    expect(next.scheduledPlanId).toBeNull();
    expect(decideGeneralPush(next, null).kind).toBe("create");
  });

  it("T18 모두 지우면 G·I 모두 지울 차례가 된다", () => {
    const empty = { ...removed, exercises: [] };
    expect(decideGeneralPush(empty, gMark)).toEqual({ kind: "delete", planId: "G" });
    expect(pendingIntervalRemoval(empty)).toBe("I");
  });

  it("목록을 통째로 비우는 다른 길(루틴 갈아 끼우기 등)은 인터벌 계획을 지울 차례로 만들지 않는다", () => {
    const replaced = { ...merged, tabataMinutes: null, exercises: [bench] };
    expect(pendingIntervalRemoval(replaced)).toBeNull();
    expect(decideIntervalPush(replaced, iMark).kind).toBe("none");
  });
});

describe("T10 실행 취소", () => {
  it("지우기 전이면 연결을 되살린다 — 지우기가 취소되고 그 사이 고친 무게는 남는다", () => {
    const { draft: removed, snapshot } = removeIntervalBlockFromDraft(merged);
    const heavier = { ...bench, sets: [{ ...bench.sets[0], weightKg: 70 }] };
    const edited = { ...removed, exercises: [heavier, ...removed.exercises.slice(1)] };
    const restored = restoreIntervalBlock(edited, snapshot!)!;
    expect(restored.exercises.map((e) => e.name)).toEqual(merged.exercises.map((e) => e.name));
    expect(restored.exercises[0].sets[0].weightKg).toBe(70);
    expect(restored.intervalPlanId).toBe("I");
    expect(restored.intervalFollowUpKeys).toEqual([plank.key]);
    expect(decideIntervalPush(restored, iMark).kind).toBe("none");
    expect(pendingIntervalRemoval(restored)).toBeNull();
  });

  it("이미 지웠으면 다시 만든다 — 블록과 이어하기가 함께 돌아간다", () => {
    const { draft: removed, snapshot } = removeIntervalBlockFromDraft(merged);
    const afterDelete = { ...removed, intervalRemovalPlanId: null };
    const restored = restoreIntervalBlock(afterDelete, snapshot!)!;
    const push = decideIntervalPush(restored, null);
    expect(push.kind).toBe("create");
    expect(push.kind === "create" && push.exercises.map((e) => e.name)).toEqual([
      ...block.map((e) => e.name),
      "플랭크",
    ]);
    // 이어하기는 다시 I 쪽이라 G에서는 빠진다
    const general = decideGeneralPush(restored, {
      ...gMark,
      json: planExercisesKey(toPlanExercises([bench, row, plank])),
    });
    expect(general.kind === "update" && general.exercises.map((e) => e.name)).toEqual([
      "벤치프레스",
      "바벨 로우",
    ]);
  });

  it("그 사이 다른 인터벌을 담았으면 되돌리지 않는다", () => {
    const { snapshot } = removeIntervalBlockFromDraft(merged);
    expect(restoreIntervalBlock(merged, snapshot!)).toBeNull();
  });

  it("지운 종목 되돌리기는 원래 자리에, 블록 앞이면 시작 위치를 민다", () => {
    const draft = { ...merged, exercises: [row, ...block, plank], intervalStartIndex: 1 };
    const restored = restoreRemovedExercise(draft, { exercise: bench, index: 0, wasFollowUp: false })!;
    expect(restored.exercises.map((e) => e.name)[0]).toBe("벤치프레스");
    expect(restored.intervalStartIndex).toBe(2);
    expect(restoreRemovedExercise(restored, { exercise: bench, index: 0, wasFollowUp: false })).toBeNull();
  });
});

describe("pull — 달력·다른 기기의 변경", () => {
  const input = {
    draft: merged,
    todayKey: "2026-11-28",
    todayPlans: [plan("G"), plan("I")],
    bound: plan("G"),
    mark: gMark,
    starting: false,
  };

  it("T24 다른 기기가 I를 지웠으면 블록을 뺀다", () => {
    expect(decideIntervalPull({ ...input, plan: null, mark: iMark })).toEqual({ kind: "dropped" });
    const next = withoutIntervalPart(merged);
    expect(next.exercises.map((e) => e.name)).toEqual(["벤치프레스", "바벨 로우"]);
    expect(next.tabataMinutes).toBeNull();
    expect(pendingIntervalRemoval(next)).toBeNull();
  });

  it("T24 다른 기기가 I를 고쳤으면 받아들인다 — 이 폰에 안 보낸 수정이 없을 때만", () => {
    const changed = plan("I", { updatedAt: "i2" });
    expect(decideIntervalPull({ ...input, plan: changed, mark: iMark })).toEqual({
      kind: "adopt",
      plan: changed,
    });
    const longer = { ...plank, sets: [{ ...plank.sets[0], reps: 30 }] };
    const dirty = { ...merged, exercises: [bench, row, ...block, longer] };
    expect(decideIntervalPull({ ...input, draft: dirty, plan: changed, mark: iMark }).kind).toBe("none");
  });

  it("T24 다른 기기가 G를 고쳤으면 일반 부분만 받아들이고 인터벌은 그대로", () => {
    const changed = plan("G", { updatedAt: "g2" });
    expect(decideGeneralPull({ ...input, bound: changed, todayPlans: [changed, plan("I")] })).toEqual({
      kind: "adopt",
      plan: changed,
    });
  });

  it("이 폰에서 막 고친 일반 종목은 다른 기기 값으로 덮지 않는다 — 마지막 저장이 이긴다", () => {
    const heavier = { ...bench, sets: [{ ...bench.sets[0], weightKg: 60 }] };
    const dirty = { ...merged, exercises: [heavier, row, ...block, plank] };
    const changed = plan("G", { updatedAt: "g2" });
    expect(decideGeneralPull({ ...input, draft: dirty, bound: changed }).kind).toBe("none");
    // 인터벌 없는 목록도 같은 기준이다
    const plain = { ...base, exercises: [heavier, row], scheduledPlanId: "G", tabataMinutes: null };
    expect(decideGeneralPull({ ...input, draft: plain, bound: changed }).kind).toBe("none");
  });

  it("일반 계획을 달력에서 지웠으면 일반 부분만 비운다", () => {
    const pull = decideGeneralPull({ ...input, bound: null, todayPlans: [plan("I")] });
    expect(pull).toEqual({ kind: "clear", reason: "deleted", next: null });
  });

  it("I를 갈아 끼우면 블록 자리를 지키고 이어하기 연결을 새로 만든다", () => {
    const newPlank = { ...plank, key: "new-plank" };
    const next = replaceIntervalPart(merged, { tabataMinutes: 8, block, followUps: [newPlank, { ...bench, key: "dup" }] });
    expect(next.exercises.map((e) => e.name)).toEqual(["벤치프레스", "바벨 로우", ...block.map((e) => e.name), "플랭크"]);
    expect(next.intervalStartIndex).toBe(2);
    expect(next.tabataMinutes).toBe(8);
    expect(next.intervalFollowUpKeys).toEqual(["new-plank"]);
  });
});

describe("옛 draft 연결 — 이 기능 전에 담긴 목록 (T01 재현 사용자의 폰 상태)", () => {
  const legacy = { ...merged, intervalPlanId: undefined, intervalFollowUpKeys: undefined };

  it("오늘 인터벌 계획의 온전한 복사본이면 연결한다", () => {
    const link = inferIntervalLink(legacy, [plan("G"), plan("I")]);
    expect(link?.plan.id).toBe("I");
    expect(link?.followUpKeys).toEqual([plank.key]);
  });

  it("계획의 이어하기가 목록에 없으면(인터벌 4종만 담긴 옛 복사본) 연결하지 않는다", () => {
    const blockOnly = { ...legacy, exercises: [...block], intervalStartIndex: 0 };
    expect(inferIntervalLink(blockOnly, [plan("I")])).toBeNull();
  });

  it("같은 블록의 인터벌 계획이 둘이면 어느 것인지 몰라 연결하지 않는다", () => {
    expect(inferIntervalLink(legacy, [plan("I"), { ...plan("I"), id: "I2" }])).toBeNull();
  });
});

describe("replaceGeneralPart — 일반 부분만 바꾼다", () => {
  it("달력이 일반 계획을 고쳐도 블록·이어하기 자리는 그대로", () => {
    const squat = ex("스쿼트");
    const next = replaceGeneralPart(merged, [squat, bench, row]);
    expect(next.exercises.map((e) => e.name)).toEqual([
      "스쿼트",
      "벤치프레스",
      ...block.map((e) => e.name),
      "플랭크",
      "바벨 로우",
    ]);
    expect(next.intervalStartIndex).toBe(2);
    expect(splitQuestDraft(next).followUps.map((e) => e.name)).toEqual(["플랭크"]);
  });

  it("일반 계획이 지워지면 인터벌 부분만 남는다", () => {
    const next = replaceGeneralPart(merged, []);
    expect(next.exercises.map((e) => e.name)).toEqual([...block.map((e) => e.name), "플랭크"]);
    expect(next.intervalStartIndex).toBe(0);
  });
});

describe("유산소 시간 — 목록은 초(durationSec)에 쓴다", () => {
  it("퀘스트에서 유산소를 30분(1800초)으로 고치면 계획에 30분으로 쓴다 (예전엔 0분)", () => {
    const run = { ...ex("트레드밀", { exerciseType: "cardio", reps: 0, weightKg: 0 }) };
    const timed = { ...run, sets: [{ ...run.sets[0], durationMin: 0, durationSec: 1800 }] };
    const draft = { ...base, exercises: [bench, timed], scheduledPlanId: "G", tabataMinutes: null, intervalPlanId: undefined };
    const mark = { planId: "G", updatedAt: "g1", json: planExercisesKey(toPlanExercises([bench, run])) };
    const push = decideGeneralPush(draft, mark);
    expect(push.kind).toBe("update");
    expect(push.kind === "update" && push.exercises[1].sets[0].durationMin).toBe(30);
  });
});
