# 휴식 타이머 정확도 · 완료 기록 불러오기 · 무동작 카운팅 정지 — 설계

작성 2026-08-01. 사용자 요청 3건을 한 배포로 묶는다.

1. 휴식 타이머가 다른 앱 사용 중에 멈추고, 돌아와도 비프음이 안 들린다 (+ 음량 2배, 10초 비프 추가)
2. '이전 기록 불러오기'가 계획한 세트까지 가져온다 — 완료한 세트만 가져와야 한다
3. 웨이트 운동 중 일정 시간 무동작이면 운동 시간 카운팅을 멈추고 재개/종료를 묻는다

---

## 1. 휴식 타이머 — 벽시계 기준 전환

### 현재 동작과 문제

[`src/hooks/use-rest-countdown.ts`](../../../src/hooks/use-rest-countdown.ts)는 `setTimeout(…, 1000)`을
1초씩 이어 붙이며 `remainingSeconds`를 하나씩 깎는다. **남은 시간의 근거가 "타이머가
몇 번 깨어났는가"**다. 브라우저가 백그라운드 탭의 타이머를 늦추면(iOS Safari·Android
Chrome 모두 그렇게 한다) 카운트다운이 그만큼 멈춰 선다. 90초 휴식이 실제로는 5분이 된다.

[`src/lib/rest-countdown-audio.ts`](../../../src/lib/rest-countdown-audio.ts)의
`playRestCountdownBeep`은 `AudioContext`가 `suspended`/`interrupted`면 `resume()`만 부르고
**그 비프를 버린다**. iOS는 다른 앱으로 전환하면 컨텍스트를 `interrupted`로 만들므로,
돌아온 뒤의 첫 비프들이 통째로 사라진다. 이 "버린다"는 동작은
[`rest-countdown-audio.test.ts`의 "resumes %s audio without scheduling the current beep"](../../../src/lib/rest-countdown-audio.test.ts)에
의도된 계약으로 박혀 있으므로 테스트도 함께 뒤집는다.

### 수정

**(a) 남은 시간은 종료 시각에서 계산한다.** `RestState`에 `endsAtMs`를 넣는다.
표시용 남은 초는 매 틱마다 `ceil((endsAtMs - Date.now()) / 1000)`으로 구한다. 틱은
화면을 다시 그릴 뿐, 시간의 근거가 아니다. 연장(+30초)은 `endsAtMs`에 더한다.

**(b) 복귀 즉시 재계산한다.** `document.visibilitychange`에서 `visible`이면
`prepareRestCountdownAudio()`로 오디오 컨텍스트를 선복구하고 남은 시간을 다시 계산한다.

**(c) 비프를 버리지 않는다.** `resume()`이 resolve되면 그 비프를 그 자리에서 재생한다.
resume 실패·예외는 지금처럼 조용히 무시한다(휴식 흐름을 절대 막지 않는다).

**(d) 자리를 비운 사이 끝난 휴식은 복귀 시 알린다.** 카운트다운이 여러 초를 건너뛰고
0에 도달하면 5·4·3·2·1 비프는 이미 지나간 뒤다. 이 경우 완료 처리와 함께 **긴 비프를
한 번** 낸다. 판정은 순수 함수로 둔다 — 마지막 초 비프를 이미 냈으면 중복해 내지 않는다.

**(e) 10초 비프 추가.** 남은 10초에 비프를 한 번 낸다. 5·4·3·2초의 짧은 비프(0.12초)와
구분되도록 0.2초로 둔다. `getRestCountdownBeep`에만 손댄다.

**(f) 음량 2배.** `BEEP_GAIN` 0.5 → 1.0. 사인파 단일 오실레이터라 1.0에서도 클리핑이 없다.

### 한계 (문서에 남긴다)

화면이 꺼져 있거나 앱이 완전히 종료된 상태에서는 브라우저가 코드를 실행하지 않는다.
**휴식이 끝나는 그 순간에 소리를 내는 것은 웹앱에서 불가능하다.** 이 설계가 보장하는
것은 "돌아왔을 때 남은 시간이 정확하고, 돌아온 즉시 소리로 알린다"까지다. 그 순간에
울리게 하려면 서버 예약 푸시가 필요하며 이번 범위 밖이다.

### 테스트

`use-rest-countdown.test.tsx`에 fake timer + `Date.now` 조작으로 두 단언을 넣는다.
둘 다 현재 코드에서 반드시 실패한다.

- 틱이 5초 동안 한 번만 깨어나도 남은 시간이 5초 줄어든다
- 백그라운드에서 종료 시각이 지나면 복귀 시 완료 처리 + 긴 비프 1회

