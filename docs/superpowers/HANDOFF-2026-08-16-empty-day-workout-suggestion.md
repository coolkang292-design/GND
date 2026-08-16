# 인수인계 — 계획 없는 날 운동 제안 (2026-08-16)

> 다음 에이전트는 이 파일을 **먼저** 읽고, 이어서 §5의 "다음에 할 일"부터 시작한다.

## 0. 한 줄

오늘 계획도 없고 운동도 안 한 사람에게 각자의 알림 시각에 "무엇을 할지"를 보내고,
그 알림을 누르면 기록 탭이 **이미 담긴 채로** 열려 `운동 시작` 한 번만 누르면 되게 한다.

**전체 12 태스크 중 Task 0~6 완료. Task 7부터 이어서 하면 된다.**

---

## 1. 읽어야 할 문서 (경로)

| 파일 | 무엇 |
|---|---|
| `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md` | **설계서.** 왜 이렇게 만드는지, 무엇을 안 하는지 |
| `docs/superpowers/plans/2026-08-16-empty-day-workout-suggestion.md` | **구현 계획.** Task 0~12의 전체 코드가 들어 있다 |
| `CLAUDE.md` (저장소 루트) | 배포·검증·DB 규칙. **배포 전 개발 서버 확인은 건너뛸 수 없다** |
| `~/.claude/CLAUDE.md` | 전역 규칙. 같은 내용의 상위 버전 |

⚠️ 설계서와 계획서는 **작업 중 두 번 갱신됐다**(스트릭 0 버그, `INTERVAL_SUGGESTION_NAMES` 위치).
지금 워킹 트리에 **미커밋 상태로 있다** — §6 참조.

---

## 2. 브랜치와 커밋

**브랜치: `feat/empty-day-workout-suggestion`** (`main`에서 분기)

```
23ff291 feat(notify): workout_suggestion 유형 배선 (0078 + 목적지 + 아이콘)   ← Task 6
680b407 feat(cron): 브리핑이 오늘 계획·가입일·챌린지를 읽어 제안을 정한다      ← Task 5
a8bb889 fix(suggest): 스트릭이 끊긴 사람에게 '0일째'라고 말하지 않는다        ← Task 4 후속
ca5270d feat(briefing): 계획 없는 날 제안을 실어 보내고 신규 유저 게이트를 연다 ← Task 4
22c3b6d docs(suggest): daysBetween 주석의 반례를 정확한 것으로 바꾼다
814428c test(suggest): 유예 창 경계와 n+1 변형을 실제로 잡게 한다             ← 검토 지적 수정
e361848 feat(suggest): 날짜마다 도는 제안 문구 suggestionCopy                 ← Task 3
f7d4636 feat(suggest): 지난 운동에 4분 인터벌을 보조로 붙이는 secondaryKind    ← Task 2
4beb84b feat(suggest): 계획 없는 날 무엇을 제안할지 정하는 pickSuggestionKind  ← Task 1
```

⚠️ 저장소에 **이 작업과 무관한 미커밋 변경이 많다**(`.gitignore`, 자산 폴더, 스크립트).
`git add -A` · `git add .`를 절대 쓰지 마라. 항상 경로를 명시한다.

---

## 3. 완료된 것 (Task 0~6)

### 신규 파일

| 경로 | 무엇 |
|---|---|
| `src/lib/domain/workout-suggestion.ts` | **핵심 순수 모듈.** 분기·보조·문구 전량 |
| `src/lib/domain/workout-suggestion.test.ts` | 23건 |
| `supabase/migrations/0078_workout_suggestion_notification.sql` | 알림 유형 1종 추가 (**아직 Run 안 함** — §4) |

### 수정된 파일

| 경로 | 무엇 |
|---|---|
| `src/lib/domain/briefing.ts` | `BriefingUser`에 4필드, `Briefing`에 `type`. **신규 유저 게이트를 열었다** |
| `src/lib/domain/briefing.test.ts` | 21건 (신규 7건 포함) |
| `src/app/api/briefing/route.ts` | 오늘 계획·가입일·챌린지·타바타 조회 추가, INSERT가 `b.type`을 쓴다 |
| `src/lib/domain/push.ts` | `workout_suggestion: "/record?suggest=1"` |
| `src/lib/domain/push.test.ts` | 27건 |
| `src/lib/social.ts` | `NotificationRow["type"]` 유니온에 1종 |
| `src/components/notification-bell.tsx` | `TYPE_ICON`에 `🚶` |

### 지금 상태

- `npx tsc --noEmit` → **0 오류**
- `pnpm lint` → **0 오류** (무관한 미추적 `scripts/make-study-pack.mjs`에 경고 2건 — 이 작업과 무관)
- `pnpm test` → **145 파일 / 2148건 전부 통과** (2026-08-16 17:09 실측, 82초)
  - 직전 기준선 `PROGRESS.md`의 **144 파일 / 2116건**에서 **+1 파일 / +32건**
  - Task 7·9가 테스트를 더 추가하므로 최종은 이보다 는다. **줄면 테스트를 지운 것이다**
