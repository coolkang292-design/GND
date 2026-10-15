/**
 * `workout_started` / `workout_completed` — 운동을 **시작한 순간·끝낸 순간** PostHog에 복제한다.
 *
 * ⛔ 원본은 `workout_sessions`다. 여기서 보내는 것은 탐색용 복제본이고, 숫자가 다르면 DB가 맞다.
 *
 * 보내는 것: 첫 운동 여부, 몇 번째인지, 종목 **수**, 시간 **구간**, 사진 유무.
 * 보내지 않는 것: 종목 이름·무게·세트·메모·캡션·사진·세션 id.
 *
 * ⚠️ 동의가 없으면 **DB 조회도 하지 않는다** (`isTrackingAllowed`가 먼저 막는다).
 * ⚠️ 이미 완료된 세션을 다시 닫은 경우(`idempotentReplay`)는 새 운동이 아니므로 보내지 않는다.
 * ⚠️ 세션 id는 **기기 안의 중복 방지 키로만** 쓰고 전송 속성에는 넣지 않는다.
 * ⚠️ 어떤 경우에도 던지지 않고, 호출한 쪽(완료 흐름)을 기다리게 하지 않는다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { durationBucket } from "./events";
import { isTrackingAllowed } from "./client";
import { trackProduct } from "./track";

/** 이 사용자의 완료한 운동 수. 못 세면 null — 그때는 `is_first`·`workout_index`를 빼고 보낸다. */
async function countCompleted(userId: string): Promise<number | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { count, error } = await supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .not("completed_at", "is", null);
    if (!error && typeof count === "number" && count >= 0) return count;
  } catch {
    // 횟수를 못 세도 이벤트는 보낸다
  }
  return null;
}

/**
 * 중복 방지 키. **첫 운동은 사용자당 한 번**, 그 밖은 세션당 한 번.
 *
 * 왜 첫 운동만 사용자 키인가: 첫 운동을 시작했다가 지우고 다시 시작하면 DB상으로는 여전히
 * "완료 0회"라 `is_first=true`가 또 나온다. 그러면 PostHog의 "첫 운동 시작" 건수가
 * 사람 수보다 커진다. 그래서 `is_first=true`는 이 기기에서 한 번만 보낸다(두 번째는 버린다 —
 * `is_first=false`로 바꿔 보내면 그것도 거짓이다).
 */
function dedupeKey(
  event: "workout_started" | "workout_completed",
  userId: string,
  sessionId: string,
  isFirst: boolean | null,
): string {
  return isFirst === true ? `${event}:first:${userId}` : `${event}:${sessionId}`;
}

export interface WorkoutStartedInput {
  userId: string;
  sessionId: string;
}

/**
 * 운동 시작(`start_workout` 성공 직후).
 *
 * `workout_index` = 완료한 운동 수 + 1 = "이번이 몇 번째 운동인가".
 * 이 운동을 끝내면 `workout_completed.workout_index`가 같은 숫자가 된다 — 두 이벤트를 짝지어
 * 시작→완료 이탈을 볼 수 있다. `is_first` = 완료한 운동이 아직 0개.
 */
export async function reportWorkoutStarted(input: WorkoutStartedInput): Promise<void> {
  try {
    if (!isTrackingAllowed(input.userId)) return;
    const done = await countCompleted(input.userId);
    const index = done === null ? null : done + 1;
    const isFirst = index === null ? null : index === 1;
    trackProduct(
      "workout_started",
      index !== null ? { workout_index: index, is_first: isFirst } : {},
      {
        userId: input.userId,
        dedupe: {
          key: dedupeKey("workout_started", input.userId, input.sessionId, isFirst),
          scope: "persistent",
        },
      },
    );
  } catch {
    // 분석이 운동 시작을 막으면 안 된다
  }
}

export interface WorkoutCompletedInput {
  userId: string;
  sessionId: string;
  exerciseCount: number;
  durationMinutes: number | null;
  photoCount: number;
  /** `finishWorkout`가 이미 완료된 세션을 조용히 돌려준 경우 */
  replay: boolean;
}

export async function reportWorkoutCompleted(input: WorkoutCompletedInput): Promise<void> {
  try {
    if (input.replay) return;
    if (!isTrackingAllowed(input.userId)) return;

    // 방금 끝낸 것을 포함한 완료 횟수. 실패하면 이 두 속성만 빼고 보낸다.
    const done = await countCompleted(input.userId);
    const index = done !== null && done >= 1 ? done : null;
    const isFirst = index === null ? null : index === 1;

    trackProduct(
      "workout_completed",
      {
        ...(index !== null ? { workout_index: index, is_first: isFirst } : {}),
        exercise_count: input.exerciseCount,
        duration_bucket: durationBucket(input.durationMinutes),
        has_photo: input.photoCount > 0,
      },
      {
        userId: input.userId,
        dedupe: {
          key: dedupeKey("workout_completed", input.userId, input.sessionId, isFirst),
          scope: "persistent",
        },
      },
    );
  } catch {
    // 분석이 운동 완료를 막으면 안 된다
  }
}
