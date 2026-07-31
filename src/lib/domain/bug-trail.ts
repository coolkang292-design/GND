/**
 * 동작 흔적(trail) — 신고 시점에 "무엇을 하다가 그랬는지"를 재구성하기 위한 링버퍼.
 *
 * **왜 스택 트레이스가 아니라 이것인가.** 이 앱에서 실제로 난 사고는 예외가 아니라
 * **화면이 틀린 것**이 압도적이다 — 0044 챌린지 3중복, 7/31 초대 링크 두 화면,
 * 7/29~30 배포 누락. 셋 다 예외가 하나도 안 났으므로 예외 추적 도구로는 못 잡는다.
 * 게다가 프로덕션 번들은 minify라 스택이 `chunk-abc.js:1:24580`이라 읽을 수도 없다.
 * 사람이 신고할 때 **직전 동작 목록**이 함께 오면 재현 경로가 즉시 좁혀진다.
 *
 * 규칙 세 가지 — 어기면 개인정보가 샌다.
 *  1. **메모리에만 산다.** localStorage에 쓰지 않고, 신고할 때만 전송된다
 *  2. **값이 아니라 이름만 담는다.** 닉네임·메모·토큰·쿼리스트링 값은 넣지 않는다
 *  3. **최신이 앞(index 0).** 서버 `submit_bug_report`가 앞에서부터 30개를 남긴다 —
 *     순서를 뒤집으면 가장 중요한 직전 동작이 잘려 나간다
 */

export type TrailKind =
  /** 화면 이동 */
  | "nav"
  /** 사용자가 명시적으로 한 것 (버튼·제출) */
  | "action"
  /** 실패 (DB 응답 4xx·5xx, 네트워크 끊김, 던져진 예외) */
  | "fail";

export interface TrailEntry {
  /** ISO 8601 */
  t: string;
  kind: TrailKind;
  label: string;
  detail?: string;
}

/** 서버(0052)가 자르는 개수와 같아야 한다. 더 담아 봐야 버려진다. */
export const TRAIL_MAX = 30;
/** 한 항목의 detail 길이 상한 */
export const TRAIL_DETAIL_MAX = 200;

/** 최신이 앞. 모듈 수명 동안만 산다. */
let entries: TrailEntry[] = [];

/**
 * 흔적 한 줄 추가. **어떤 경우에도 던지지 않는다** — 계측이 앱을 죽이면 안 된다.
 */
export function noteTrail(
  kind: TrailKind,
  label: string,
  detail?: string,
  now: Date = new Date(),
): void {
  try {
    const clean = String(label ?? "").slice(0, TRAIL_DETAIL_MAX);
    if (!clean) return;

    const entry: TrailEntry = { t: now.toISOString(), kind, label: clean };
    if (detail != null && String(detail) !== "") {
      entry.detail = String(detail).slice(0, TRAIL_DETAIL_MAX);
    }

    entries.unshift(entry);
    if (entries.length > TRAIL_MAX) entries.length = TRAIL_MAX;
  } catch {
    // 계측 실패는 조용히 넘긴다.
  }
}

/** 최신순 복사본. 호출자가 배열을 바꿔도 버퍼는 안 바뀐다. */
export function readTrail(): TrailEntry[] {
  return entries.map((e) => ({ ...e }));
}

/** 테스트·신고 완료 후 초기화 */
export function clearTrail(): void {
  entries = [];
}

/**
 * 성공한 요청 중 **사용자가 한 일**로 볼 것을 고른다.
 *
 * 규칙은 하나다 — **쓰기(POST·PATCH·PUT·DELETE)만 동작으로 본다.** 읽기(GET)는
 * 화면을 열 때마다 수십 건이 나가서 30칸짜리 버퍼를 즉시 덮어쓴다. 쓰기는
 * 사용자가 무언가를 눌렀다는 뜻이고 그 수가 적다.
 *
 * **자동으로 잡는 이유.** 설계에는 호출부마다 손으로 `noteTrail("action", …)`을
 * 넣기로 했는데, 실제로 구현할 때 **한 곳도 안 넣었다.** 배포 후 들어온 첫 신고의
 * 흔적이 `nav` 한 줄뿐인 것으로 그게 드러났다. 이 저장소에는 같은 실패가 이미
 * 있다 — `PUSH_URL_BY_TYPE`은 exhaustive가 아니라 "손으로 챙겨야 한다"고 주석까지
 * 달아 뒀지만 그런 것은 결국 빠진다. 팩토리 한 곳에서 자동으로 잡으면 안 빠진다.
 *
 * auth는 뺀다 — 토큰 갱신이 사용자 동작이 아니고, 로그인 성패는 실패 쪽에서 잡힌다.
 */
export function isUserAction(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (m !== "POST" && m !== "PATCH" && m !== "PUT" && m !== "DELETE") return false;
  try {
    return !new URL(url, "http://x").pathname.startsWith("/auth/");
  } catch {
    return false;
  }
}

/**
 * URL에서 **경로만** 뽑는다. 쿼리스트링은 통째로 버린다 —
 * 거기에 닉네임·uuid·초대코드가 들어간다(`?nickname=eq.스칼레또`).
 * 실패해도 던지지 않는다.
 */
export function pathOnly(url: string): string {
  try {
    const u = new URL(url, "http://x");
    // Supabase REST는 경로가 길다. 의미 있는 뒤쪽만 남긴다.
    return u.pathname
      .replace(/^\/rest\/v1\//, "")
      .replace(/^\/auth\/v1\//, "auth/")
      .slice(0, TRAIL_DETAIL_MAX);
  } catch {
    return "?";
  }
}
