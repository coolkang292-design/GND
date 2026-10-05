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
