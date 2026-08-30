/**
 * 차단·신고의 순수 규칙 (0089).
 *
 * 왜 도메인으로 뽑았나: 신고 사유 목록과 글자 수 제한이 **DB 제약과 화면 두
 * 곳에** 존재한다. 두 벌이 되면 언젠가 한쪽만 늘어나고, 그때 화면은 사유를
 * 보여주는데 서버가 `invalid_reason`으로 튕긴다. 여기 한 곳을 원천으로 두고
 * 테스트가 DB 제약과 같은 값인지 못 박는다.
 */

/**
 * 신고 사유. **이 목록은 0089의 CHECK 제약과 글자 하나까지 같아야 한다.**
 *   check (reason in ('spam','harassment','inappropriate','fake','other'))
 */
export const REPORT_REASONS = [
  {
    id: "spam",
    label: "도배·광고",
    hint: "같은 글을 반복해서 올리거나 광고를 해요",
  },
  {
    id: "harassment",
    label: "괴롭힘·욕설",
    hint: "불쾌한 말을 하거나 계속 따라다녀요",
  },
  {
    id: "inappropriate",
    label: "부적절한 내용",
    hint: "사진이나 글이 운동과 무관하거나 불쾌해요",
  },
  {
    id: "fake",
    label: "사칭·거짓 기록",
    hint: "다른 사람인 척하거나 기록이 사실이 아니에요",
  },
  { id: "other", label: "그 밖의 문제", hint: "아래에 무슨 일인지 적어 주세요" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

/** 0089의 `length(note) <= 500`과 같은 값이어야 한다. */
export const REPORT_NOTE_MAX = 500;

const REASON_IDS: readonly string[] = REPORT_REASONS.map((r) => r.id);

export function isReportReason(value: string): value is ReportReason {
  return REASON_IDS.includes(value);
}

export type ReportDraftProblem =
  | "reason_missing"
  | "reason_unknown"
  | "note_too_long"
  | "note_required";

/**
 * 보내기 전에 화면에서 거르는 규칙.
 *
 * `other`만 설명을 **요구한다.** 나머지는 라벨 자체가 무슨 일인지 말해 주지만
 * "그 밖의 문제"는 아무것도 말해 주지 않아서, 그대로 받으면 /admin에 사유가
 * `other` 하나만 남은 신고가 쌓인다 — 그걸로는 아무 판단도 못 한다.
 */
export function validateReportDraft(input: {
  reason: string | null;
  note: string;
}): ReportDraftProblem | null {
  if (!input.reason) return "reason_missing";
  if (!isReportReason(input.reason)) return "reason_unknown";
  const note = input.note.trim();
  if (note.length > REPORT_NOTE_MAX) return "note_too_long";
  if (input.reason === "other" && note.length === 0) return "note_required";
  return null;
}

const DRAFT_PROBLEM_MESSAGE: Record<ReportDraftProblem, string> = {
  reason_missing: "무엇이 문제인지 골라 주세요",
  reason_unknown: "알 수 없는 사유예요",
  note_too_long: `설명은 ${REPORT_NOTE_MAX}자까지 쓸 수 있어요`,
  note_required: "무슨 일이 있었는지 적어 주세요",
};

export function reportDraftMessage(problem: ReportDraftProblem): string {
  return DRAFT_PROBLEM_MESSAGE[problem];
}

/**
 * 차단 버튼의 문구·설명.
 *
 * 무엇이 일어나는지 **정확히** 적는다. "차단하시겠어요?"만 띄우면 사용자는
 * 크루 관계가 끊기는지, 상대가 아는지를 모른 채 누른다. 둘 다 아니라는 것이
 * 이 기능의 핵심 성질이라 그 자리에서 말해 준다.
 */
export function blockConfirmCopy(nickname: string): {
  title: string;
  body: string;
  confirm: string;
} {
  return {
    title: `${nickname}님을 차단할까요?`,
    body:
      "서로의 게시물·댓글·응원이 보이지 않게 되고, 크루 신청도 오갈 수 없어요. " +
      "상대에게는 차단 사실이 알려지지 않아요. 크루 관계는 그대로 남아 있어서 " +
      "차단을 풀면 원래대로 돌아와요.",
    confirm: "차단하기",
  };
}
