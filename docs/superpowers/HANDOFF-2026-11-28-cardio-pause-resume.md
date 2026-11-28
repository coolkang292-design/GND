# 인수인계 — 유산소 멈춤·이어서 재기·휴식 중 몰래 시작 (2026-11-28)

## 상태
- 운영 배포 완료: `c20bacd` (`/api/version` commitSource=archive). GitHub `main` 푸시 완료.
- DB 변경 없음. 업데이트 공지(`pnpm release:notify`) 발송 안 함.

## 바뀐 것
| 무엇 | 어디 |
|---|---|
| 유산소 카드 `⏸ 일시정지`(전체 일시정지 `pauseManually`와 같은 함수) + `■ 시간 확정` | `src/components/record/active-session-overlay.tsx` `SetTimerCard` |
| 굳힌 세트는 잰 초에 이어서 셈 | `set-timer.ts` `measuredBaseSeconds`·`timedMeasureKey`, `setTimerSeconds({ baseSeconds })` |
| 굳힌 세트 표시 | draft `timedMeasuredKeys` (`src/lib/workout.ts`, 버전 안 올림 — 선택 칸) |
| 새로고침 뒤에도 이어서 | `set-timer-restore.ts` `baseSeconds` |
| 휴식 중 자동 시작 금지 | `session-flow.ts` `cardioAutoStartReady` (`resting` 조건) |
| 이어서 잴 때 목표·비프 없음 | `record/page.tsx` `startFocusedTimer`, `timerTargetSeconds` |

## 원인 요약
1. `■ 정지` = 기록 확정이었다. 다시 재면 시작 시각을 새로 적어 앞 기록을 덮어씀. 전체 시간과 무관.
2. `toggleDone`에서 `advanceSetFocus`가 휴식보다 먼저라 초점이 트레드밀로 넘어간 채 휴식이 돈다. 자동 시작 조건에 휴식이 없어서 휴식 5초째에 시계가 켜졌다.

## 확인한 것 (개발 :3044, 픽스처 A)
- 30초 휴식 내내 시계 카드 없음·자동 시작 키 0 → 휴식 끝 "4초 뒤 자동 시작" → 00:00부터.
- 20초 확정 → `▶ 이어서 재기` 6초 → 26초 저장. 이어서 잴 때 "목표 달성" 안 뜸.
- 일시정지 중 시계 00:29 고정, 그 상태로 확정 → 29초(정지 시간 제외).
- 시험 세션 `485b085e…`·`73f17745…` 둘 다 cancelled.

## 남은 위험 / [미검증]
- 휴식 화면의 `다음 운동 시작`(휴식 건너뛰기) 경로 — `stopRest`로 `restRemaining`이 null이 되면 같은 규칙으로 5초 뒤 시작해야 한다. 화면에서 따로 누르지 않았다.
- 실제 아이폰에서 화면을 끈 채 휴식 → 복귀.
- 시간 확정 후 사람이 분·초 칸을 고친 뒤 이어서 재면 **고친 값**에 더한다(의도). 계획 목표만 있는(잰 적 없는) 세트는 0부터.

## 다음 할 일
- 사장님 폰에서 트레드밀로 한 번 실사용 후 기록(시간) 확인.
