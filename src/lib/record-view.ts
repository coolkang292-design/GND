/**
 * 기록 화면을 **달력 탭으로** 열어 달라는 일회성 요청 (사용자 지시 2026-08-12).
 *
 * 왜. 프로그램 등록을 마치면 `달력에서 계획 확인하기`가 `/record`로 보내는데,
 * 기록 화면은 항상 `운동` 탭으로 열린다. 방금 담은 18회를 보러 가는 길인데
 * 달력이 아닌 곳에 떨어진다.
 *
 * ⚠️ 쿼리스트링을 쓰지 않는다. `useSearchParams`가 Suspense 경계를 요구해서 이
 *    앱은 이미 그 길을 피했다(`src/app/auth/callback/page.tsx`). 주소에 남으면
 *    새로고침마다 달력으로 튀는 것도 원하지 않는다.
 *
 * ⚠️ `sessionStorage`도 쓰지 않는다. 모듈 변수면 **렌더 중에 읽을 수 있어서**
 *    `useState` 초기값으로 바로 쓸 수 있다. 이펙트로 탭을 바꾸면 운동 탭이
 *    한 번 그려졌다가 달력으로 튄다.
 *
 * 서버 렌더에서는 항상 `false`다(모듈이 요청마다 새로 평가된다). 클라이언트
 * 이동일 때만 참이 되므로 hydration 불일치가 없다. 새로고침하면 사라진다 —
 * 그게 맞다. 한 번 보러 가는 요청이지 상태가 아니다.
 */
let pendingCalendarView = false;

export function requestCalendarView(): void {
  pendingCalendarView = true;
}

/** 한 번만 꺼내진다 — 읽는 즉시 지운다 */
export function takeCalendarView(): boolean {
  const requested = pendingCalendarView;
  pendingCalendarView = false;
  return requested;
}
