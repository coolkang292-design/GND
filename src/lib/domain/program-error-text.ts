import { errorText } from "./error-text";

/**
 * 프로그램 등록 실패를 **사용자 문구로 바꾸되 원문을 버리지 않는다** (2026-08-12).
 *
 * 왜 생겼나. `program-schedule-setup.tsx`가 `catch {}`로 오류를 통째로 삼키고
 * "저장하지 못했어요"만 띄웠다. 그래서 연속 3일(금·토·일) 등록이 실패했을 때
 * **서버가 거절한 것인지 클라가 던진 것인지도 알 수 없었다.** 실제 원인은
 * `program_invalid_slots`였고 — RPC에 닿지도 못한 채 클라에서 죽고 있었다.
 *
 * ⚠️ 모르는 오류는 반드시 원문을 붙인다. 문구를 예쁘게 만들려고 원문을 지우면
 *    다음 사람이 같은 자리에서 또 막힌다.
 */
export function programSaveErrorText(error: unknown): string {
  const raw = errorText(error);

  const taken = /program_plan_date_taken:(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (taken) {
    /*
      ⚠️ "요일을 바꿔 주세요"라고 하지 않는다 (2026-09-04에 사장님이 화면에서
         잡았다). 사다리는 **요일을 고르는 화면이 없다** — 날짜를 6일 주기가
         정한다. 고칠 수 없는 것을 고치라고 하면 사용자는 화면을 뒤지다 만다.

      ⚠️ 이 오류 자체가 0102를 Run하면 **영영 안 난다.** 그때부터 프로그램은
         남의 계획이 있는 날에도 나란히 선다. 그렇다고 지우지 마라 — 문구가
         남아 있어야 제약이 되살아났을 때(복구·롤백) 말이 통한다.
    */
    return `${Number(taken[2])}월 ${Number(taken[3])}일에 이미 다른 계획이 있어요. 그 계획을 지우거나 시작일을 바꿔 주세요.`;
  }
  if (raw.includes("program_already_active")) {
    return "이미 진행 중인 프로그램이에요. 기존 프로그램을 마친 뒤에 등록할 수 있어요.";
  }
  if (
    raw.includes("program_invalid_slots") ||
    raw.includes("program_slot_weekday_duplicate") ||
    raw.includes("program_slots_count") ||
    raw.includes("program_invalid_slot")
  ) {
    return "서로 다른 요일 3개를 골라 주세요.";
  }
  if (
    raw.includes("program_plan_date_order") ||
    raw.includes("program_plan_date_duplicate")
  ) {
    return "같은 날에 두 회차를 넣을 수 없어요. 요일을 다시 골라 주세요.";
  }
  if (raw.includes("not_authenticated")) {
    return "로그인이 풀렸어요. 다시 로그인한 뒤 시도해 주세요.";
  }

  const base = "저장하지 못했어요. 일정은 그대로 두었어요.";
  return raw && raw !== "알 수 없는 오류" ? `${base} (${raw})` : base;
}
