# 인수인계 — 휴식 타이머 · 완료 기록 불러오기 · 무동작 카운팅 정지

작성 2026-08-01. 사용자 지시로 **커밋 직전에 중단**했다.

설계 문서: [`docs/superpowers/specs/2026-08-01-rest-timer-and-idle-guard-design.md`](../specs/2026-08-01-rest-timer-and-idle-guard-design.md)

---

## 한 줄 요약

기능 3건 구현·검증 **완료**. DB 마이그레이션 0055는 **운영에 이미 적용됨**.
코드는 **커밋도 배포도 안 됐다.** 워킹 트리에 그대로 있다.

---

## ⚠️ 지금 상태에서 가장 먼저 알아야 할 것

**운영 DB는 이미 새 스키마다. 앱 코드는 아직 옛날 것이 돌고 있다.**

- `complete_workout_v2`가 `(p_session_id, p_paused_seconds int default 0)`로 교체됨
- `p_paused_seconds`에 기본값이 있어서 **운영에 떠 있는 구버전 앱(1-인자 호출)도 정상 동작한다.** 지금 사용자에게 문제는 없다
- 즉 서두를 필요는 없지만, **이 코드를 배포해야 무동작 정지가 실제로 duration에서 빠진다**

브랜치 `main`, HEAD `e2da1a0` (0054 기록 커밋). 새 커밋 없음.

---

## 무엇을 만들었나

### 1) 휴식 타이머 — 벽시계 기준으로 전환 + 비프 수정

원인이 둘이었다.

- `use-rest-countdown.ts`가 `setTimeout(…, 1000)`을 1초씩 이어 붙여 남은 초를 깎았다.
  남은 시간의 근거가 "타이머가 몇 번 깨어났는가"라서, 다른 앱을 쓰는 동안 브라우저가
  백그라운드 타이머를 늦추면 카운트다운이 멈춰 섰다 (90초 휴식이 몇 분이 됐다)
- `rest-countdown-audio.ts`의 `playRestCountdownBeep`이 컨텍스트가
  `suspended`/`interrupted`면 `resume()`만 하고 **그 비프를 버렸다.** iOS는 앱 전환 시
  컨텍스트를 interrupted로 만들므로 돌아온 뒤 비프가 통째로 사라졌다

고친 내용:

- `RestState`에 `endsAtMs`를 넣고 남은 초를 `ceil((endsAtMs - Date.now()) / 1000)`으로 **계산**한다. 틱은 화면만 갱신한다
- `visibilitychange` → visible에서 오디오 컨텍스트 선복구 + 남은 시간 즉시 재계산
- `resume()`이 resolve되면 그 비프를 재생한다
- 자리를 비운 사이 휴식이 끝났으면 복귀 시 **긴 비프 1회**로 알린다 (`getRestCompletionCatchUpBeep`)
- **10초 예고 비프 추가** (0.2초). 5·4·3·2초(0.12초) · 1초(0.35초)는 그대로
- `BEEP_GAIN` 0.5 → **1.0** (진폭 2배)

**한계 (사용자에게 이미 고지함):** 화면이 꺼졌거나 앱이 완전히 종료된 상태에서는 브라우저가
코드를 실행하지 않는다. 휴식이 끝나는 **그 순간**에 소리를 내는 것은 웹앱에서 불가능하다.
보장 범위는 "돌아왔을 때 시간이 정확하고 즉시 알린다"까지. 그 순간에 울리려면 서버 예약
푸시가 필요하고 이번 범위 밖이다.

### 2) 이전 기록 불러오기 — 완료한 세트만

`getSessionExerciseStructure`(피커 '지난 기록' 탭 · 달력 예정표 복사)와
`getLastRecordedSets`('↻ 불러오기') 둘 다 `is_completed`를 안 보고 세트를 전부 복사했다.
완료 세션에 남아 있는 미체크 세트 = 계획만 하고 안 한 세트까지 딸려왔다.