- `pnpm build` · `node scripts/rls-test.mjs` → **아직 안 돌렸다** (Task 10)

### 완료된 것의 검토 상태

- Task 1~3: 사양 검토 ✅ · 코드 품질 검토 ✅(수정 후 승인)
- Task 4: 사양 검토 ✅
- Task 5·6: **검토 아직 안 붙였다** ← 다음 에이전트가 붙일 것

---

## 4. ⚠️ 사용자가 해야 하는 일 — 마이그레이션 0078

**에이전트는 SQL을 실행할 수 없다.** 사용자가 Supabase SQL Editor에 붙여넣고 Run해야 한다.

파일: `supabase/migrations/0078_workout_suggestion_notification.sql`

- **지금 Run해도 안전하다.** 운영 앱이 이 유형을 아직 안 쓰므로 아무 변화가 없다
- ⚠️ **Task 11(개발 서버 확인)보다 먼저 Run되어 있어야 한다.** `pnpm dev`가 운영 DB에
  붙으므로, 제약이 안 바뀐 상태에서 제안 알림을 INSERT하면 위반으로 실패한다
- 검증: 0077의 허용목록 21종 + `workout_suggestion` = **22종**임을 스크립트로 대조 완료

---

## 5. 다음에 할 일 — Task 7부터

전체 코드는 `docs/superpowers/plans/2026-08-16-empty-day-workout-suggestion.md`에 있다.
아래는 **경로와 함정만** 요약한 것이다.

### Task 7 — draft v6 → v7, 자정 만료

**경로:** `src/lib/workout.ts` · 신규 `src/lib/domain/suggestion-draft.test.ts`

`WorkoutDraft`에 `suggestedForDayKey: string | null`을 더하고, 순수 함수
`expireStaleSuggestion(draft, todayKey)`를 만든다.

⚠️⚠️ **이 태스크에서 가장 조용히 망가지는 곳:** `loadDraft`의 승격 경로가 **여섯 곳**이다
(v1·v2·v3·v4·v5·v6 판정). `workout.ts:158` 주석이 경고한다 —
*"하나라도 옛 번호로 끝내면 그 draft는 통째로 버려진다 — 진행 중이던 운동이 날아간다."*
**여섯 곳을 전부 v7로 끝내야 한다.**

⚠️ 만료 판정은 `< todayKey`가 아니라 **`!== todayKey`** 다. 기기 시계가 앞서면 `<`는 영영 안 지운다.

### Task 8 — 기록 탭이 제안을 담는다

**경로:** `src/app/(tabs)/record/page.tsx` · `src/lib/workout.ts`

⚠️⚠️ **`useSearchParams`를 쓰지 마라.** 이 저장소가 두 번 거부했다
(`src/lib/record-view.ts:8`, `src/app/auth/callback/page.tsx:50`) — Suspense 경계를 요구한다.
`useEffect` 안에서 `window.location.search`를 읽고 `history.replaceState`로 지운다.

