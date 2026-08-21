# 인수인계서 — XP·35레벨·7단계 캐릭터 시스템

작성 2026-07-23, **갱신 2026-07-23(Task 11~13 완료 후)**. 다른 에이전트가 이어서 작업할 수 있게 현재 상태·남은 일·주의사항을 정리한다.

## 0. 지금 위치 한 줄 요약

**Task 1~14 전부 완료 — 2026-07-23 운영 배포됨.** main 병합(fast-forward, 11커밋 `ba79ef8`) → `gnd-oiutfai04-gnd4.vercel.app` production Ready → https://gnd-one.vercel.app 전 경로 200 · 번들 실검증 통과. 다음 작업은 **0023 계획 완료 보너스**다(§4).

## 1. 문서 지도 (먼저 읽을 것)

| 문서 | 용도 |
|---|---|
| `docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md` | 설계(확정 정책·화면 구성·보완 11건) |
| `docs/superpowers/plans/archive/2026-07-23-xp-level-character-system.md` | **메인 실행 계획(Task 1~14 + 8B)** |
| `docs/superpowers/plans/archive/2026-07-23-plan-completion-xp.md` | 후속 계획(0023 계획완료 +20). **0022 배포 후** 착수 |
| `docs/design/character-image-guide.md` | 캐릭터 이미지 생성 가이드(참고) |

## 2. 브랜치·커밋 상태

브랜치: **`feat/xp-level-character-system`** (main 아님, 미배포)

커밋(오래된→최신):

1. `c0180e1` docs: 설계·계획·이미지 가이드
2. `84eab3b` feat: XP·레벨 엔진 (Phase A) — 0022·순수함수·클라 래퍼·DB테스트
3. `b5465ae` feat: 홈 나의 캐릭터 카드 + 7단계 캐릭터 에셋 (Task 9·10)
4. `e2f1af4` docs: 인수인계서(1차)
5. `139df4a` perf: 캐릭터 이미지 최적화 (16.9MB → 1.88MB, -89%)
6. `5303389` fix: 홈 카드 하루 최대 XP를 실제 지급액(160)으로 정정
7. `ce632f7` feat: XP 획득 방법 안내 시트 (Task 12)
8. `f3770bb` feat: 내 정보 성장 허브 (Task 11)
9. `783bd3d` feat: 운동 완료 XP·레벨업·진화 모달 + v2 완료 경로 (Task 13)

## 3. 완료·검증된 것

### Phase A — 엔진 (Task 1~8B) ✅ 실 DB 검증 완료

- `supabase/migrations/0022_xp_level_system.sql` — **이미 운영 DB에 적용됨** → **절대 수정 금지**. 5테이블·RLS·35레벨 seed·`complete_workout_v2`(멱등)·`apply_xp_and_progress`(공통)·`award_workout_photo_xp`·`is_valid_workout`(내부전용).
- `src/lib/domain/progression.ts` — 순수 함수. **챌린지 레벨 `level.ts`와 분리.** `LEVEL_DEFS`·`getLevelProgress` + **신규** `getStageGroups()`·`STAGE_DESCRIPTIONS`.
- `src/lib/domain/xp.ts` — XP 계산 + **신규 `MAX_DAILY_WORKOUT_XP_NOW = 160`**(§6 참고).
- `src/lib/progression.ts` — 클라 조회(`getProgressSummary`/`getRecentXpTransactions`/`getMyUnlocks`/`getLevelRewards`, userId 인자 없음·RLS 기반·error throw).
- `src/lib/workout.ts` — `completeWorkoutV2` 래퍼 + `WorkoutXpResult` 타입.
- `scripts/xp-test.mjs` — **실 DB 15/15 통과**. `node scripts/xp-test.mjs`로 재실행(픽스처 자동 정리).
- `scripts/recalculate-user-progress.mjs` — 원장 기준 캐시 재계산(dry-run 기본).

### Phase B — 화면 (Task 9~13) ✅

- `public/characters/char-1~7.png` + `fallback.png` — **600×800으로 최적화됨**(§6).
- **Task 10** `src/components/home/character-card.tsx` — 홈 카드. 실 DB 렌더 확인 완료.
- **Task 11** `src/components/profile/` — 성장 허브:
  - `growth-hub.tsx` (조회·조립·실패 시 "다시 시도" — 修正14)
  - `stage-carousel.tsx` · `current-stage-card.tsx` · `level-rewards.tsx` · `next-stage-preview.tsx` · `growth-timeline.tsx` · `xp-history.tsx`
  - `src/app/(tabs)/profile/page.tsx` 재구성 — 알림 설정은 **우상단 톱니(⚙️)**로 이동, 열었을 때만 조회.
- **Task 12** `src/components/profile/xp-guide-sheet.tsx` — "지금 획득 가능" vs "준비 중".
- **Task 13** `src/lib/domain/xp-events.ts` + `src/components/record/xp-result-modal.tsx` — 순차 이벤트 큐 모달. `record/page.tsx` 완료 경로를 **`completeWorkoutV2`로 교체**.