- 필터는 `workout-import.ts`의 순수 함수 `completedSetsInOrder` · `withCompletedSetsOnly`
- 완료 세트가 하나도 없는 종목은 목록에서 뺀다
- `getLastRecordedSets`는 최근 세션에 완료 세트가 없으면 그다음 최근 세션으로 넘어간다

### 3) 무동작 시 운동 시간 카운팅 정지

사용자 확정 사항:

| 항목 | 결정 |
|---|---|
| 임계값 | **5분** (`IDLE_LIMIT_SECONDS = 300`) |
| 적용 대상 | 웨이트·맨몸이 **하나라도** 있으면. 타바타·유산소 전용은 제외 |
| 유산소 유예 | **완료 체크 안 한 유산소가 남아 있으면 미적용** (배포 직전 추가) |
| 동작 인정 | 세트 완료 체크 / 값 입력 / 세트·운동 추가·삭제 / 휴식바 조작 |
| 기록 반영 | **duration에서 뺀다** (마이그레이션 0055) |
| 그만하기 | **운동 종료 — 기록 저장** (기존 종료 흐름) |
| 알림 | 앱 안 모달만 (푸시 없음) |

- 휴식 카운트다운이 도는 동안은 무동작을 세지 않는다. 무동작 시계는
  `max(마지막 동작, 휴식 종료)`부터 흐른다 (휴식 10분 설정 시 오발동 방지)
- **아직 완료 체크 안 한 유산소가 있으면 감지 자체를 끈다** (`hasPendingCardio`).
  유산소는 뛰고 **나서** 거리·시간을 타이핑하는 구조라, 이게 없으면
  `벤치 15분 + 러닝머신 30분 = 45분`이 **20분으로 기록된다.** 유산소를 완료
  체크하면 다시 켜진다. 대가는 유산소를 담아만 두면 그 운동 내내 감지가
  꺼진다는 것이고, 사용자가 알고 고른 절충이다
- 정지 시작 시각은 "감지한 순간"이 아니라 **임계값을 넘긴 그 순간**이다.
  20분 자리를 비웠으면 앞의 5분은 정상 운동 시간으로 인정하고 15분만 정지로 잡는다
- 판정은 전부 벽시계 기준이라 다른 앱에 있다 돌아와도 그 자리에서 잡힌다
- 상태는 draft(localStorage) **version 4 → 5**에 저장 → 새로고침·PWA 재시작에도 유지

---

## 파일 목록 (전부 미커밋)

### 새 파일

| 파일 | 역할 |
|---|---|
| `supabase/migrations/0055_idle_pause_seconds.sql` | **운영 적용 완료 ✅** |
| `src/lib/domain/idle-guard.ts` | 순수 판정 (임계값·적용대상·정지구간·경과시간) |
| `src/lib/domain/idle-guard.test.ts` | 22 케이스 |
| `src/hooks/use-idle-guard.ts` | 틱·상태·draft 반영 |
| `src/hooks/use-idle-guard.test.tsx` | 13 케이스 |
| `src/components/record/idle-pause-modal.tsx` | 정지 알림 모달 (배경 클릭으로 안 닫힘) |
| `docs/superpowers/specs/2026-08-01-rest-timer-and-idle-guard-design.md` | 설계 |

### 수정 파일

