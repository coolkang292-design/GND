import type { ExerciseType } from "@/lib/types";

/**
 * 0kg으로 완료한 웨이트 세트를 보고 "맨몸이었나요?"를 물을지 판정한다
 * (2026-08-04, 사용자 결정).
 *
 * **왜 묻는가** — 신고 0783ca35. 카탈로그의 '스쿼트'는 `weight`고 맨몸판은
 * '맨몸 스쿼트'라는 다른 이름이라, 맨몸 스쿼트를 하고도 웨이트로 기록하면
 * 챌린지 맨몸 실적이 0인 채로 남는다. 낭만송곳니는 100회를 그렇게 쌓았다.
 *
 * **왜 자동 판정이 아닌가** — "완료 세트가 전부 0kg이면 맨몸"이라는 소급 규칙도
 * 검토했지만 셋 다 틀렸다:
 *   ① 이번 건을 못 고친다 — 챌린지에 잡힌 60회 중 40회가 **1kg** 세션이었다
 *   ② 소급 대상이 0건이다 — 운영 DB의 weight 종목 54행 전부 무게가 실려 있다
 *   ③ 오작동이 구조적이다 — `newSet()`이 `weightKg: 0`으로 시작하므로,
 *      무게를 안 넣고 완료하면 웨이트 실적이 조용히 맨몸으로 옮겨간다
 * 데이터로 의도를 추측하는 대신 **그 자리에서 사람에게 확인**한다. 추측이
 * 아니라 확인이므로 오작동이 없고, 1kg처럼 애매한 것도 사람이 판단한다.
 *
 * 한 종목에 한 번만 묻는다 — 세트마다 물으면 5세트짜리가 다섯 번 뜬다.
 */
export function shouldAskBodyweight(input: {
  exerciseType: ExerciseType;
  weightKg: number;
  reps: number;
  /** 지금 완료로 켜는 중인가 (해제는 묻지 않는다) */
  willDone: boolean;
  /** 이 종목에 대해 이미 물어봤나 */
  alreadyAsked: boolean;
}): boolean {
  if (!input.willDone) return false;
  if (input.alreadyAsked) return false;
  if (input.exerciseType !== "weight") return false;
  if (input.weightKg !== 0) return false;
  // 횟수도 0이면 아직 아무것도 안 적은 빈 세트다 — 물어봐야 답할 게 없다
  return input.reps > 0;
}
