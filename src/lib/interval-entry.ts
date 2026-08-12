/**
 * 프로그램 화면 → 기록 화면으로 "인터벌을 열어라"를 넘긴다 (2026-08-12 사용자 지시).
 *
 * 왜 필요한가. 전신 인터벌은 사용자 지시로 **'프로그램으로 시작하기' 안**으로
 * 들어갔는데, 인터벌 시트(음원·코스·종목)는 `/record`가 들고 있다. 프로그램
 * 카탈로그는 `/record/programs`라는 **다른 라우트**라 그 시트를 열 수 없다.
 * 그래서 "열어라"만 남기고 `/record`로 보낸 뒤, 기록 화면이 꺼내서 연다.
 *
 * ⚠️ 쿼리스트링(`/record?start=interval`)을 쓰지 않는다. `useSearchParams`가
 *    Suspense 경계를 요구해서 이 앱은 이미 그 길을 피했다 —
 *    `src/app/auth/callback/page.tsx`에 같은 이유가 적혀 있다. 게다가 주소창에
 *    남아 새로고침마다 시트가 다시 열린다.
 *
 * ⚠️ `localStorage`가 아니라 `sessionStorage`다. 탭을 닫으면 사라져야 한다 —
 *    다음에 앱을 열었을 때 인터벌 시트가 뜬금없이 뜨면 안 된다.
 */
const INTERVAL_START_KEY = "gnd-start-interval";

export function requestIntervalStart(): void {
  sessionStorage.setItem(INTERVAL_START_KEY, "1");
}

/** 한 번만 꺼내진다 — 읽는 즉시 지운다 */
export function takeIntervalStart(): boolean {
  const value = sessionStorage.getItem(INTERVAL_START_KEY);
  if (value === null) return false;
  sessionStorage.removeItem(INTERVAL_START_KEY);
  return true;
}