| 파일 | 내용 |
|---|---|
| `src/lib/domain/rest-countdown.ts` | 10초 비프 + `getRestCompletionCatchUpBeep` |
| `src/lib/rest-countdown-audio.ts` | gain 1.0, resume 뒤 비프 재생 |
| `src/hooks/use-rest-countdown.ts` | `endsAtMs` 기준 전환, visibilitychange, `lastRestEndsAtMs` 노출 |
| `src/lib/domain/workout-import.ts` | `completedSetsInOrder` · `withCompletedSetsOnly` |
| `src/lib/workout.ts` | draft v5, 완료 세트 필터, `completeWorkoutV2(id, pausedSeconds)` |
| `src/app/(tabs)/record/page.tsx` | 훅 연결, `markActivity` 호출 지점, 경과시간 계산, 모달 렌더 |
| `docs/db-current-schema.sql` | `pnpm db:snapshot` 재생성 (0055 반영 확인됨) |
| `src/lib/domain/release-notes.data.json` | `2026-08-01-rest-timer-and-idle-guard` 항목 추가 |
| 각 `*.test.*` | 계약이 바뀐 테스트 갱신 + 회귀 테스트 추가 |

---

## 검증 결과

### 자동

- `npx vitest run` — **830 passed / 0 failed** (73 파일)
- `npx tsc --noEmit` — 통과
- `npx eslint .` — 통과
- `npx next build` — 통과
- 회귀 스크립트 (0055 적용 **후** 실행, 전부 기준선 충족):

| 스크립트 | 기준 | 결과 |
|---|---|---|
| `rls-test.mjs` | 115 / 0 | 115 / 0 ✅ |
| `poke-levelup-check.mjs` | 14 / 14 | 14 / 14 ✅ |
| `challenge-consent-test.mjs` | 22 / 0 | 22 / 0 ✅ |
| `challenge-room-check.mjs` | 48 / 0 | 48 / 0 ✅ |

`poke-levelup-check`는 `complete_workout_v2`를 **1-인자로** 부른다. 14/14 통과가
곧 "구버전 호출도 깨지지 않는다"는 증거다.

### 개발 서버 (localhost:3000, 실제 운영 Supabase)

익명 프로필 `dev0055`를 만들어 확인하고 **검증 후 삭제했다.** 프로필은 기준선 4개
(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)로 복원됨.

확인한 것:

1. 무동작 5분 → 모달 표시 → [이어서 운동] → 타이머 재개. 멈춘 시간이 경과 시간에서 빠짐
2. 헤더가 `⏸ 정지됨 — 무동작`으로 바뀌고 시간이 회색으로 멈춤
3. 정지 상태가 새로고침 뒤에도 유지됨
4. **비프 6발이 실제 브라우저에서 발화** (AudioContext 계측):

   | 남은 시간 | 길이 | gain |
   |---|---|---|
   | 10초 | 0.2s | 1 |
   | 5·4·3·2초 | 0.12s ×4 | 1 |
   | 1초 | 0.35s | 1 |

5. **종료 → 7분** 기록. 벽시계 795초, 정지 361초 → `floor(434/60) = 7` ✅
   DB 행 확인: `duration_minutes: 7, paused_seconds: 361`
6. 3세트 중 2세트만 체크하고 완료 → 피커 '지난 기록'에서 불러오니 **2세트만** (60×10, 65×8).
   미체크 70×5는 빠짐 ✅
7. '↻ 불러오기'도 3세트를 완료 2세트로 되돌림 ✅

### 개발 서버가 잡은 실버그 (단위 테스트·빌드는 전부 초록이었다)

**준비 중(운동 추가·세트 입력)의 동작이 무동작 시계를 미리 켜서, 운동 시작 6초 만에
정지 모달이 떴다.** `markActivity`가 `active`일 때만 동작하도록 고치고
`"ignores preparation activity so the clock starts with the workout"` 회귀 테스트를 넣었다.

---

## 남은 일 (이 순서대로)

### 1. 릴리스 노트 검증 — **이것부터**

`release-notes.data.json`에 항목을 추가한 **직후 중단**됐다. JSON 유효성과 관련
테스트를 아직 안 돌렸다.

```bash
npx vitest run src/lib/domain && npx tsc --noEmit
```

깨지면 그 항목만 고치면 된다. 다른 코드는 이미 전부 초록이었다.

