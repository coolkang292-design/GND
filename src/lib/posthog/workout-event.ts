/**
 * `workout_completed` — 운동을 **끝낸 순간** PostHog에 복제한다.
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
    let index: number | null = null;
    try {
      const supabase = getSupabaseBrowserClient();
      const { count, error } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.userId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("completed_at", "is", null);
      if (!error && typeof count === "number" && count >= 1) index = count;
    } catch {
      // 횟수를 못 세도 이벤트는 보낸다
    }

    trackProduct(
      "workout_completed",
      {
        ...(index !== null ? { workout_index: index, is_first: index === 1 } : {}),
        exercise_count: input.exerciseCount,
        duration_bucket: durationBucket(input.durationMinutes),
        has_photo: input.photoCount > 0,
      },
      {
        userId: input.userId,
        dedupe: { key: `workout_completed:${input.sessionId}`, scope: "persistent" },
      },
    );
  } catch {
    // 분석이 운동 완료를 막으면 안 된다
  }
}