`rest-countdown.test.ts`에 10초 비프 단언, `rest-countdown-audio.test.ts`에 gain 1.0과
"interrupted면 resume 뒤에 재생한다"를 넣는다.

---

## 2. 이전 기록 불러오기 — 완료한 세트만

### 현재 동작과 문제

두 경로 모두 `workout_sets`를 `is_completed` 필터 없이 전부 복사한다.

- [`getSessionExerciseStructure`](../../../src/lib/workout.ts) — 피커 '지난 기록' 탭, 달력 예정표 복사
- [`getLastRecordedSets`](../../../src/lib/workout.ts) — 종목 카드의 '↻ 불러오기'

완료 세션이라도 체크하지 않은 세트(=계획만 하고 하지 않은 세트)가 딸려온다. 사용자에게는
"계획을 불러온다"로 보인다.

### 수정

필터 규칙을 [`src/lib/domain/workout-import.ts`](../../../src/lib/domain/workout-import.ts)의
순수 함수로 두고 두 경로가 함께 쓴다.

- 완료(`is_completed = true`) 세트만 복사한다
- 완료 세트가 하나도 없는 종목은 목록에서 **뺀다** — 그날 하지 않은 운동이다
- 전 종목이 빠지면 호출부의 기존 처리로 흘러간다 (피커: "불러올 운동 종목이 없어요" 토스트 /
  달력 복사: "복사할 종목이 없어요")
- `getLastRecordedSets`는 가장 최근 세션에 완료 세트가 없으면 **그다음 최근 세션**으로 넘어간다
  (지금은 가장 최근 것만 보고 포기한다)

타바타 세션은 완료 시 전 세트를 `done = true`로 저장하므로 영향이 없다.

### 테스트

`workout-import.test.ts`에 "미완료 세트는 빠진다", "완료 세트가 없는 종목은 통째로 빠진다",
"완료 세트가 없는 세션은 건너뛴다"를 넣는다. 개수 단언으로 쓴다("0이어야 한다"가 아니라
"3세트 중 2세트가 남아야 한다").

---

## 3. 무동작 시 운동 시간 카운팅 정지

### 목적

앱을 켜 두기만 하고 운동하지 않은 시간이 운동 시간·XP로 잡히는 오남용을 막는다.

### 적용 조건

- 웨이트 또는 맨몸 종목이 **하나라도** 있을 것 (혼합 세션도 보호한다)
- 타바타 세션이 아닐 것 (`tabataMinutes`가 있으면 미적용)
- 전 종목이 유산소면 미적용
- **아직 완료 체크 안 한 유산소가 남아 있으면 미적용** (사용자 결정, 배포 직전 추가)
  - 유산소는 뛰고 **나서** 거리·시간을 타이핑하는 구조라 러닝 중에는 앱을 만질 일이 없다.
    이 조건이 없으면 `벤치 15분 + 러닝머신 30분 = 45분`이 **20분으로 기록된다**
  - 유산소를 완료 체크하는 순간 다시 켜진다 → 유산소를 끝낸 뒤의 무동작은 그대로 잡힌다
  - ⚠️ 대가: 유산소를 담아 두기만 하고 완료하지 않으면 그 운동 내내 감지가 꺼진다.
    사용자가 이 절충을 알고 골랐다

### 판정

- 임계값 **5분(300초)**
- '동작'으로 인정하는 것: 세트 완료 체크 / 중량·횟수·거리·시간 값 입력 / 세트·운동 추가·삭제 /
  휴식바 조작(연장·건너뛰기)
- 휴식 카운트다운이 도는 동안은 무동작을 세지 않는다. 무동작 시계는
  `max(마지막 동작 시각, 휴식 종료 시각)`부터 흐른다. 휴식을 10분으로 잡은 사용자에게
  오발동하지 않게 하기 위함이다
- 판정은 **벽시계 기준**이라 다른 앱에 있다 돌아와도 그 자리에서 즉시 잡힌다

### 정지 구간 계산

정지 시작 시각은 `무동작 시계 시작 + 300초`다. 사용자가 [이어서 운동]이나
[운동 종료]를 누를 때까지의 시간이 누적 정지 시간(`pausedSeconds`)에 더해진다.
20분 자리를 비웠고 휴식이 90초 남아 있었다면, 정지로 잡히는 구간은
`20분 - 90초 - 5분`이다. 앞의 5분은 정상 운동 시간으로 인정한다.

### 모달

`src/components/record/idle-pause-modal.tsx`. 배경 클릭으로 닫히지 않는다.