### 2. 최종 재확인

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npx next build
```

### 3. 커밋

사용자 선호(메모리 `feedback_verify_before_commit`): **기능 완성 → 검증 → 사용자
실기기 확인 → 그다음 커밋.** 커밋 전에 사용자 의사를 확인할 것.

### 4. 배포 — `git push`는 배포가 아니다

CLAUDE.md §배포 절차대로. 워크트리로 분리해서:

```bash
git worktree add /tmp/deploy-main main
cp .env.local .vercel -r /tmp/deploy-main/
cd /tmp/deploy-main && npm install && npm run build
npx vercel@latest --prod --yes
```

**마이그레이션은 이미 적용돼 있으므로 DB 단계는 건너뛴다.**

### 5. 프로덕션 실물 확인

`https://gnd-one.vercel.app`에서 번들에 새 문구가 들어갔는지 확인:

```bash
curl -s https://gnd-one.vercel.app/record | grep -oE '/_next/static/chunks/[a-zA-Z0-9._-]+\.js' | sort -u | while read c; do curl -s "https://gnd-one.vercel.app$c" | grep -o "운동 시간을 멈췄어요"; done
```

### 6. 사용자 실기기 확인 요청

혼자 확인할 수 없는 것들이다. 구체적으로 요청할 것:

- **다른 앱 갔다 오기**: 세트 체크로 휴식을 시작하고, 멜론 등 네이티브 음악 앱으로
  전환했다가 30초쯤 뒤 GND로 복귀 → 남은 시간이 실제로 흐른 만큼 줄어 있는가,
  비프가 들리는가
- **음량**: 음악을 틀어 놓은 상태에서 비프가 묻히지 않는가. 무음 스위치가 켜져 있으면
  안 들리는 게 정상이다 (PROGRESS.md 항목 11 — iOS 무음 스위치는 Web Audio를 통째로 음소거)
- **10초 비프**: 새로 생긴 것이라 거슬리지 않는지
- **5분 무동작**: 실제로 5분 쉬어 보고 모달이 뜨는지, [이어서 운동] 후 시간이 맞는지
- **타바타·유산소**: 모달이 **뜨지 않아야** 한다

### 7. 릴리스 공지 (사용자가 지시할 때만)

```bash
pnpm release:notify
```

기본은 DRY RUN. `--send`는 사용자 지시가 있을 때만.

---

## 다음 사람이 헷갈릴 만한 것

- **`complete_workout_v2` 본문을 마이그레이션 파일에서 베끼지 마라.** 0022 → 0023 → 0027 →
  0032 → 0054 → 0055로 여섯 번 덮어썼다. 현행 정의는 `docs/db-current-schema.sql`에 있고
  이미 0055 반영본으로 갱신해 뒀다
- **0055는 `drop function` 후 재생성이다** (인자가 늘어서). 0022가 걸어 둔
  `revoke all from public, anon`이 drop으로 날아가므로 마이그레이션 안에서 다시 건다.
  다음에 이 함수를 또 고칠 때도 같은 걸 챙겨야 한다
- **`vitest` globals가 꺼져 있어 RTL 자동 정리가 안 돈다.** 훅 테스트 파일에서
  `afterEach(cleanup)`를 직접 부르지 않으면 이전 테스트의 훅이 살아남아
  `visibilitychange` 리스너가 겹쳐 잡힌다 (`use-rest-countdown.test.tsx`에서 실제로 겪음)
- **`IDLE_LIMIT_SECONDS`를 개발 확인용으로 낮췄다가 원복했다.** 현재 값은 300이다.
  다시 낮춰서 확인할 일이 있으면 **10초는 너무 짧다** — 브라우저 도구 왕복 사이에
  계속 재정지돼서 조작이 안 된다. 180초쯤이 적당하다
- **정지 시간은 클라이언트가 보내는 값이다.** 서버가 `0 ~ 실제 경과초`로 클램프하므로
  과대 신고해도 자기 XP만 줄고 음수 duration은 안 생긴다. 이 클램프를 빼지 마라
