/**
 * 분석 동의 안내 문구 — **초안, 법적 검토 전.**
 *
 * ⚠️ 문구를 바꾸면 `CONSENT_VERSION`(consent.ts)을 올려 이전 선택을 무효로 만든다.
 *    그래야 바뀐 문구에 대해 다시 동의를 받는다.
 * 원문과 근거: docs/analytics/posthog-privacy-review.md §9
 */
export const CONSENT_COPY = {
  title: "이용 분석에 도움을 주실래요?",
  body: "가입·운동 기록 중 어디서 막히는지 알아보려고, 이름 없는 이용 기록(방문 경로, 가입·운동 완료 여부 등)을 미국의 분석 서비스(PostHog)로 보냅니다. 이메일·닉네임·사진은 보내지 않아요. 거부해도 앱은 똑같이 쓸 수 있고, 계정 화면에서 언제든 끌 수 있어요.",
  accept: "동의",
  decline: "거부",
  detail: "자세히 보기",
  settingTitle: "이용 분석 허용",
  settingOn: "켜져 있어요. 끄면 바로 보내기를 멈춰요.",
  settingOff: "꺼져 있어요. 켜면 이름 없는 이용 기록을 분석에 써요.",
  withdrawNote:
    "이미 보낸 기록의 삭제가 필요하면 개인정보 문의 창구로 요청해 주세요.",
} as const;
