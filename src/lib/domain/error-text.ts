/**
 * 오류 객체에서 **사람이 읽을 문자열**을 뽑는다 (2026-08-09).
 *
 * 왜 생겼나. 화면들이 `e instanceof Error ? e.message : String(e)`를 쓰고 있었는데,
 * **Supabase가 던지는 것은 `Error`가 아니다.** `PostgrestError`·`AuthError`는 평범한
 * 객체라 `String(e)`가 `"[object Object]"`가 된다. 그래서 운동 시작이 RLS로 막혔을 때
 * 화면에 뜬 문구가 통째로 이랬다:
 *
 *     오류: [object Object]
 *
 * 사용자에게도 쓸모없고, **버그 신고(`bug_reports`)에도 그대로 실려** 다음 사람이
 * 원인을 못 찾는다. 실제 메시지는 `{ code: "42501", message: "permission denied
 * for table workout_sessions" }`처럼 객체 안에 멀쩡히 들어 있었다.
 *
 * ⚠️ `String(e)`로 되돌리지 마라. `error-text.test.ts`가 그 회귀를 잡는다.
 */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;

  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    // Supabase는 `message`에 본문, `code`에 SQLSTATE, `details`/`hint`에 부연을 준다.
    const parts = [o.message, o.details, o.hint]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      // 같은 말이 두 칸에 들어오는 경우가 있다 — 그대로 이으면 문구가 두 번 나온다.
      .filter((v, i, all) => all.indexOf(v) === i);
    const code = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
    if (parts.length > 0) return `${parts.join(" · ")}${code}`;
    if (code) return code.trim();
  }

  // 여기까지 왔으면 정말로 모르는 모양이다. `[object Object]`보다는 낫게 남긴다.
  try {
    const json = JSON.stringify(e);
    if (json && json !== "{}" && json !== "null") return json;
  } catch {
    // 순환 참조 — 아래로 흘린다
  }

  // ⚠️ 객체에 `String()`을 쓰면 `[object Object]`가 된다 — 이 파일이 막으려는
  //    바로 그것이다. 객체는 여기서 끊는다. (빈 객체·순환 참조가 여기 온다.)
  if (e && typeof e === "object") return "알 수 없는 오류";
  return String(e);
}