- 제목: 무동작 5분 — 운동 시간을 멈췄어요
- 본문: 멈춘 시간 (mm:ss, 1초마다 갱신)
- [이어서 운동] — 정지 시간을 누적하고 무동작 시계를 다시 시작한다
- [운동 종료하고 기록] — 기존 `handleFinish` 흐름 그대로 (미완료 세트 확인창 포함)

### 기록 반영

**마이그레이션 0055.**

- `alter table public.workout_sessions add column paused_seconds int not null default 0
  check (paused_seconds >= 0)`
- `drop function public.complete_workout_v2(uuid)` 후
  `create function public.complete_workout_v2(p_session_id uuid, p_paused_seconds int default 0)`로
  다시 만든다. 나머지 본문은 `docs/db-current-schema.sql`의 현행 정의를 그대로 옮기고
  duration 계산만 바꾼다:

  ```sql
  v_paused := least(greatest(coalesce(p_paused_seconds, 0), 0),
                    floor(extract(epoch from now() - s.started_at))::int);
  ...
  duration_minutes = greatest(0, floor((extract(epoch from now() - s.started_at) - v_paused) / 60))::int,
  paused_seconds = v_paused
  ```

  클라이언트가 보내는 값이므로 `0 ~ 실제 경과초`로 클램프한다. 과대 신고해도 자기 XP만
  줄어들고 음수 duration은 생기지 않는다.
- 기본값이 있으므로 **구버전 앱(1-인자 호출)도 그대로 동작한다.** 배포 순서는
  DB 적용 → 검증 → 앱 배포.
- 적용 후 `pnpm db:snapshot`으로 `docs/db-current-schema.sql`을 갱신한다.

**클라이언트.** `completeWorkoutV2(sessionId, pausedSeconds)`로 인자를 하나 늘린다.
경과 시간 표시(`elapsedSec`)에서도 `pausedSeconds`를 빼고, 정지 중에는 정지 시작 시각으로
고정한다.

### 상태 보관

`WorkoutDraft` version 4 → 5. 세 필드를 더한다.

| 필드 | 뜻 |
|---|---|
| `pausedSeconds` | 누적 정지 시간(초) |
| `pausedAtMs` | 지금 정지 중이면 그 시작 시각, 아니면 `null` |
| `lastActivityMs` | 마지막 동작 시각 |

version 4 draft는 세 필드를 각각 `0` / `null` / `null`로 채워 올린다. localStorage에
저장되므로 새로고침하거나 PWA가 죽었다 살아나도 정지 상태와 무동작 시계가 유지된다.

### 구조

`record/page.tsx`는 이미 1,051줄이다. 로직을 더 얹지 않고 세 파일로 나눈다.

- `src/lib/domain/idle-guard.ts` — 순수 판정. 적용 대상 여부, 무동작 시계 시작 시각,
  정지 여부, 정지 구간 길이
- `src/hooks/use-idle-guard.ts` — 틱·상태·draft 반영. `markActivity()`, `resume()`,
  `pausedSeconds`, `paused`를 돌려준다
- `src/components/record/idle-pause-modal.tsx` — UI

`page.tsx`는 훅을 부르고 모달을 렌더하며, 동작 지점(`toggleDone`·`updateSet`·`addSet`·
`removeSet`·`addExercises`·`removeExercise`·`extendRest`·`stopRest`)에서 `markActivity()`를 부른다.

### 테스트

- `idle-guard.test.ts` — 경계 4분 59초 통과 / 5분 정지, 유산소 전용 미적용, 타바타 미적용,
  웨이트 1종목만 섞여도 적용, **유산소 미완료 중에는 미적용 → 완료 체크하면 다시 적용**,
  휴식 중에는 무동작 시계가 흐르지 않음, 정지 구간 길이 계산
- `use-idle-guard.test.tsx` — fake timer로 정지 전이와 재개 후 누적
- `workout-draft.test.ts` — version 4 → 5 마이그레이션
- `pnpm dev`에서 임계값을 임시로 10초로 낮춰 모달·정지·재개·종료를 실제로 확인한다.
  단위 테스트는 "화면이 어떻게 보이는가"를 검증하지 않는다 (CLAUDE.md)

---

## 배포 순서

1. 구현 + 단위 테스트
2. `pnpm dev`에서 세 기능을 실제 화면으로 확인 (임계값 임시 하향 포함, 확인 후 원복)
3. 회귀 스크립트 4종 + lint · typecheck · 전체 test · build
4. 사용자가 SQL Editor에서 0055 실행
5. `pnpm db:snapshot`으로 스키마 스냅샷 갱신
6. 사용자 승인 후 워크트리에서 `vercel --prod`
7. 프로덕션 실물 확인
