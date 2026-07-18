# 운동 일지 텍스트 공유 — 설계 (2026-07-18)

사용자 요청: 그날 운동 기록을 텍스트로 공유/복사해 AI 코치에게 붙여넣어 질문할 수 있게.
형식은 사용자가 제시한 예시 그대로:

```
2026-07-10 운동 일지

인클라인 벤치프레스 머신
1세트: 35kg 12회
2세트: 35kg 12회
```

## 구성

1. **`lib/domain/workout-log.ts`** (순수 함수, TDD) — `formatWorkoutLog(dayKey, exercises)`.
   - 제목 `{dayKey} 운동 일지`, 종목 사이 빈 줄.
   - **완료(done) 세트만** 포함(볼륨 원칙과 동일), 필터 후 1..n 재번호.
   - 완료 세트가 없는 종목은 생략. 종목이 하나도 없으면 제목만 반환(UI에서 빈 날은 버튼 미노출).
   - 유형별 줄 형식: 웨이트 `n세트: {kg}kg {회}회` · 맨몸(reps) `n세트: {회}회` ·
     맨몸(time) `n세트: {분}분` · 유산소 `n세트: {km}km {분}분`(0인 항목 생략, 둘 다 0이면 `0분`).
   - 소수 중량은 그대로(2.5kg), 정수는 소수점 없이(35kg).
2. **`lib/share.ts`** — `shareOrCopyText(text)`: `navigator.share`(모바일 공유 시트, 취소는 조용히)
   → `navigator.clipboard` → textarea+execCommand 폴백(http+IP 비보안 컨텍스트, 교훈 5).
   반환 `"shared" | "canceled" | "copied" | "failed"` — copied면 "복사했어요" 토스트.
3. **`lib/workout.ts getSessionLogExercises(sessionId)`** — 종목+세트 조회, `is_completed`→done 매핑.
   (기존 `getSessionExerciseStructure`는 복사용이라 done을 초기화함 — 공유용은 별도 매핑)
4. **UI 버튼 2곳**:
   - 달력 날짜 상세 시트: "📤 공유" — 그날 모든 완료 세션의 종목을 순서대로 합쳐 하나의 일지로.
   - 운동 완료 화면: "📤 운동 일지 공유" — `handleFinish`에서 draft 지우기 전에 텍스트를
     만들어 result에 보관(완료 후 draft가 비워지므로).

## 하지 않는 것

- 이미지/카드 형태 공유(텍스트만) · 피드 내 공유 · 요약(시간·볼륨) 줄 추가(예시 형식 유지)

## 검증

- 포매터 TDD ~10케이스(유형별·필터·재번호·빈 입력·소수 중량)
- lint·typecheck·기존 unit 통과, 폰에서 공유 시트/복사 확인
