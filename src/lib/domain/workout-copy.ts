/**
 * 이 운동 따라하기 — 피드에서 넘어온 `?copy=<sessionId>` 판정 (2026-08-31).
 *
 * 피드에서 친구 운동을 보고 `이 운동 따라하기`를 누르면 `/record?copy=<id>`로 온다.
 * 그 세션의 **완료한 종목·세트**가 기록 draft에 담기고, 사용자가 확인한 뒤
 * 기존 `운동 시작`으로 시작한다.
 *
 * ⚠️ 버튼을 누르는 순간 서버 active session을 만들지 않는다. 한 번 확인할 기회가
 *    있어야 한다 — 친구가 한 무게가 나에게 맞으리라는 보장이 없다.
 *
 * ⚠️ **판정을 화면에 흩어 놓지 않는다.** `shouldApplySuggestion`(0078)이 같은
 *    이유로 도메인에 있다 — 조건이 컴포넌트 안에 있으면 회귀를 테스트가 못 잡는다.
 *
 * 순수 함수다. 조회하지 않는다.
 */

import type { LocalExercise, LocalSet } from "@/lib/workout";

/** `tabataResumeFromSession`이 요구하는 최소 모양. 그 이상 싣지 않는다 */
export type CopySource = {
  tabataMinutes: number | null;
  exerciseNames: readonly string[];
};

export function shouldApplyCopy(input: {
  /** 주소에 `?copy=`가 있었나 */
  requested: boolean;
  /** 이미 담았나 — 새로고침으로 두 번 담기지 않게 */
  consumed: boolean;
  /** 종목 카탈로그가 준비됐나. 없으면 이름→종목 대응이 안 된다 */
  catalogReady: boolean;
  /**
   * 이미 운동을 시작했나.
   *
   * ⚠️ 시작한 운동의 draft를 **덮어쓰지 않는다.** 진행 중인 세트를 남의 기록으로
   *    갈아 끼우면 지금 하고 있던 운동이 사라진다. `shouldApplySuggestion`도
   *    같은 이유로 이 조건을 갖고 있다.
   */
  workoutStarted: boolean;
}): boolean {
  if (!input.requested || input.consumed) return false;
  if (!input.catalogReady) return false;
  if (input.workoutStarted) return false;
  return true;
}

/**
 * 원본 세션 id를 내 `workout_plans.source_session_id`에 남겨도 되는가.
 *
 * ⚠️⚠️ **남의 세션이면 절대 안 된다.** `workout_plans_insert_own` 정책의
 *    WITH CHECK가 `(source_session_id is null) or owns_workout_session(...)`이라,
 *    남의 id를 넣으면 **INSERT가 통째로 거부된다** — 예정표 저장이 실패한다.
 *
 * 그리고 정책이 없더라도 남기면 안 된다. `source_session_id`는 "이 계획이 내 어느
 * 기록에서 나왔나"를 뜻하고, 기록 갱신 비교의 기준이 된다. 남의 기록을 내 갱신
 * 기준으로 삼으면 **내가 한 적 없는 무게가 내 최고 기록이 된다.**
 */
export function copySourceSessionId(input: {
  sessionId: string;
  sessionOwnerId: string;
  viewerId: string;
}): string | null {
  return input.sessionOwnerId === input.viewerId ? input.sessionId : null;
}

// ── 무게는 내 것으로 (사용자 결정 2026-08-31) ────────────────


/** 화면에만 쓰는 참고 표시. draft·계획 JSON에 실리지 않는다 */
export type CopyReference = {
  /** `LocalExercise.key` */
  exerciseKey: string;
  name: string;
  /** 원본(친구)이 실제로 든 무게 — 세트 순서대로 */
  weights: number[];
};

export type AppliedCopy = {
  exercises: LocalExercise[];
  reference: CopyReference[];
};

/**
 * 친구의 **운동 설계**만 가져오고 **무게는 내 것**으로 바꾼다.
 *
 * > "따라하기 = 친구의 운동 설계 복사 + 내 직전 중량 적용" (사용자 2026-08-31)
 *
 * 규칙 (사용자가 정함):
 *   ① 내 기록 있음 → **내 최근 무게** 적용
 *   ② 내 기록 없음 → **무게 미설정**(0). 사용자가 넣는다
 *   ③ 친구 무게 → **참고용으로만 표시**
 *
 * ⚠️⚠️ **친구 무게를 그대로 담으면 안 된다.** 친구가 벤치 100kg을 들었다고 내
 *    화면에 100kg이 채워지면, 그건 편의가 아니라 **다칠 수 있는 기본값**이다.
 *    가져올 것은 "무엇을 몇 세트 몇 회" — 그게 설계다.
 *
 * ⚠️ 무게가 없는 종목(맨몸·유산소·시간형)은 **손대지 않는다.** 거기엔 갈아 끼울
 *    무게가 없고, 횟수·거리·시간은 설계의 일부다.
 *
 * ⚠️ 참고 무게를 `LocalExercise`에 넣지 않는다. 그 타입은 `workout_plans.exercises`로
 *    직렬화되고 서버 RPC가 키 존재를 `?&`로 검사한다(0066·0069·0070·0073).
 *    화면 전용 값은 화면에만 둔다.
 *
 * 순수 함수다. 조회하지 않는다.
 */
export function applyMyWeights(input: {
  /** 친구 설계 (친구 무게가 실려 있다) */
  imported: LocalExercise[];
  /** 종목 이름 → 내 직전 완료 세트. 없는 종목은 키가 없다 */
  myLastByName: ReadonlyMap<string, LocalSet[]>;
}): AppliedCopy {
  const reference: CopyReference[] = [];

  const exercises = input.imported.map((exercise) => {
    if (exercise.exerciseType !== "weight") return exercise;

    const mine = input.myLastByName.get(exercise.name) ?? [];
    const friendWeights = exercise.sets.map((s) => s.weightKg);

    // ③ 친구가 실제로 든 무게가 있을 때만 참고로 남긴다. 0뿐이면 볼 것이 없다.
    if (friendWeights.some((w) => w > 0)) {
      reference.push({
        exerciseKey: exercise.key,
        name: exercise.name,
        weights: friendWeights,
      });
    }

    return {
      ...exercise,
      sets: exercise.sets.map((set, index) => ({
        ...set,
        // ① 같은 순번의 내 무게, 모자라면 내 마지막 세트 무게
        // ② 내 기록이 아예 없으면 0 — 비워 두고 사용자가 넣는다
        weightKg: mine[index]?.weightKg ?? mine.at(-1)?.weightKg ?? 0,
      })),
    };
  });

  return { exercises, reference };
}

/** 참고 줄 문구 — `60 · 60 · 65kg` */
export function referenceLabel(weights: readonly number[]): string {
  const shown = weights.filter((w) => w > 0);
  if (shown.length === 0) return "";
  return `${shown.join(" · ")}kg`;
}
