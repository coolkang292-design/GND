/**
 * 기록 화면의 하단 고정 막대 배치 (2026-08-09).
 *
 * **왜 상수로 뺐나.** 휴식 바와 "다시 열기" 복귀 버튼이 각자 자기 파일에
 * `bottom: calc(env(safe-area-inset-bottom) + 72px)`를 적어 두고 있었고,
 * 둘 다 **접었을 때만** 뜬다. 즉 휴식 중에 오버레이를 접으면 z가 높은 휴식
 * 바(z-30)가 복귀 버튼(z-20)을 통째로 덮어 **오버레이로 영영 못 돌아갔다**
 * (사용자 신고 "실 서버에 접어 두기 기능 작동 안함").
 *
 * 같은 사실이 두 파일에 흩어져 있으면 이런 겹침은 코드로 증명할 수 없다.
 * 여기 모아 두면 `floating-bars.test.ts`가 "둘은 겹치지 않는다"를 단언할 수 있다.
 *
 * ⚠️ 값을 고칠 때는 **테스트를 먼저 보라.** 겹침 단언이 실패하면 화면에서
 * 하나가 사라진다는 뜻이다.
 */

/** 탭 바 높이 — 하단 고정 요소의 기준선 */
export const TAB_BAR_HEIGHT_PX = 72;

/** 고정 막대 하나의 대략 높이 (테두리·그림자 포함, 실측 기준 여유값) */
export const FLOATING_BAR_HEIGHT_PX = 60;

/** 휴식 바 — 탭 바 바로 위 */
export const REST_BAR = {
  bottomPx: TAB_BAR_HEIGHT_PX,
  z: 30,
} as const;

/**
 * 접었을 때 돌아갈 문 — 휴식 바 **위**에 얹는다.
 *
 * 휴식 바를 숨기고 여기에 두는 선택지도 있었지만, 그러면 접은 동안 남은 휴식
 * 시간을 볼 수단이 없어진다. 둘 다 보이는 쪽이 맞다.
 */
export const MINIMIZED_BAR = {
  bottomPx: TAB_BAR_HEIGHT_PX + FLOATING_BAR_HEIGHT_PX,
  z: REST_BAR.z + 10,
} as const;

/** `bottom` 인라인 스타일 값 — 홈 인디케이터(safe area)를 피한다 */
export function bottomOffset(px: number): string {
  return `calc(env(safe-area-inset-bottom) + ${px}px)`;
}

export type FloatingBar = { bottomPx: number; z: number };

/**
 * 두 막대가 **서로 가리는가.** 세로 구간이 겹치는데 z가 다르면 위엣것이 아랫것을
 * 덮는다 — 둘 다 동시에 떠야 하는 사이라면 그건 버그다.
 */
export function barsOverlap(
  a: FloatingBar,
  b: FloatingBar,
  heightPx = FLOATING_BAR_HEIGHT_PX,
): boolean {
  const aTop = a.bottomPx + heightPx;
  const bTop = b.bottomPx + heightPx;
  return a.bottomPx < bTop && b.bottomPx < aTop;
}
