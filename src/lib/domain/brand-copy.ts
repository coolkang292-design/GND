/**
 * GND 브랜드 진입 문구 — **사용자가 확정한 정확한 문자열** (2026-10-06).
 *
 * 출처: `어플 UI 이미지/Performance-Social-2026-10-06-Brand-Entry/copy.json`(Codex 제작)과
 * 그 `CLAUDE-적용지침.md`. 사용자가 마지막에 `더 나은 당신을` → `더 나은 나를`로 교정했다.
 *
 * ⚠️ 시안 이미지에서 글자를 베끼지 마라(OCR 금지 — 지침). 이 파일이 유일한 원천이다.
 * ⚠️ 문구를 사진에 굳히지 않는다. 시작 화면·온보딩이 이 문자열을 **실제 글자**로 그린다 —
 *    2026-10-06 이전 시작 화면은 글자가 박힌 통짜 이미지라 교정본을 반영할 수 없었다.
 */
export const BRAND_ENTRY_COPY = {
  wordmarkSub: "PERFORMANCE SOCIAL",
  slogan: ["BETTER", "PEOPLE", "HIGHER", "TOGETHER"],
  /** 마지막 줄만 라임 */
  headline: ["의지가 꺾인 날에도", "계속한 사람이", "결국 이긴다"],
  subcopy: ["혼자서도, 함께여서 더 멀리.", "친구들과의 기록이 더 나은 나를 만든다."],
} as const;

/**
 * 온보딩 첫 화면(제공자 버튼) 문구 — 같은 패키지 `copy.json`의 `onboarding`.
 * 시안 원본: `original-extracts/onboarding-original-approved.png`(지침 "온보딩: 1번 원본").
 * ⚠️ 버튼 글자는 `PROVIDER_META[p].short` + 이 접미사로 만든다 — 제공자 목록은 플래그가 정한다.
 */
export const ONBOARDING_COPY = {
  /** 둘째 줄만 라임 */
  headline: ["지금 이 도전이", "더 나은 나를 만든다"],
  subcopy: ["혼자가 아닌, 함께라서 더 멀리.", "GND와 함께 더 나은 당신의 하루를 시작하세요."],
  providerSuffix: "로 시작하기",
  haveAccount: "이미 계정이 있나요?",
  login: "로그인",
} as const;

/**
 * 로그인 화면 문구 — `copy.json`의 `login`. 시안: `original-extracts/login-original-approved.png`
 * ⚠️ 제목·부제는 사용자가 2026-10-06에 새 시안으로 교정했다 — `돌아오셨군요!` → `돌아오셨군요`,
 *    `오늘도, 더 나은…` → `오늘도 더 나은…`(느낌표·쉼표 없음). `copy.json`보다 이쪽이 맞다.
 */
export const LOGIN_COPY = {
  heading: "돌아오셨군요",
  subcopy: "오늘도 더 나은 내가 되는 하루",
  providerSuffix: "로 계속하기",
  divider: "또는 이메일로 로그인",
  emailPlaceholder: "이메일을 입력하세요",
  passwordPlaceholder: "비밀번호를 입력하세요",
  primary: "로그인",
  signupLead: "처음이신가요?",
  signup: "회원가입하기",
} as const;