### 테스트

`src/lib/domain/progression.test.ts`(+단계 그룹) · `xp.test.ts`(+160 상한) · `xp-events.test.ts`(신규) · `src/components/profile/growth-hub.test.tsx`(신규) · `src/components/record/xp-result-modal.test.tsx`(신규). 컴포넌트 테스트는 이 저장소 관례대로 `renderToStaticMarkup` SSR 문자열 검증이다.

## 4. 남은 일

### Task 14 ✅ 완료 (2026-07-23)

실기기 검수 → main fast-forward 병합 → `vercel deploy --prod` → 전 경로 200 · 번들 실검증 통과 → PROGRESS.md ✅ 갱신까지 끝났다.

**검수에서 잡힌 것 1건** (`ba79ef8`): "7단계 안내 ›"가 캐러셀 스크롤이라 캐러셀이 이미 보이는 위치에서 **무반응**이었다. `StageGuideSheet`로 교체 — §6 참고.

### 다음 — 0023 계획 완료 보너스

`docs/superpowers/plans/archive/2026-07-23-plan-completion-xp.md` 6개 Task. 이때 `MAX_DAILY_WORKOUT_XP_NOW`를 **160 → 180으로 올리는 것도 같이** 해야 한다(§6).

### 운영 배포 후 아직 안 본 것

푸시 알림·아침 브리핑 크론은 프리뷰 검수 대상이 아니었다(Preview에 VAPID·CRON_SECRET을 안 넣음). 이번 변경이 건드린 영역은 아니지만 **운영 주소에서 한 번 확인**하면 좋다.

## 5. 반드시 지킬 주의사항

1. **커밋 규칙(사용자 강함)**: 기능 완성 → 검증 → **사용자 실기기 확인** → 그다음 배포. 코드는 자동 테스트로 검증해 브랜치에 커밋했고, **배포(main 병합)는 실기기 확인 후에만**.
2. **마이그레이션 정책**: `0022`는 **이미 운영 적용됨** → **절대 수정 금지**. 추가 변경은 `0023+` 새 파일로. (0023은 계획완료용으로 예약)
3. **검증 시 테스트 계정은 반드시 정리**(교훈 13). 현재 실계정 4개: 오뎅끼데스까·스칼레또·ㄹ홀·낭만송곳니 — 건드리지 말 것. `scripts/xp-test.mjs`는 픽스처를 자동 정리한다.
4. **챌린지 레벨과 혼동 금지**: 성장 레벨(영구 1~35, `domain/progression.ts`)은 챌린지 레벨(임시 1~5, `domain/level.ts`)과 **완전 별개**.
5. **DB↔TS 미러**: 레벨 컷/단계를 바꾸면 `progression.ts`의 `CUTS`/`STAGES`와 `level_definitions`(DB) 둘 다 맞춰야 한다. `scripts/xp-test.mjs` 항목7이 불일치를 잡는다.

## 6. 이번에 바로잡은 것 (다음 사람이 알아야 함)

### ⚠️ 하루 최대 XP는 180이 아니라 **160**이다

`domain/xp.ts`의 순수 함수는 최대 180을 계산하지만(계획 완료 +20 포함), **운영 중인 `complete_workout_v2`는 `v_plan := 0`으로 고정**돼 있어 계획 XP가 지급되지 않는다. 실제 상한은 `100(기본) + 40(시간) + 10(기록) + 10(사진) = 160`.

홈 카드가 "최대 180 XP"라고 안내하고 있었다 → **받을 수 없는 XP를 약속하는 문구**라 `MAX_DAILY_WORKOUT_XP_NOW = 160` 상수로 단일화해 고쳤다(修正17).

**0023에서 계획 완료 XP를 실제 지급하게 되면 이 상수를 180으로 올려야 한다.** `xp.test.ts`가 이 값을 검증한다.

### ✅ 캐릭터 이미지 최적화 완료 (1차 인수인계서의 ⚠️ 이슈)

각 ~2MB(1086×1448)·총 16.9MB → sharp로 **600×800 + 팔레트 양자화 → 1.88MB(-89%)**. 표시 최대 크기가 96px이라 600px면 3배 DPR에도 충분하다.

**파일명·확장자는 그대로 뒀다** — `level_definitions.character_path`가 `/characters/char-N.png`로 seed돼 있어(0022, 운영 적용됨) 경로를 바꾸면 DB·`progression.ts`·에셋 3곳을 함께 고쳐야 하기 때문이다.

원본은 추적하지 않는 `7단계 캐릭터/` 폴더에 그대로 있다. 다시 만들 일이 생기면 파일 크기로 매핑을 복원할 수 있다(2261107→char-1·fallback, 1996400→char-2, 2357369→char-3, 1905884→char-4, 2374562→char-5, 2153497→char-6, 2376689→char-7).

실측: 캐러셀 7장 Next Image 최적화 **1.6초**(이전엔 스크린샷이 타임아웃), w=128 각 12.8KB.

