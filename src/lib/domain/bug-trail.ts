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

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * **PostgREST에서 HTTP 메서드는 읽기/쓰기를 안 가른다.** Supabase는 읽기 전용
 * 함수도 `POST /rest/v1/rpc/…`로 부른다. 그래서 이름으로 가린다.
 *
 * `get_`은 이 저장소의 조회 RPC 규약이다(`get_my_badge_metrics`,
 * `get_incoming_crew_requests`, `get_challenge_period_sessions` …).
 * `autostart_`·`autofinalize_`는 화면 진입 때 자동으로 미는 것이라 사용자가 한 일이
 * 아니다. `admin_`·`pending_`·`schema_`는 도구·크론 전용이다.
 */
const NOT_A_USER_ACTION =
  /^rpc\/(get_|list_|search_|autostart_|autofinalize_|admin_|pending_|schema_)/;

/**
 * 성공한 요청 중 **사용자가 한 일**로 볼 것을 고른다.
 *
 * **자동으로 잡는 이유.** 설계에는 호출부마다 손으로 `noteTrail("action", …)`을
 * 넣기로 했는데, 실제로 구현할 때 **한 곳도 안 넣었다.** 배포 후 들어온 첫 신고의
 * 흔적이 `nav` 한 줄뿐인 것으로 그게 드러났다. 이 저장소에는 같은 실패가 이미
 * 있다 — `PUSH_URL_BY_TYPE`은 exhaustive가 아니라 "손으로 챙겨야 한다"고 주석까지
 * 달아 뒀지만 그런 것은 결국 빠진다. 팩토리 한 곳에서 자동으로 잡으면 안 빠진다.
 *
 * **첫 판은 "쓰기 메서드면 동작"이었고 그건 틀렸다.** 실제 신고의 흔적이
 * `get_my_badge_metrics`·`autostart_due_challenges`·서명 URL 발급으로 꽉 차서
 * **30칸이 1분치 배경 잡음으로 덮였다.** 노이즈가 신호를 덮으면 흔적은 없느니만
 * 못하다 — 사람이 무엇을 눌렀는지 못 읽는다. 아래 세 겹으로 거른다.
 */
export function isUserAction(method: string, url: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;

  const path = pathOnly(url);

  // ① 인증 — 토큰 갱신은 사용자 동작이 아니다. 로그인 성패는 fail 쪽에서 잡힌다
  if (path.startsWith("auth/")) return false;
  // ② POST로 부르는 조회·자동 실행
  if (NOT_A_USER_ACTION.test(path)) return false;
  // ③ 사진을 보여주려고 URL에 서명하는 것 — 피드를 넘길 때마다 나간다.
  //    같은 storage라도 **업로드**(`/object/<bucket>/…`)는 진짜 동작이라 남긴다
  if (path.includes("/object/sign/")) return false;

  return true;
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
