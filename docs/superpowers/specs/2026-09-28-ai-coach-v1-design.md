# GND AI 코치 V1 — 운동 직후 피드백 설계

> 확정일: 2026-09-28
> 원 명령문: 사용자 제공 "GND AI Coach V1" (운동 후 AI 피드백 + 개인화 추천 기반)
> 상태: 설계 확정, 구현 중

## 1. 한 줄

운동을 마치면 **코드가 지난 기록과 비교해 숫자와 판정을 계산**하고, AI는 그 판정을
**짧은 한국어 코칭 문장으로 바꾸기만** 한다. 운동 완료·XP·배지는 AI와 무관하게 끝난다.

## 2. 사용자 결정 (2026-09-28)

| 결정 | 선택 | 이유 |
|---|---|---|
| AI 제공사 | **DeepSeek** (`deepseek-flash`) | 사용자 지시: "CLI 모델 확인 후 안 되면 DeepSeek". CLI(claude 2.1.280·codex 0.156)는 기술적으로 가능하나 Vercel이 PC CLI를 부를 수 없어 PC 폴링 워커뿐 → PC가 꺼지면 수 시간 지연, 개인 개발 사용 한도와 공유, 구독 약관 소지. 운영 불가로 판정 |
| 실행 위치 | **Next.js API 라우트** (`/api/workout-feedback`) | Edge Function은 저장소에 0개. 배포·시크릿·테스트 경로가 하나로 유지된다 |
| 세트 타이밍 | **완료 시각만 자동 기록** | 한 탭 기록 흐름 유지. 순수 수행시간(템포)은 V1에서 재지 않는다 |

## 3. 조사에서 나온 제약 (명령문 가정과 다른 것)

1. **`workout_sets.completed_at`은 쓸 수 없다.** 트리거가 서버 시각으로 덮어쓰고, 세트는
   운동 종료 때 `saveSessionExercises`가 **전부 지우고 한 번에** 넣는다 → 모든 세트가 종료 시각.
   그래서 기기가 잰 `client_completed_at`을 새로 둔다. 신뢰도 판정(valid/suspect/missing) 필수.
2. **세트·세션은 크루가 읽는다** (`sets_select_own_or_crew`). 통증·체감·AI 결과는 절대
   거기 두지 않고 본인 전용 새 테이블에 둔다.
3. `workout_sets` 쓰기는 **컬럼 단위 grant**다(0004·0067). 새 컬럼도 grant가 있어야 저장된다.
   ⚠️ 마이그레이션 없이 앱이 먼저 나가면 **운동 종료 저장이 깨진다** → 저장 함수가
   컬럼 없음 오류일 때 그 칸만 빼고 한 번 재시도한다(`toSetRows` 주석).
4. `analytics_events`는 **(사용자, 이벤트)당 평생 1행**이다. 생성 성공률·열람률은 여기서
   못 잰다 → `workout_ai_feedback`의 `status`·`generated_at`·`viewed_at`,
   `workout_session_feedback` 행 존재로 잰다. 여기엔 `ai_coach_onboarding_started`만 더한다
   (완료는 `training_profiles.created_at`이 안다 — 0093 원칙).
5. 종목에 안정적 ID가 없다(`exercise_name` 자유 텍스트). V1은 공백·대소문자만 정규화해 비교한다.
   `DB Shoulder Press` 같은 별칭은 V1 범위 밖이다. 과거 데이터는 바꾸지 않는다.
6. 기존 체감(`effort_feedback`)은 3단계·프로그램 첫/마지막 세트뿐이다. 세션 체감 5단계는
   `too_light · light · on_target · heavy · too_heavy`로 기존 이름을 **확장**한다.

## 4. 흐름

```
운동 완료 → complete_workout_v2 (무변경) → 기존 완료 화면 즉시
                                              ↓
                  AI 코치 카드: 오늘의 성과(계산값, 즉시)
                    ├ 목표 프로필 없음 → 목표 설정 시트 (6문항 칩)
                    ├ 오늘 체감 5단계 + 칩(통증·컨디션·시간 부족·기구) — 한 탭이 분석 시작
                    └ POST /api/workout-feedback {sessionId}
                         1 로그인 확인 · 2 UUID · 3 세션 소유(user_id 직접 대조 — RLS는 크루도 읽힘)
                         4 기존 행: completed면 그대로 반환 / pending 90초 내면 대기 / failed 3회면 중단
                         5 프로필 · 6 행 선점(insert·조건부 update로 중복 방지)
                         7 분석 엔진(코드) → 8 DeepSeek(JSON) → 9 앱 검증·교정 → 10 저장
```

## 5. 역할 분리

| 코드(결정적) | AI(문장) |
|---|---|
| 볼륨·반복·세트 간격·신뢰도·기준선·진행/피로 판정·다음 행동 후보 | 판정을 요약·잘한 점·주의·다음 행동 문장으로 |
| 통증·컨디션 신고 시 증량 후보 차단 | 차단을 뒤집을 수 없다(검증기가 교정) |
| `primary_result.type` 확정 | 다르게 말하면 검증기가 코드 값으로 덮는다 |

AI에게 보내는 것: 목표·경험·우선 부위, 세션 요약, 종목별 현재/직전 수치와 판정, 체감, 통증 **여부**.
보내지 않는 것: 이름·닉네임·이메일·user id·세션 id·통증 부위·메모.

## 6. 테이블 (0112)

- `workout_sets.client_completed_at` — 기기 시각. 분석용 보조 신호
- `training_profiles` — 본인 select·insert·update (invoker RLS)
- `workout_session_feedback` — 본인 + **완료된 본인 세션**에만 insert·update
- `workout_ai_feedback` — 본인 select만. 쓰기는 서버(service role)만
- `analytics_events` 허용목록에 `ai_coach_onboarding_started` 추가 (넓히기만)

## 7. V1 범위 밖

계획 자동 수정(“다음 운동에 적용” 버튼 포함), 세트 시작 버튼·템포, 종목 별칭 표,
과거 기록 화면의 AI 카드, 웨어러블·HRV·영상.
