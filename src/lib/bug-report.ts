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