### "7단계 안내"는 스크롤이 아니라 시트여야 했다 (실기기 검수에서 발견)

계획 Task 11은 `"7단계 안내 ›"(캐러셀로 스크롤)`이라고 지시했고 그대로 만들었는데, **캐러셀이 현재 단계 카드 바로 위에 이미 보이는 위치**라 스크롤할 데가 없어 실기기에서 아무 일도 안 일어났다. 라벨은 "안내"를 약속하는데 설명은 어디에도 없었다.

`stage-guide-sheet.tsx`로 교체했다 — 7단계 전부를 캐릭터·이름·레벨구간·상태설명·해금 누적 XP(잠긴 단계는 남은 XP)와 함께 보여준다. 진입점 3개가 같은 시트를 연다: 현재 단계 카드의 "7단계 안내 ›" · 캐러셀 헤더 `?`(목업에 있었는데 빠져 있었다) · 캐러셀 단계 타일(누르면 무반응이었다).

**교훈**: "X로 스크롤" 류 지시는 X가 이미 화면에 있으면 무동작이 된다. 계획서에 그렇게 적혀 있어도 라벨이 약속하는 것과 맞는지 따로 봐야 한다.

### 설계와 다르게 간 것 — 성장 타임라인에 날짜 없음

설계 §11.2는 타임라인에 날짜를 넣자고 했지만, **0022에 레벨 달성 이력 테이블이 없다**(`user_progress`에 `last_level_up_at` 하나뿐). 추정 날짜를 지어내는 대신 레벨·누적 XP·상태(달성/현재/잠금)만 보여준다. 날짜가 꼭 필요하면 0024+에서 레벨 이력 테이블을 먼저 만들어야 한다.

### v2 완료 경로의 함정

구 `completeWorkout`은 **세션 행**을 반환했지만 `completeWorkoutV2`는 **XP 결과만** 반환한다. `record/page.tsx`가 쓰던 `s.id`·`s.completed_at`·`s.duration_minutes`가 사라지므로, 세션 id는 `draft.sessionId`를 그대로 쓰고 완료 시각·소요 시간은 `getSessionById`로 다시 읽는다. **조회가 비어도 완료 흐름을 막지 않는다** — 운동은 이미 완료된 상태라 여기서 에러를 띄우면 안 된다.

## 7. 실기기 검수 체크리스트 (Task 14 Step 3)

- [ ] **내 정보**: 7단계 캐러셀 가로 스크롤 · 잠긴 단계 저채도+자물쇠 · 현재 단계 강조 테두리
- [ ] **내 정보**: 구간 진행바·% · "다음 레벨까지 N XP" · "7단계 안내 ›" 탭 시 캐러셀로 스크롤
- [ ] **내 정보**: 레벨 혜택 "전체 보기" 토글 · **coming_soon이 "준비 중"으로 보이는지**(해금됨으로 보이면 버그)
- [ ] **내 정보**: 다음 단계 미리보기 실루엣 · 성장 타임라인 "35레벨 전체" 토글
- [ ] **내 정보**: 우상단 톱니(⚙️) → 알림 설정 열림/닫힘, 토글 동작
- [ ] **내 정보**: "XP 획득 방법 보기" → 시트 열림/닫힘, 스크롤, **하루 상한이 160으로 표시**
- [ ] **운동 완료**: XP 합계 모달 · 항목별 내역 · 레벨업/진화 케이스 · "모두 확인" 건너뛰기
- [ ] **운동 완료**: 완료 버튼 중복 클릭 시 **XP는 1회만** (멱등 — 모달도 다시 안 뜸)
- [ ] **운동 완료**: 같은 날 2번째 운동은 XP 0·모달 없음, 기록은 정상 반영
- [ ] **홈**: 캐릭터 카드가 완료 직후 갱신 · "오늘 운동하면 최대 **160** XP"
- [ ] **레이아웃**: 320px 폭·safe-area(노치/홈바)에서 깨지지 않는지

## 8. 재개 방법

```
1) 이 파일 + 메인 계획 읽기
2) git checkout feat/xp-level-character-system
3) pnpm lint && pnpm typecheck && pnpm test && pnpm build   (387 통과 확인)
4) node scripts/xp-test.mjs                                  (실 DB 15/15)
5) §7 체크리스트로 실기기 검수 → 사용자 확인 → main 병합 → 배포
```

## 9. 참고 — 정리되지 않은 선행 계정

`auth.users`에 **프로필 없는 계정 22개**가 남아 있다(가입일 2026-07-19~21). 이번 작업에서 만든 것이 **아니고**, 이전 세션의 온보딩 테스트 잔여물로 보인다. 실계정 4개(오뎅끼데스까·스칼레또·ㄹ홀·낭만송곳니)와 섞이지 않으니 당장 문제는 없지만, 정리하려면 **사용자 확인 후** `service_role`로 크루→유저 순 삭제해야 한다. `user_progress` 행은 현재 0개다(아직 아무도 XP를 받지 않음 = 미배포 상태와 일치).
