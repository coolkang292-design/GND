/**
 * 유산소 종목을 **무엇으로 재는가** 가른다 (사용자 지시 2026-11-11 "사이클을 거리가 아니라 시간으로,
 * 다른 유산소까지 한 번에 정리").
 *
 * 왜 필요한가 — 목표가 "내 목표 대비 %"라서 같은 km라도 걷기·달리기·사이클은 **같은 노력이 아니다**.
 * 사이클 16km는 40분인데 걷기 16km는 3시간이다. 같은 `유산소 거리` 목표에 섞으면 사이클로 거리 목표를
 * 빨리 채울 수 있다(낭만송곳니 11/3~10: 걷기 18.8km + 사이클 16km → 45km 목표 77.3%, 걷기만 41.8%).
 *
 *   distance — 걷기·러닝·트레드밀: **거리**로 잰다
 *   cycle    — 사이클·실내자전거: **시간**으로 잰다(`cycle_time` 목표)
 *   other    — 로잉·줄넘기·요가·그 밖: **시간**으로 잰다(거리로 비교할 수 없다)
 *
 * ⚠️ 운동 기록(`workout_exercises`)에는 종목 **이름**만 남는다(카탈로그 id가 없다). 그래서 이름으로
 *    가른다. 사용자가 만든 종목이 이 목록에 안 걸리면 `other`(시간)로 떨어진다 — 거리 목표를 부풀리는
 *    쪽으로는 절대 새지 않는 방향이다. 새 종목을 거리형으로 인정하려면 여기에 추가하라.
 * ⚠️ 이 함수는 순수하다. 집계(`foldPeriodStats`)와 목표 설정 화면이 **같은 것을 본다**.
 */
export type CardioKind = "distance" | "cycle" | "other";

const CYCLE = /사이클|싸이클|자전거|바이크|스피닝|cycl|bike|spin/i;
const DISTANCE =
  /걷기|걷|워킹|러닝|런닝|달리기|조깅|트레드밀|walk|run|jog|treadmill/i;

export function cardioKindOf(exerciseName: string): CardioKind {
  const name = exerciseName.trim();
  // 사이클이 먼저다 — "실내 러닝 바이크" 같은 이름에서 거리형으로 새지 않게
  if (CYCLE.test(name)) return "cycle";
  if (DISTANCE.test(name)) return "distance";
  return "other";
}
