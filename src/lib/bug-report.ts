import { BUILD_TIME } from "@/lib/build-info";
import { clearTrail, readTrail } from "@/lib/domain/bug-trail";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 신고와 함께 자동으로 실려 가는 환경 정보.
 *
 * **사람에게 묻지 않는다.** 사용자는 비개발자라 "어느 화면에서 무엇을 눌렀는지"를
 * 정확히 적기 어렵고, 브라우저는 그걸 이미 전부 알고 있다. 잘 적으라고 요구하면
 * 신고 자체를 안 하게 된다.
 *
 * **값이 아니라 환경만 담는다.** 운동 기록·닉네임·메모는 넣지 않는다.
 */
export function collectContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = { build: BUILD_TIME };
  try {
    if (typeof navigator !== "undefined") {
      ctx.ua = navigator.userAgent?.slice(0, 300);
      ctx.lang = navigator.language;
      ctx.online = navigator.onLine;
    }
    if (typeof window !== "undefined") {
      ctx.viewport = `${window.innerWidth}x${window.innerHeight}`;
      // 홈 화면에 설치한 앱인지. iOS는 설치본에서만 푸시가 되므로 진단에 쓰인다.
      ctx.standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    }
    ctx.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 환경 수집 실패로 신고가 막히면 안 된다. 있는 것만 보낸다.
  }
  return ctx;
}

/** RPC가 던지는 코드 → 사용자에게 보여줄 한국어. */
function messageForError(raw: string): string {
  if (raw.includes("rate_limited")) {
    return "신고가 너무 빨리 여러 번 접수됐어요. 잠시 후 다시 시도해주세요.";
  }
  if (raw.includes("message_too_short")) return "내용을 조금만 더 적어주세요.";
  if (raw.includes("message_too_long")) return "내용이 너무 길어요. 1000자 안으로 적어주세요.";
  if (raw.includes("not_authenticated")) return "로그인 후 다시 시도해주세요.";
  return "신고를 보내지 못했어요. 잠시 후 다시 시도하거나 카톡으로 알려주세요.";
}

export class BugReportError extends Error {
  constructor(
    message: string,
    /** 원본 코드 — 화면에는 안 띄운다 */
    readonly code: string,
  ) {
    super(message);
    this.name = "BugReportError";
  }
}

/**
 * 신고 접수. 성공하면 신고 id를 돌려주고 흔적 버퍼를 비운다.
 *
 * 흔적을 비우는 이유: 같은 흔적이 다음 신고에 또 실리면 이미 처리한 동작이
 * 새 신고의 원인처럼 보인다.
 *
 * @param route 신고 버튼을 누른 시점의 경로. 호출부가 `usePathname()`으로 넘긴다.
 * @param extraContext 화면이 아는 추가 정보(예: error.tsx가 넘기는 예외 메시지)
 */
export async function submitBugReport(
  message: string,
  route: string | null,
  extraContext?: Record<string, unknown>,
): Promise<string> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.rpc("submit_bug_report", {
    p_message: message,
    p_route: route,
    p_context: { ...collectContext(), ...extraContext },
    p_trail: readTrail(),
  });

  if (error) {
    throw new BugReportError(messageForError(error.message), error.message);
  }

  clearTrail();
  return data as string;
}

/**
 * 계정·데이터 삭제/열람 **요청** 접수 (2026-09-03 외부 파일럿 P0-1).
 *
 * ⚠️ **새 백엔드를 만들지 않는다.** 0052의 `submit_bug_report` RPC를 그대로 탄다 —
 *    그 파이프라인은 이미 ① 인증을 요구하고(누가 요청했는지 확실하다) ② 레이트
 *    리밋과 중복 흡수가 있고 ③ **관리자 폰으로 즉시 푸시**가 간다. 삭제 요청에
 *    필요한 성질이 정확히 그것이라, 별도 테이블을 파는 것은 지킬 것만 늘린다.
 *    운영자는 `scripts/bug-reports.mjs`에서 접두어로 골라낸다.
 *
 * ⚠️⚠️ **오류 신고와 다르게 `trail`(최근 동작)을 보내지 않는다.** 삭제를
 *    요청하는 데 직전 화면 이동 기록은 필요 없고, 개인정보 처리방침이 trail을
 *    **「오류 신고」 항목에서만** 수집한다고 적었다. 여기서 같이 보내면 그 문장이
 *    거짓이 된다. 같은 이유로 `clearTrail()`도 부르지 않는다 — 남의 버퍼를
 *    비워서 다음 진짜 오류 신고의 단서를 지우면 안 된다.
 */
export const ACCOUNT_REQUEST_PREFIX = "[계정·데이터 요청]";

export async function submitAccountRequest(message: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.rpc("submit_bug_report", {
    p_message: `${ACCOUNT_REQUEST_PREFIX} ${message}`,
    p_route: "/account",
    p_context: { kind: "account_data_request", build: BUILD_TIME },
    p_trail: [],
  });

  if (error) {
    throw new BugReportError(messageForError(error.message), error.message);
  }
  return data as string;
}
