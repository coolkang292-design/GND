import { errorText } from "./error-text";

/**
 * 계획 저장 실패를 사람 말로 (2026-09-04).
 *
 * 이 파일이 있는 이유는 **배포 순서** 하나 때문이다. 앱은 0101(같은 날 여러
 * 계획)보다 **먼저** 배포된다 — 반대로 하면 지금 운영 중인 앱의 upsert가
 * `onConflict` 대상을 잃고 통째로 죽는다. 그 사이 짧은 동안, 새 앱은 같은 날
 * 두 번째 계획을 만들려 하는데 DB에는 아직 `unique (user_id, plan_date)`가
 * 살아 있다.
 *
 * 그때 화면에 "저장하지 못했어요"만 뜨면 사용자는 자기 잘못인 줄 알고,
 * 다음 사람은 로그를 봐도 원인을 못 찾는다. **잠깐이라는 사실을 문구가 말하게**
 * 한다.
 *
 * ⚠️ 0101을 Run한 뒤에는 이 분기가 영영 안 걸린다. 그렇다고 지우지 마라 —
 *    제약이 되살아나면(복구·롤백) 다시 이 길로 온다.
 */
const DEFAULT_TEXT = "운동 계획을 저장하지 못했어요";

/** 하루 1계획 제약에 걸렸는가. 코드(23505)나 제약 이름으로만 판별한다 */
function isOnePlanPerDayViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object"
      ? (error as Record<string, unknown>).code
      : undefined;
  if (code === "23505") return true;
  // 코드가 안 실려 오는 경로도 있다. 그때는 **제약 이름**으로만 잡는다 —
  // "unique"라는 낱말로 잡으면 상관없는 오류까지 이 문구로 덮인다
  return errorText(error).includes("workout_plans_user_id_plan_date_key");
}

export function planSaveErrorText(
  error: unknown,
  fallback: string = DEFAULT_TEXT,
): string {
  if (isOnePlanPerDayViolation(error)) {
    return "그날은 아직 계획을 하나만 담을 수 있어요. 잠시 뒤 다시 시도해 주세요.";
  }
  // `move_workout_plan`이 0101 적용 전에 던지는 것 (같은 이유의 다른 통로)
  if (errorText(error).includes("plan_date_taken")) {
    return "그 날짜에 이미 계획이 있어요.";
  }
  return fallback;
}