⚠️⚠️ **`handleScheduleFromPast`를 쓰지 마라.** `Promise<WorkoutPlan>`을 돌려준다 —
`workout_plans`에 행을 만들어 **달력에 `예정`이 찍힌다.** 사용자 요구("12시 지나면 달력에
안 남게")가 깨진다. draft에만 병합하는 것은 **`addPastSession`**(`record/page.tsx:955`)이다.

실측한 함수 이름 (계획서 1판이 전부 틀렸던 곳):

| 쓸 것 | 위치 | 시그니처 |
|---|---|---|
| `addExercises` | `record/page.tsx:822` | `(items: CatalogExercise[]) => void` — `addCatalogExercises`가 **아니다** |
| `addPastSession` | `:955` | `(sessionId: string) => Promise<boolean>` |
| `openTabataSheet` | `:949` | `(prefill: TabataPrefill \| null) => Promise<void>` |
| `getCompletedSessions` | `workout.ts:1002` | `completed_at` **내림차순** → `[0]`이 최신 |

⚠️ `pastSessionsRef`는 **없다.** `draftRef`만 있다.
⚠️ `beginTabata(picked, minutes)`는 종목 배열을 받는다 — 분수만 넘기면 안 된다.

`INTERVAL_SUGGESTION_NAMES`는 **`record/page.tsx` 안에** 둔다.
⚠️ `workout-suggestion.ts`에 두면 안 된다 — `recommended-exercises` → `@/lib/challenge` →
`getSupabaseBrowserClient` 사슬이라, **브리핑 서버 라우트가 브라우저 Supabase 클라이언트를
끌고 들어간다.**

### Task 9 — 빈 화면 제안 카드 (C2)

**경로:** `src/components/record/record-empty-state.tsx` · `.test.tsx` · `record/page.tsx`

⚠️ 보조 버튼 문구는 **`시작`**이지 `담기`가 아니다. 인터벌은 목록에 담으면 음원도 코스도
없는 맨몸 4개가 된다(`src/lib/domain/tabata.ts:63` 주석의 옛 버그).

### Task 10 — 전체 게이트

```bash
cd /c/Users/SAMSUNG/workout-app
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node scripts/rls-test.mjs   # 기준선 128 / 0 failed
```

⚠️ 직전 기준선은 `PROGRESS.md` 최상단의 **144 파일 / 2116건**(2026-08-14). 이번 배치로
최소 +40건 늘어야 한다. **줄면 테스트를 지운 것이다.**
⚠️ `pnpm test`는 2분을 넘는다. 타임아웃을 넉넉히 주거나 백그라운드로 돌려라.

### Task 11 — 개발 서버 실측 (건너뛸 수 없다)

계획서 Task 11에 8행짜리 조작 표가 있다. **계정 A 하나로 충분하다**(상대가 없는 기능).

특히:
- 자정 만료는 시계를 못 돌리므로 **localStorage의 `suggestedForDayKey`를 손으로 고쳐서** 본다.
  스탬프를 **`null`로 두고도** 안 지워지는지 반드시 확인 — 그게 "사용자 것은 안 지운다"의 실측이다
- 알림 실물은 `?hour=N` 오버라이드로 강제한다:
  `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/briefing?hour=9" | jq`
  2차 호출이 `alreadySent`로 떨어지는지(멱등)까지 본다. **검증으로 만든 알림 행은 지운다**

### Task 12 — 배포 (사용자 승인 뒤에만)

⚠️ `--scope gnd4`가 없으면 `Not authorized`다. 절차는 계획서 Task 12.

---

## 6. ⚠️ 미커밋 문서 변경

```
 M docs/superpowers/plans/2026-08-16-empty-day-workout-suggestion.md
 M docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md
```

작업 중 발견한 것을 반영한 것이다(스트릭 0 규칙, `INTERVAL_SUGGESTION_NAMES` 위치,
회귀선 3줄 추가). **커밋해도 된다:**

```bash
git add docs/superpowers/plans/2026-08-16-empty-day-workout-suggestion.md \
        docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md \
        docs/superpowers/HANDOFF-2026-08-16-empty-day-workout-suggestion.md
git commit -m "docs: 제안 파이프라인 설계·계획 갱신 + 인수인계"
```

---

## 7. 이번 작업에서 실측으로 잡은 것 — 같은 실수를 반복하지 마라

계획을 세우고 실행하는 동안 **네 가지**가 코드를 열어 보고서야 드러났다.
전부 테스트·빌드가 초록인 채로 지나갈 수 있었던 것들이다.

| # | 무엇 | 어떻게 드러났나 |
|---|---|---|
| 1 | `handleScheduleFromPast`가 `workout_plans`에 행을 만든다 | 계획서 쓰며 시그니처 확인 → **사용자 요구가 깨질 뻔** |
| 2 | `workout-suggestion.ts`가 서버에 브라우저 Supabase 클라이언트를 끌고 온다 | Task 3 직전 import 사슬 추적 |
| 3 | 유예 창 경계 테스트가 `<`→`<=` 확장을 **못 잡았다** | 코드 품질 검토가 **실제로 고장 내서** 확인 |
| 4 | **`currentStreak`는 끊기면 0** → `🔥 0일째 — 오늘이 아직 비어 있어요` | Task 4 구현자가 기존 테스트 충돌을 보고 → 추적 |

4번이 특히 뼈아프다. **하필 재참여가 가장 필요한 이탈 사용자에게** 말이 안 되는 문구가
나갈 뻔했다. `streak-messages.ts` 머리주석이 이미 경고하고 있었다 —
*"사실을 넘지 마라. 화면이 거짓말하는 순간 다음 경고도 안 믿는다."*

**교훈: 함수를 쓰기 전에 시그니처와 반환값을 열어서 확인하라.** 이름만 보고 쓰면 이 넷이 그대로 나간다.

---

## 8. 실행 방식

지금까지 **superpowers:subagent-driven-development**로 진행했다 — 태스크마다 새
서브에이전트를 띄우고, 그 뒤에 사양 검토 → 코드 품질 검토를 붙였다.
이어서 같은 방식으로 하려면 그 스킬을 부르면 된다. 인라인으로 해도 된다.

⚠️ 검토 서브에이전트가 **작업 트리에서 코드를 고장 냈다 되돌리는** 방식으로 검증한다.
그동안 다른 구현 에이전트를 병렬로 돌리면 변조된 파일을 보게 되고 git 인덱스도 충돌한다.
**구현과 검토는 겹치지 않게 순차로 돌려라.**
