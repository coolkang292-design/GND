# 8개 개선사항 — 현재 상태 조사 · 판정 · 구현 계획

작성 2026-08-04 · 지시서: 사용자 «GND 기능 개선 작업 지시서» 8건
**이 문서는 1~3단계(조사·판정·계획)까지다. 구현은 시작하지 않았다.**

---

## 0. 조사에서 먼저 드러난 것 — 착수 전에 읽어야 할 5가지

지시서는 8건을 "추가할 기능"으로 적었지만, 실측 결과 **셋의 성격이 전혀 달랐다.**

| # | 지시서의 전제 | 실제 |
|---|---|---|
| 1 | 휴식시간 수정 기능을 만든다 | **이미 있다.** ±10초 버튼이 `disabled={active}`로 **잠겨 있을 뿐**이다. 문구도 "운동 중에는 변경할 수 없어요"로 박혀 있다 |
| 3 | 사진첩 선택을 **추가**한다 | **2026-08-01에 사용자 지시로 제거한 기능이다.** 되살리는 일이다. `VerificationSource`의 `"album"` 타입과 과거 데이터는 아직 남아 있다 |
| 4 | 상세 조회를 붙인다 | **데이터는 이미 클라이언트에 와 있다.** 피드는 세트 전량을 select에 담아 놓고 볼륨 요약만 남기고 **버린다**. 달력은 공유 텍스트용으로 세트를 **이미 조회한다** |
| 5 | 참가자별 목표를 볼 수 있게 한다 | **setup·ended에서는 이미 다 보인다.** 안 보이는 건 **active 구간뿐**이고, 그건 "🔒 공정성을 위해 기간 중에는 내 진행률만" 이라는 **의도적 정책**이다 |
| 6 | 계획 상세를 만든다 | 계획 데이터(종목·세트·수량)가 **이미 시트에 로드돼 있다.** 종목명만 `join(" · ")`으로 그리고 세트를 안 그릴 뿐이다 |

**그래서 8건 중 신규 조회·신규 DB가 필요한 것은 8번 하나뿐이다.** 나머지는 화면 계층의 일이다.

### 조사 중 발견한 별건 3가지 (요구사항 밖 — 보고만 한다)

1. **`set_workout_verification`은 `p_source`를 검증하지 않는다.** `('camera','album')` 범위만 보고 클라이언트 주장을 그대로 믿는다. 즉 **현재의 `camera_verified` 🔥도 서버가 증명한 사실이 아니다.** 3번 판단의 전제가 되는 사실이라 여기 적는다.
2. **`get_challenge_participant_profiles`에 `ORDER BY`가 없다.** 참여자 목록 순서와 **완전 동점자의 시상대 배치**가 DB 결과 순서에 의존한다 (7번이 물은 항목이다).
3. **유산소(cardio)는 세트를 완료해도 휴식 타이머가 안 걸린다.** `shouldStartRestCountdown`이 `weight | bodyweight`만 참이다. 2번의 "완료 버튼을 누르면 휴식 타이머가 시작되어야 함"이 유산소에서는 현재 성립하지 않는다.

---

# 1단계: 현재 상태 조사

## ① 휴식시간 수정

| 항목 | 실측 |
|---|---|
| 화면 | [record/page.tsx:1124-1153](src/app/(tabs)/record/page.tsx#L1124-L1153) "세트 사이 휴식" 카드 |
| 컴포넌트 | [rest-bar.tsx](src/components/record/rest-bar.tsx) (휴식 중 바), [use-rest-countdown.ts](src/hooks/use-rest-countdown.ts), [rest-countdown.ts](src/lib/domain/rest-countdown.ts) |
| 저장 위치 | **DB 아님.** `WorkoutDraft.restSeconds` → localStorage `gnd-workout-draft:{userId}` (version 5) |
| 기본값 | `DEFAULT_REST_SECONDS = 90` ([workout.ts:83](src/lib/workout.ts#L83)) |
| 적용 범위 | **사용자 단위 단일 값.** 종목별·세트별이 아니다. 세션 종료 후에도 `emptyDraft(d.restSeconds)`로 **다음 운동에 그대로 이어진다** |
| RPC/RLS | 없음 (전부 로컬) |

**현재 동작**
- `stepRest(±10)` — 10초 단위, `clamp(10, 600)`. **요구한 "10초 단위 증감"은 이 함수 그대로다.**
- 세트 ✓ → `toggleDone` → `startRest(sourceKey, draft.restSeconds)` → `endsAtMs = Date.now() + seconds×1000`
- 휴식 중 조정 수단: `RestBar`의 `+30초`(`extendRest`)와 `건너뛰기`(`stopRest`)뿐
- ✓를 다시 눌러 해제하면 `cancelRestForSource`로 그 휴식만 취소

**차이 = `disabled={active}` 한 줄과 안내 문구 한 줄.**

**확인 필요** → 2단계 질문 Q1

---

## ② 운동 중 큰 팝업 세션 화면

| 항목 | 실측 |
|---|---|
| 화면 | [record/page.tsx:1023-1331](src/app/(tabs)/record/page.tsx#L1023-L1331) — 서브탭(운동/달력) 한 화면 |
| 컴포넌트 | [exercise-card.tsx](src/components/record/exercise-card.tsx), [rest-bar.tsx](src/components/record/rest-bar.tsx), [idle-pause-modal.tsx](src/components/record/idle-pause-modal.tsx) |
| 레이아웃 | [(tabs)/layout.tsx](src/app/(tabs)/layout.tsx) — `main` + `TabBar` 상시 |
| DB | `workout_sessions` / `workout_exercises` / `workout_sets` |

**현재 동작**: 운동 시작은 화면을 바꾸지 않는다. 같은 화면에서 `active`가 true가 되고 버튼 라벨이 "운동 시작"→"운동 종료"로 바뀔 뿐이다. 세션 헤더(경과시간·볼륨)와 카드 목록이 세로로 계속 이어진다.

### '운동 수량'에 포함되는 필드 — 실제 저장 구조

`LocalSet` ↔ `workout_sets` 대응 ([workout.ts:540-553](src/lib/workout.ts#L540-L553)):

| 운동 유형 | 화면 입력 | DB 컬럼 |
|---|---|---|
| `weight` | 중량(kg) · 횟수(회) | `weight_kg`, `reps` |
| `bodyweight` + `measure=reps` | 횟수(회) | `reps` |
| `bodyweight` + `measure=time` | 시간(분) | `duration_seconds` (분×60) |
| `cardio` | 거리(km) · 시간(분) | `distance_meters`(km×1000), `duration_seconds` |

공통: `is_completed`(=`done`), `set_number`.
⇒ **'운동 수량' = `weightKg` · `reps` · `distanceKm` · `durationMin` 네 개.** 이 넷 외에 화면이 쓰는 수량 필드는 없다. (`workout_sets.completed_at`은 트리거 전용, `workout_exercises.memo`·`workout_sessions.intensity/memo`는 화면에서 쓰지 않는다.)

### "기존 입력값을 클릭해서 바로 기록" — 이미 절반은 성립

`ExerciseCard`의 `numInput`이 **uncontrolled(`defaultValue`)** 이고, `addSet`이 직전 세트 값을 복사한다. 즉 값이 이미 채워져 있어 **✓만 누르면 그 값으로 기록된다.** 새로 만들 것은 이 흐름을 팝업 안에서 되게 하는 것이다.

### 새로고침·뒤로가기·앱 종료 시 세션 처리 (조사 결과)

| 상황 | 현재 처리 |
|---|---|
| 새로고침 | `useState(() => loadDraft(userId))`로 **렌더 전에** 로컬 복구 → 이어서 서버 대사([page.tsx:296-324](src/app/(tabs)/record/page.tsx#L296-L324)): `getSessionById` → `active`면 `started_at` 복원 / `draft`면 `startedAtMs=null` / 없으면 `emptyDraft` |
| 로컬 draft 유실 (다른 기기·저장소 삭제) | `getMyActiveSession(userId)`로 세션은 복구 + "진행 중이던 운동을 이어서 기록해요" 토스트. ⚠️ **세트 값은 복구되지 않는다** — 세트는 종료 시 `saveSessionExercises`로 한 번에 저장하므로 진행 중에는 서버에 없다 |
| 뒤로가기 / 탭 이동 | 컴포넌트만 언마운트. draft는 localStorage에 남고 서버 세션은 계속 `active`. 돌아오면 복구 |
| 앱 종료 | 위와 동일 + 무동작 5분이면 `useIdleGuard`가 정지, 정지 시간은 종료 시 서버 duration에서 빠진다 (0055) |

⚠️ **팝업 열림 상태를 새로 저장하면 안 된다.** 저장하면 draft version을 6으로 올려야 하고 승격 코드가 또 늘어난다. **`active`에서 파생**시키면 새로고침·복귀가 지금 그대로 동작한다 (단일 진실).

---

## ③ 사진첩 당일 사진 인증 — 기술 검토

### ⚠️ 전제: 이 기능은 3일 전에 제거됐다

2026-08-01 커밋 `834711a` — 사용자 지시로 "🖼 앨범 선택"을 걷어냈다. 앨범 버튼·숨은 input·`source === "album"` 분기(`clientCapturedAt`를 파일 `lastModified`로 잡던 것)를 전부 지웠다. **`VerificationSource`의 `"album"` 타입은 남겼다** — 과거에 앨범으로 올라간 행이 `verification_status='photo_uploaded'`로 DB에 있기 때문이다.

즉 이번 요구는 **"되살리되 조건을 건다"** 이다.

### 현재 촬영·업로드 흐름

1. 완료 화면 [`VerificationPhoto`](src/components/record/verification-photo.tsx) → `<input type="file" accept="image/*" capture="environment">`
2. [`compressImage`](src/lib/image.ts) — `createImageBitmap` → canvas → `toBlob('image/jpeg', 0.85)`, 긴 변 ≤1280px
3. [`uploadWorkoutImage`](src/lib/workout.ts#L660) — private 버킷 `workout-images/{userId}/{sessionId}/{ts}.jpg` → `workout_images` insert(`source`, `client_captured_at`) → RPC `set_workout_verification`
4. `awardWorkoutPhotoXp` — 서버 판정(완료 30분 이내 · 그날 첫 유효 운동 · 사진 실재)

### 조사 항목별 답

**(a) 촬영일을 읽을 수 있는가 — 플랫폼별**

| 환경 | 실태 |
|---|---|
| iPhone Safari / PWA | HEIC를 넘길 때 iOS가 JPEG로 변환해 주는데, 이 과정에서 EXIF `DateTimeOriginal`이 **보존되기도 하고 사라지기도 한다**(경로·설정 의존). 스크린샷은 애초에 없다 |
| Android Chrome / PWA | 갤러리 원본은 대체로 EXIF 유지. 다만 갤러리 앱·클라우드 동기화 경로에 따라 다르다 |
| 데스크톱 브라우저 | `capture` 속성이 무시되고 그냥 파일 선택기가 열린다 — **지금도 그렇다** |

**(b) 현재 파이프라인은 EXIF를 파괴한다.** canvas 재인코딩이므로 압축 후 blob에 EXIF가 없다. 촬영일을 쓰려면 **압축 전 원본 `File`에서** 읽어야 하고, 그러려면 EXIF 파서 의존성을 새로 넣어야 한다(현재 없음).

**(c) `File.lastModified`는 촬영일이 아니다.** 파일 시각이다. 다운로드·메신저 저장·복사·편집에서 **"지금"으로 갱신된다.** ⇒ lastModified 기준 '당일' 검사는 **어제 사진을 카톡으로 자기에게 보내면 통과**한다. 즉 **우회를 오히려 도와준다.** (제거 전 코드가 정확히 이 값을 쓰고 있었다.)

**(d) 사진 종류별 인식값**

| 사진 | `DateTimeOriginal` | `lastModified` |
|---|---|---|
| 방금 촬영 | 있음(정확) | 지금 |
| 갤러리 원본 (어제) | 있음(어제) | 대개 어제 |
| 스크린샷·화면 캡처 | **없음** | 캡처 시각 |
| 메신저에서 저장 | 대개 **제거됨** | **저장한 시각(= 오늘)** |
| 다운로드 | 원본 유지되기도 | **다운로드 시각(= 오늘)** |
| 편집·크롭 앱 통과 | 유지·변경·삭제 전부 가능 | 편집 시각 |

**(e) 조작 가능성**: EXIF는 사용자가 자유롭게 쓸 수 있는 **파일 안의 필드**다. 무료 앱이나 `exiftool` 한 줄로 바꾼다. 파일 시각도 마찬가지. **촬영일을 신뢰할 근거는 없다.**

**(f) 클라이언트 vs 서버 검사 범위**

| | 검사 가능 | 신뢰도 |
|---|---|---|
| 클라이언트 | EXIF `DateTimeOriginal`, `lastModified`, 해상도·크기 | **전부 사용자 조작 가능. 0** |
| 서버 (현재) | `server_uploaded_at`(now()), 세션 `completed_at`, 사진 행 실재 | **높음.** 단 **사진 내용은 못 본다** — 압축본에 EXIF가 없고 Edge Function·이미지 처리가 붙어 있지 않다 |

**(g) "당일 사진만 허용"을 어디까지 보장할 수 있는가 → 결론**

> **보장할 수 없다.** 기술적으로 보장 가능한 것은 **"당일 *업로드*된 사진"** 뿐이고, 그건 `server_uploaded_at`으로 **이미 참이다**(완료 후 30분 이내 XP 규칙까지 걸려 있다).
> 촬영일 검사는 **정직한 사용자의 실수를 막는 안내**는 되지만 **어뷰즈 방지 장치는 못 된다.** 그렇게 홍보하면 안 된다.

**(h) 촬영 vs 앨범 구분 저장 — 가능하다. DB 변경 없이.**
`workout_images.source`(`check in ('camera','album')`) + `workout_sessions.verification_source` + `verification_status`(`camera_verified` / `photo_uploaded`)가 **이미 나눠 저장한다.** 달력 범례와 `VERIFICATION_META`도 🔥(카메라) / ●(업로드)로 **이미 구분해 그린다.**

### 대안 (결정용 — 임의로 고르지 않았다)

| | 내용 | 비용 | 어뷰즈 방지력 | 정직함 |
|---|---|---|---|---|
| **A** | 현행 유지(촬영만) | 0 | 낮음(이미 우회 가능) | 경로가 하나라 정책이 명확 |
| **B** | 앨범 허용 + **등급만 분리** (🔥 촬영 / ● 업로드). 촬영일 검사 없음 | 작음 (버튼·input 복원) | 없음 — 대신 **약속하지도 않는다** | ★ 가장 정직 |
| **C** | B + EXIF `DateTimeOriginal` 당일 검사(클라이언트) | 중 (EXIF 파서 의존성 + 압축 전 읽기) | **30초면 우회.** 정직한 사용자의 실수만 막음 | 검사가 있으면 사용자는 "검증된다"고 믿는다 → 위험 |
| **D** | 원본을 EXIF째 올리고 서버(Edge Function)가 검사 | **큼** (신규 인프라·원본 보관·용량) | C와 **동일** (EXIF 자체가 조작 가능) | 비용 대비 이득 거의 없음 |

**메타데이터 없는 사진(스크린샷·메신저 저장)을 허용할지 거절할지는 결정하지 않았다.** C를 고를 때만 답이 필요하다 → 질문 Q4.

---

## ④ 지난 운동 기록 상세보기

### 현재 세션에 저장되는 데이터 (실측 전량)

| 테이블 | 컬럼 |
|---|---|
| `workout_sessions` | `completed_at`, `duration_minutes`, `verification_status`, `verification_source`, `server_uploaded_at`, `client_captured_at`, `record_note`, `tabata_minutes`, `title`, `memo`, `intensity`, `timezone`, `visibility`, `group_id`, `status`, `deleted_at` |
| `workout_exercises` | `exercise_name`, `exercise_type`, `body_part`, `measure`, `sort_order`, `memo` |
| `workout_sets` | `set_number`, `weight_kg`, `reps`, `duration_seconds`, `distance_meters`, `is_completed`, `completed_at` |

> ⚠️ `title` · `memo` · `intensity`는 **컬럼만 있고 화면이 쓰지 않는다.** 지시서의 "저장되지 않는 정보를 새로 만들지 마라"에 따라 **표시 후보에서 뺀다**(항상 null이라 빈 칸만 는다).

### 두 경로가 같은 세션 ID를 참조하는가 — **예**

- 달력: `CalendarSession.id` ← `workout_sessions.id` ([workout.ts:832](src/lib/workout.ts#L832))
- 피드: `FeedItem.sessionId` ← `workout_sessions.id` ([social.ts:120](src/lib/social.ts#L120))

### 데이터는 이미 클라이언트에 있다 (핵심)

- **피드**: `getCrewFeed`의 select에 `workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, distance_meters, is_completed))`가 **이미 들어 있다**([social.ts:211](src/lib/social.ts#L211)). `FeedItem`으로 접으면서 `volume` 요약만 남기고 **버린다.** ⇒ **새 질의 0건.**
- **달력**: 날짜 시트가 열릴 때 공유 텍스트 프리페치로 `getSessionLogExercises(s.id)`를 **이미 호출한다**([calendar-view.tsx:201-223](src/components/record/calendar-view.tsx#L201-L223)). 반환 타입 `LogExercise[]`에 세트별 `done`까지 있다. ⇒ **새 질의 0건.**

### 재사용 가능한 컴포넌트 — **없다.** 만들어야 한다.

가장 가까운 것이 `formatWorkoutLog`(공유용 **텍스트** 생성)와 `getSessionLogExercises`(**데이터** 조회)다. 화면 컴포넌트가 없다. ⇒ `LogExercise[]`를 그리는 **표시 전용 컴포넌트 1개**를 만들어 두 경로가 공유하는 것이 정답이다(두 벌이 되면 갈라진다).

### 권한 — RLS 변경 불필요

| 테이블 | SELECT 정책 |
|---|---|
| `workout_sessions` | `user_id = auth.uid()` **OR** (`visibility='group'` AND `status='completed'` AND `deleted_at is null` AND `is_crew_with(user_id)`) |
| `workout_exercises` | `owns_workout_session(session_id)` **OR** `workout_session_crew_visible(session_id)` |
| `workout_sets` | `owns_workout_exercise(...)` **OR** `workout_exercise_crew_visible(...)` |

⇒ **크루의 세트까지 이미 읽을 수 있다.** 피드에 뜨는 항목은 정의상 이미 크루 가시 세션이다. 본인/남의 차이는 정책이 알아서 처리한다.

---

## ⑤ 챌린지 참가자별 목표 확인

| 항목 | 실측 |
|---|---|
| 테이블·컬럼 | `user_goals(user_id, challenge_id, group_id, goal_type, target_value, unit, planned_days, qualifier)` · unique `(user_id, challenge_id, goal_type)` |
| 조회 | `getChallengeGoals(challengeId)` — **전 참가자 목표를 모든 상태에서 이미 다 받아 온다** ([challenge.ts:186](src/lib/challenge.ts#L186)) |
| 화면 | [challenge/page.tsx](src/app/(tabs)/challenge/page.tsx) · `goalsByUser` 맵이 **이미 만들어져 있다**(:387) |
| RLS | `goals_select_member` = `is_challenge_participant(challenge_id, auth.uid()) OR is_group_member(group_id, auth.uid())` — **변경 불필요** |

### 목표 형태 — 9종 전부 지원한다

`weight_reps`(회) · `weight_days`(일, qualifier=하루 최소 종목수) · `cardio_distance`(km) · `cardio_time`(분) · `bodyweight_reps`(회) · `bodyweight_time`(분) · `bodyweight_days`(일) · `tabata_count`(회) · `volume`(kg, 레거시). 라벨은 `goalLabel(type, qualifier)`가 만든다.

### 상태별 현재 동작 — **차이는 active 구간뿐이다**

| 상태 | 남의 목표 |
|---|---|
| `setup` | ✅ **이미 전부 보인다** — 닉네임 아래 목표 라벨+수치+단위 ([page.tsx:835-852](src/app/(tabs)/challenge/page.tsx#L835-L852)) |
| `active` | ❌ **닉네임 + `🔒`만.** 본인 %만 보인다 (:994-1009). 바로 위에 정책 카드가 있다 — **"🔒 공정성을 위해 기간 중에는 내 진행률만 볼 수 있어요"** (:983-985) |
| `ended` | ✅ `ResultView`가 참가자별 목표+실적+% 전부 표시 (:1191-1212) |

> ⚠️ **기존 동작 변경 사전 보고**: active 구간을 열면 위 정책 문구와 `🔒` 표시가 바뀐다. **목표(target)만 열고 실적(actual)은 계속 잠그는 것**과 **둘 다 여는 것**은 전혀 다른 정책이다 → 질문 Q2.

### 목표가 없거나 유효하지 않은 참가자 — 현재 처리

- `participantInputs`가 `goalCountByUser > 0`인 사람만 남긴다(:593-594) ⇒ **목표 0개면 순위에서 통째로 빠진다**
- `setup` 화면: "설정 대기" 칩
- `dropped`(목표 0개로 빠진 사람): 명단에는 남고 점수 0
- `invited`(미수락): `get_challenge_participant_profiles`가 `status in ('joined','dropped')`만 반환 ⇒ 명단에서 제외
- `plannedDays`는 `userGoals[0]?.planned_days ?? 5` — **첫 목표 행의 값만** 쓴다(현 UI가 한 값으로 저장하므로 실제 문제는 아니지만 구조상 취약)

### 시작 전후 목표 수정 — **시작 후에는 서버가 막는다**

`goals_insert/update/delete_own_setup`이 전부 `challenge_in_setup(challenge_id)` 조건이다. ⇒ active 중에는 목표를 바꿀 수 없다. **즉 active에서 목표를 공개해도 "보고 나서 목표를 낮추는" 조작은 불가능하다.**

---

## ⑥ 계획한 운동의 상세보기

| 항목 | 실측 |
|---|---|
| 테이블 | `workout_plans(id, user_id, plan_date, source_session_id, exercises jsonb, created_at, updated_at)` · unique `(user_id, plan_date)` (0015) |
| `exercises` 내용 | `PlanExercise[]` = `{name, bodyPart, exerciseType, measure, isCustom, sets: [{weightKg, reps, distanceKm, durationMin}]}` — **종목·세트·수량 전부 있다.** `done`만 없다(계획이므로 당연) |
| 검증 | `parsePlanExercises` — 최대 50종목·30세트, 음수 금지. **하나라도 어긋나면 전체를 빈 배열로 버리고** `fromRow`가 `invalid_workout_plan`을 던진다 |
| 화면 | [calendar-view.tsx:597-649](src/components/record/calendar-view.tsx#L597-L649) "운동 예정" 카드 |
| RLS | `workout_plans_select_own` = `user_id = auth.uid()` — **본인 것만.** 변경 불필요 |

**달력에서 계획/완료 구분**: `stampByDate`(완료 세션 → 🔥/●/✓ 글리프) vs `planByDate`(계획 → 초록 테두리 + "예정" 배지). 같은 날 둘 다 있을 수 있다.

**계획 ↔ 세션 연결**: `source_session_id`(복사 원본 세션). 운동 시작 시 `draft.scheduledPlanId`로 물려 있다가 **완료하면 `deleteWorkoutPlan`으로 지운다**([page.tsx:837-843](src/app/(tabs)/record/page.tsx#L837-L843)). 완료 세션이 계획 id를 저장하지는 않는다 — 계획이 사라지기 때문이다.

**현재 동작 vs 요구**: 셀은 이미 눌리고 시트도 뜬다. 카드에 **종목명만** `join(" · ")` + "N종목"이 보인다. **세트·수량은 안 보인다.** 데이터(`selectedPlan.exercises`)는 **이미 손 안에 있다.** ⇒ 차이는 렌더링뿐. **조회 0건 추가.**

기존 계획 상세·수정 화면: **없다.** (수정·삭제·복사·바로시작은 이번 범위 밖 — 삭제·날짜이동·"운동 준비하기"는 이미 있다.)

---

## ⑦ 챌린지 동점 가능성 — 분석

### 현재 순위 산정 기준 (전부 클라이언트 — [goal-score.ts](src/lib/domain/goal-score.ts))

```
achievement   = 목표별 min(actual/target, 1) × 100 의 평균   ← 목표당 100% 상한
participation = min(운동일 / 계획일, 1) × 100                ← 100% 상한
overall       = achievement×0.8 + participation×0.2 + completedGoalBonus
completedGoalBonus = min(완료목표수, 3) × 3점               ← 최대 9점
```

**정렬 사슬** (`compare`, EPSILON=1e-9):
① `overall` → ② `achievement` → ③ `participation` → ④ `allGoalsCompletedAtMs`(빠른 쪽) → ⑤ `completedGoalCount`

**공동 순위: 지원한다.** `compare === 0`이면 앞과 같은 rank를 쓰고 다음 순위는 건너뛴다(1, 1, 3).

### 동점이 발생하는 조건 — 4가지

**1. ④가 죽어 있다 (가장 중요).**
`allGoalsCompletedAtMs`를 **두 호출부가 모두 `null`로 하드코딩**한다:
- [challenge.ts:810](src/lib/challenge.ts#L810) `getActiveChallengeRanking`
- [challenge/page.tsx:607](src/app/(tabs)/challenge/page.tsx#L607) `participantInputs`

애초에 **달성 시각을 저장하는 곳이 없다.** ⇒ **3차 기준이 항상 무효다.**

**2. ⑤도 사실상 죽어 있다.**
`completedGoalBonus`가 이미 `overall`에 들어가 있어서, `completedGoalCount`가 다르면 대개 ①에서 갈린다. ⑤까지 내려오는 경우는 달성률이 정확히 상쇄될 때뿐이다.

⇒ **실효 사슬은 ①②③ 세 개**이고, **셋 다 상한이 걸린 정규화 값**이다.

**3. 구조적 동점 — 완주자가 여럿이면 반드시 동점이다.**
목표를 전부 100% 이상 달성 → `achievement = 100` (초과분은 **상한에 잘린다**). 계획일도 채우면 `participation = 100`. 완료 목표 수가 같으면 보너스도 같다. ⇒ **`overall`이 완전히 일치한다.**
> **초과 달성이 점수에 전혀 반영되지 않는 것이 이 시스템의 동점 원인이다.** 그리고 그 상한은 "쉬운 목표를 걸고 초과 달성하는 어뷰즈"를 막으려고 **일부러 넣은 것**이다(`goal-score.ts` 주석·"초과 달성은 표시만" 화면 문구).

**4. 이산적 목표에서 미달성자끼리도 겹친다.**
`weight_days` / `bodyweight_days` / `tabata_count`는 값이 작은 정수다. 목표 12일에 둘 다 8일이면 66.67%로 정확히 같다. **참가자 2명(가장 흔한 구성)이 같은 유형 목표 1개씩만 걸면 충돌 확률이 높다.**

### 동점 시 현재 처리

**DB**: **아무것도 하지 않는다.**
- `finalize_challenge`(0006) / `autofinalize_due_challenges`(0042)는 `status='ended'`로 바꾸고 알림만 보낸다
- **순위를 저장하지 않는다**
- **챌린지 순위에 걸린 보상·배지·포인트가 하나도 없다** (0020 배지·0031/0032 포인트 엔진에 challenge 규칙 없음)

**화면**:
- 시상대 `podiumOrder = [ranked[1], ranked[0], ranked[2]]` — **공동 1위면 두 명 다 `rank === 1`** ⇒ 👑이 **둘 다** 붙고, `heights[min(rank,3)]`로 **높이도 둘 다 `h-20`**, 단상 숫자도 둘 다 "1". **틀린 정보는 아니지만 시상대가 깨져 보인다.**
- `gndLabel(rank, total)`은 `total>=2 && rank===total`일 때만 "GND 확정"이다. 3명 중 2·3위가 공동 2위면 rank=2·total=3 ⇒ **꼴찌가 아무도 "GND 확정"을 못 받는다.**

**정렬 순서가 DB 결과에 의존하는 부분 — 있다.**
`[...scored].sort(compare)`는 안정 정렬이므로 **완전 동점자의 상대 순서 = 입력 배열 순서 = `members` 순서 = `get_challenge_participant_profiles`의 반환 순서**다. 그런데 **그 RPC에 `ORDER BY`가 없다**(schema snapshot:1152-1171). ⇒ rank 숫자는 안 바뀌지만 **누가 시상대 가운데 서는지가 DB 결과 순서에 달려 있다.**

### 대안 (임의 적용하지 않았다)

| | 방안 | 점수 규칙 | 비용 | 공정성 / 어뷰즈 |
|---|---|---|---|---|
| **ⓐ** | 공동 순위 허용을 **유지**하고 화면만 고친다 (공동 표기·시상대·`gndLabel`·RPC `ORDER BY`) | 무변경 | 작음 | 영향 없음. 보상이 없으므로 실무 피해 0 |
| **ⓑ** | `min(rate, 1)` **상한을 푼다** | 큼 | 중 | 동점 거의 소멸. **하지만 "쉬운 목표 + 초과 달성" 어뷰즈 창구가 열린다** — 상한이 존재하는 이유가 그것이다 |
| **ⓒ** | ④를 **되살린다** (전 목표 100% 최초 달성 시각) | 무변경(죽은 기준 활성화) | 중~큼. 기간 세션을 날짜순으로 누적 재계산해야 한다 | "먼저 끝낸 사람" 우선 — **늦게 시작한 사람에게 불리** |
| **ⓓ** | 동점을 **공동 우승으로 확정**하고 문구로 명시 | 무변경 | 가장 작음 | 보상이 없는 현 시점에서 실질 영향 0 |
| **ⓔ** | 무작위·닉네임순 등 임의 타이브레이크 | 변경 | 작음 | **비추** — 공정성 신뢰를 깎는다 |

> **결정의 진짜 갈림길**: 챌린지 순위에 **앞으로 보상을 붙일 계획이 있는가.** 없다면 ⓐ+ⓓ(화면만)로 충분하고, 있다면 ⓑ/ⓒ의 공정성 논의가 먼저다.

---

## ⑧ 나의 운동 기록 · 통계

### 데이터 원천

| 지표 | 저장 위치 | 단위 |
|---|---|---|
| 운동시간 | `workout_sessions.duration_minutes` (정수 분). 서버가 `complete_workout_v2`에서 계산하며 **무동작 정지 시간을 뺀다**(0055) | 분 |
| 중량 | `workout_sets.weight_kg`(numeric) × `reps`, **`is_completed`인 `weight` 유형만** | kg |
| 거리 | `workout_sets.distance_meters`, **cardio만** (`saveSessionExercises`가 그 외에는 null로 넣는다) | m (화면 입력은 km) |

**단위는 통일돼 있다** — kg / m(표시 km) / 초(표시 분). 혼합 없음.

### '중량'의 계산 방식 — **시스템에 정의가 이미 하나 있다**

[`setVolumeKg`](src/lib/domain/volume.ts#L26) / `summarizeVolume.weightVolumeKg` = **완료된 weight 세트의 `weight_kg × reps` 합 = 세트 볼륨(kg)**.
화면 곳곳이 이걸 "완료 볼륨"으로 부른다(기록 헤더·운동 카드·피드·`getLastCompletedWeightVolume`).
**"입력 중량의 단순 합"이라는 개념은 코드에 존재하지 않는다.**
⇒ 임의로 정하지 않았다 → 질문 Q3.

### 삭제·취소·미완료 포함 여부 (실측)

- `getCompletedSessions`: `status='completed'` **AND** `deleted_at is null` ⇒ 취소·삭제·draft 전부 제외 ✅
- 미완료 세트(`is_completed=false`): 볼륨·거리에서 제외 ✅
- ⚠️ **비대칭 하나**: **운동시간은 세션 단위**라 미완료 세트가 아무리 많아도 그 세션 시간은 통째로 들어간다. 볼륨·거리와 기준이 다르다 — 화면에서 안내해야 한다.
- 타바타 세션: `duration`에는 잡히고, 세트 실적이 0이라 볼륨·거리에는 안 잡힌다

### 기존 집계 함수 / 저장 여부

- **집계 RPC 없음.** 이 저장소는 **전부 클라이언트 집계**가 관례다
- `summarizeMonth`([calendar.ts:97](src/lib/domain/calendar.ts#L97))가 이미 **월간 세션수·총 운동시간·달성률**을 낸다
- `summarizeVolume`([volume.ts:32](src/lib/domain/volume.ts#L32))가 세트 배열을 접는다
- **둘을 잇는 것이 없다** — `getCompletedSessions`가 **세트를 가져오지 않는다**(종목명만). ⇒ **이번 8건 중 유일하게 신규 조회가 필요하다**
- 집계 결과를 저장하는 테이블 없음 (매번 계산)

### 달력 메뉴의 UI 자리

`CalendarView` 최상단에 **이미 "월간 요약" 3칸**(이번 달 운동 / 총 운동시간 / 달성률)이 있다([calendar-view.tsx:411-459](src/components/record/calendar-view.tsx#L411-L459)). **여기가 붙일 자리다.** `record/page.tsx`의 서브탭은 운동/달력 2개.

### RLS
`sessions_select_own_or_crew` + `sets_select_own_or_crew`. 조회에 `user_id = 나` 필터를 걸면 본인 것만 온다. **변경 불필요.**

---

# 2단계: 기능별 판정

**사용자 결정 완료 (2026-08-04) — 8건 전부 구현 가능.**

| # | 기능 | 판정 | 근거 |
|---|---|---|---|
| ① | 휴식시간 수정 | **구현 가능** (결정 완료) | 기능은 이미 있고 잠겨 있다. 잠금 해제 + 진행 중 휴식 즉시 반영 |
| ② | 큰 팝업 세션 화면 | **구현 가능** (UI 제안 승인) | 데이터·상태는 전부 있다 |
| ③ | 사진첩 인증 | **구현 가능** (대안 **B** 확정) | 앨범 허용 + 등급만 분리. 촬영일 검사 없음 |
| ④ | 지난 기록 상세 | **바로 구현 가능** | DB·RLS·조회 전부 그대로. 표시 컴포넌트만 신규 |
| ⑤ | 참가자별 목표 | **구현 가능** (목표만 공개 확정) | 데이터·RLS 준비 완료 |
| ⑥ | 계획 상세 | **바로 구현 가능** | 데이터가 이미 시트에 있다. 렌더링만 |
| ⑦ | 동점 처리 | **구현 가능** (**점수 무변경 + 초과 달성 가름표** 확정) | 계산식은 그대로. 동점일 때만 초과 달성률로 가른다 |
| ⑧ | 기록·통계 메뉴 | **구현 가능** (세트 볼륨 확정) | 유일하게 **신규 조회 필요**. DB 변경은 불필요 |

**DB 마이그레이션 필요: 0건.**
**RLS 변경 필요: 0건.**
**기존 데이터 변환 필요: 0건.**

> ③의 챌린지 게이트는 **현행 유지**로 결정됐다(사진 행이 있으면 촬영·캡처 모두 인정) ⇒ `get_challenge_period_sessions` 교체가 필요 없어졌다.
> `get_challenge_participant_profiles`의 `ORDER BY` 누락은 남아 있다. ⓑ로 완전 동점이 거의 사라지므로 **순위에는 영향이 없고**, 참여자 **목록 표시 순서**만 조회마다 흔들릴 수 있다. 이번 범위 밖의 별도 제안으로 남긴다.

## ⑦ 최종 결정 — 점수는 손대지 않는다

논의 끝에 **ⓑ(상한 200%)를 철회하고 「점수 계산식 무변경 + 초과 달성을 동점 가름표로만 사용」**으로 확정했다.

**ⓑ였다면 생겼을 파급이 전부 사라진다:**

| ⓑ였다면 | 최종안 |
|---|---|
| 이미 발표된 **과거 챌린지 점수·순위가 소급 변경** (순위를 저장하지 않고 매번 계산하므로) | **안 바뀐다** |
| [goal-score.test.ts:37-38](src/lib/domain/goal-score.test.ts#L37-L38) `"단일 목표 초과 달성은 100점 상한 (어뷰징 억제)"` 기존 단언이 **실패** | **그대로 통과한다** |
| [challenge/page.tsx:978](src/app/(tabs)/challenge/page.tsx#L978) "점수는 목표당 100%까지 반영돼요"가 **거짓이 됨** | **여전히 참.** "동점이면 초과 달성이 순위를 가릅니다" 한 줄만 덧붙인다 |
| 만점이 109 → **189점**으로 바뀌고 "100점 만점"이 깨짐 | **현행 척도 그대로** (최대 109점) |
| 상한이 막고 있던 "쉬운 목표 + 초과 달성" 어뷰즈 창구가 **점수에 열림** | **점수에는 안 열린다** |

> ⚠️ **알고 받는 절충 하나**: 초과 달성률은 목표가 쉬울수록 커진다(목표 10회에 100회 = 10.0 vs 목표 300회에 450회 = 1.5). 즉 **동점 상황에서는 쉬운 목표를 건 사람이 유리하다.** 다만 ① 동점 자체가 드물게만 발생하고 ② 목표는 **참가자 전원 동의(`approve_challenge_goals`)를 통과해야** 확정되므로 터무니없는 목표는 그 단계에서 걸러진다. **가름표에 상한을 두지 않는 것으로 가정하고 진행하되, 개발 서버 확인 때 실제 값을 보고 재론한다.**

---

# 3단계: 구현 계획

## ① 휴식시간 수정

- **현재 상태**: `stepRest(±10)` 존재, `disabled={active}`로 운동 중 잠김. 값은 localStorage `draft.restSeconds`, 사용자 단위 단일 값
- **✅ 결정**: 진행 중인 휴식에도 **즉시 반영** · 적용 범위는 **현행 유지**(사용자 단위 전역 하나, draft version 5 유지)
- **변경 대상 파일**: [record/page.tsx](src/app/(tabs)/record/page.tsx) · [rest-bar.tsx](src/components/record/rest-bar.tsx) · [use-rest-countdown.ts](src/hooks/use-rest-countdown.ts)
- **DB 변경**: 없음 · **RLS 변경**: 없음
- **기존 기능 영향**: 안내 문구 "운동 중에는 변경할 수 없어요"가 사라진다. 값의 적용 범위는 그대로(다음 세션에도 유지)
- **구현 방법**:
  1. `disabled={active}` 제거, 문구를 상태 무관하게 교체
  2. `useRestCountdown`에 `adjustRest(deltaSeconds)` 추가 — `endsAtMs`를 직접 옮기고 `generation`을 올려 비프 중복 재생을 막는다(`extendRest`와 같은 구조라 새 개념이 아니다). **하한은 남은 시간 1초** — 0으로 만들면 "줄였더니 갑자기 끝났다"가 된다
  3. `RestBar`에 ±10초 버튼 추가. `+30초`와 나란히 두면 버튼이 4개(−10·+10·+30·건너뛰기)라 좁다 → **`+30초`를 `+10초`로 대체할지, 넷을 다 둘지는 개발 서버에서 실물을 보고 정한다**
  4. `stepRest`와 `adjustRest`를 **함께** 호출한다 — 설정값과 진행 중 휴식이 같이 움직여야 "10초 줄였다"가 한 가지 뜻이 된다
- **테스트 방법**:
  - 단위: `stepRest` clamp(10/600) · `adjustRest`가 `endsAtMs`를 정확히 옮기는지 · 남은 시간이 1초 미만으로 안 가는지 · 조정 후 비프가 중복되지 않는지(`generation`). **일부러 하한을 빼면 실패하는 단언을 넣는다**
  - 화면(A 단독): 운동 중 ±10 → 표시값 변경 → 다음 세트 ✓ → **그 시간으로 시작하는지 초를 센다** · **휴식 중 눌러 남은 시간이 즉시 바뀌는지** · 백그라운드 전환 후 복귀해도 어긋나지 않는지(벽시계 기준이라 유지돼야 한다)

## ② 큰 팝업 세션 화면

- **현재 상태**: 운동 시작해도 화면 전환 없음. 서브탭 한 화면에 헤더+휴식설정+카드 목록이 세로로 이어짐
- **변경 대상 파일**: [record/page.tsx](src/app/(tabs)/record/page.tsx) · 신규 `src/components/record/active-session-overlay.tsx` · [rest-bar.tsx](src/components/record/rest-bar.tsx)(다음 항목 미리보기) · 신규 도메인 `src/lib/domain/next-up.ts`(다음 항목 계산, 순수함수)
- **DB 변경**: 없음 · **RLS 변경**: 없음
- **기존 기능 영향** (⚠️ 사전 보고):
  - 운동 중 기본 화면이 바뀐다. 취소 버튼·서브탭·달력 접근 경로를 팝업 안에서 어떻게 줄지 정해야 한다
  - `IdlePauseModal`은 "달력 탭을 보고 있어도 떠야 한다"는 이유로 최상위에 있다 — **팝업보다 위에 떠야 한다**(z-index 순서 주의)
  - `RestBar`(z-30) · `ExercisePicker`(z-50) · 토스트(z-50)와의 z-index 재정리 필요
- **구현 방법**:
  1. **팝업 열림 상태를 저장하지 않는다.** `active`에서 파생시킨다 ⇒ draft version 유지, 새로고침 복구가 지금 그대로 동작
  2. 오버레이는 **풀스크린**(`fixed inset-0`) — 시트(`max-h-82dvh`)로는 "집중" 요구를 못 채운다
  3. 입력은 **`ExerciseCard`를 재사용**한다. 새 입력 컴포넌트를 만들면 uncontrolled 프리필·볼륨 계산·완료 토글이 두 벌이 된다
  4. 완료 → 휴식 시작은 **`toggleDone` 그대로**. ⚠️ **유산소는 현재 휴식이 안 걸린다**(§0-3) — 바꿀지 여부는 결정 사항으로 남긴다
  5. `RestBar`에 "다음 항목" 표시 — 계산은 순수함수로 분리(현재 종목의 다음 미완료 세트 → 없으면 다음 종목의 첫 세트)
- **테스트 방법**:
  - 단위: 다음 항목 계산(마지막 세트·마지막 종목·전부 완료 경계) · 팝업 표시 조건이 `active`와 일치하는지
  - 화면(A 단독): 시작 → **팝업이 뜨는가** · 값 그대로 ✓ → 휴식 시작 + **다음 항목이 보이는가** · **새로고침 후에도 팝업이 유지되는가** · 뒤로가기 후 재진입 · 무동작 정지 모달이 팝업 **위에** 뜨는가 · 종료까지 완주
  - ⚠️ **유산소 화면 끄기 회귀 (필수)**: 유산소만 담은 세션을 시작 → **화면을 끄고 6분 이상** 둔 뒤 켠다 → **정지 모달이 뜨지 않아야 하고** 경과 시간이 실제 흐른 시간과 같아야 한다. `shouldGuardIdle`의 `hasPendingCardio` 분기가 살아 있는지를 팝업이 깨지 않았는지 확인하는 것이다 (2026-08-01에 "러닝머신 30분을 폰 없이 뛰면 25분이 사라지던" 문제를 고친 자리다)
  - 혼합 세션(유산소+웨이트): **유산소를 ✓ 하는 순간 감지가 켜진다** — ✓ 후 6분 방치하면 정지가 걸려야 정상이다(부정 확인)
- **✅ 결정**: 아래 UI 제안 **그대로 승인**. **유산소 휴식 타이머는 이번에 건드리지 않는다**(현행 유지 — 유산소 세트를 완료해도 휴식은 안 걸린다)

### ②의 UI — 승인됨 (2026-08-04)

| 항목 | 제안 | 이유 |
|---|---|---|
| 크기 | `fixed inset-0` 풀스크린 (탭바 위) | "집중"이 요구다. 시트는 82dvh라 카드 3개면 넘친다 |
| 전환 | `handleStart` 성공 직후 자동 표시 | "운동을 시작하면"이 요구다 |
| 닫기 | **최소화(접기)** — 종료·취소가 아니다. 접으면 기존 화면으로 돌아가고 상단에 "운동 중 · 다시 열기" 바 | 달력을 보거나 종목을 추가하려면 나갈 수 있어야 한다. 닫기=종료로 만들면 오조작이 세션을 날린다 |
| 종료 | 팝업 안에 "운동 종료" — 기존 `handleFinish` 그대로(미완료 세트 확인 포함) | 흐름을 새로 만들지 않는다 |

## ③ 사진첩 인증 — 대안 B 확정

- **✅ 결정**: **B — 앨범 허용 + 등급만 분리.** 촬영일(EXIF·파일시각) 검사는 **하지 않는다.** 챌린지 집계 게이트는 **현행 유지**(사진 행이 있으면 촬영·캡처 모두 인정)
- **현재 상태**: 2026-08-01에 제거된 앨범 버튼을 되살린다. `VerificationSource`의 `"album"` 타입·과거 데이터·DB 제약(`check in ('camera','album')`)이 **전부 그대로 남아 있다**
- **변경 대상 파일**: [verification-photo.tsx](src/components/record/verification-photo.tsx) 1개. `uploadWorkoutImage` 호출에 `source: "album"` 분기 추가
- **DB 변경**: **없음** · **RLS 변경**: 없음 · **신규 의존성**: 없음
- **기존 기능 영향** (⚠️ 사전 보고):
  - 완료 화면에 버튼이 하나 는다. "지금 촬영한 사진만 인증돼요" 문구가 **거짓이 되므로 반드시 교체한다**
  - **앨범 사진도 `photo_required` 챌린지의 사진 요건을 충족한다** — `get_challenge_period_sessions`가 등급이 아니라 **사진 행 존재만** 보기 때문이다. **알고 받아들인 것이다**
  - `clientCapturedAt`: 제거 전 코드는 앨범일 때 파일 `lastModified`를 넣었다. **그 값은 촬영일이 아니므로 다시 쓰지 않는다.** 앨범은 `null`로 보낸다 — 틀린 값을 넣느니 없는 편이 낫다
- **구현 방법**:
  1. 숨은 `<input>`을 둘로 나눈다 — 카메라용(`capture="environment"`)·앨범용(`capture` 없음)
  2. 버튼 2개: `📷 지금 촬영` · `🖼 앨범에서 고르기`
  3. `handleFile(file, source)`로 출처를 넘긴다. `source: "album"`이면 `clientCapturedAt: null`
  4. 완료 문구를 등급별로: 촬영 → "🔥 카메라 인증 완료" · 앨범 → "● 사진 업로드 완료"
  5. 안내 문구를 **정직하게** 다시 쓴다 — 촬영은 🔥, 앨범은 ●로 남는다는 사실만 말하고 **"당일 사진만" 같은 보장을 문구로 약속하지 않는다**
- **테스트 방법**:
  - 단위: `source`에 따라 `clientCapturedAt`이 각각 `Date`/`null`로 가는지 · 완료 문구가 등급별로 갈리는지. **일부러 앨범에도 `new Date()`를 넣으면 실패하는 단언을 넣는다**
  - 화면(A 단독): 운동 완료 → **버튼 2개가 보이는가** · 앨범으로 올리고 **달력에 ●로 찍히는가**(🔥가 아니라) · 촬영으로 올리면 🔥인가 · 세션당 사진 1장 제약(`unique(session_id)`)에 걸렸을 때 문구
- **미확정**: 없음

## ④ 지난 기록 상세

- **현재 상태**: 달력 시트는 종목명·시간·인증만, 피드 카드는 종목 요약·볼륨만. **세트 데이터는 이미 클라이언트에 있고 안 그린다**
- **변경 대상 파일**: 신규 `src/components/workout/session-detail-sheet.tsx`(표시 전용, 두 경로 공유) · [calendar-view.tsx](src/components/record/calendar-view.tsx) · [feed-item.tsx](src/components/feed/feed-item.tsx) · [social.ts](src/lib/social.ts)(`FeedItem`에 세트 보존 — 버리지 않게)
- **DB 변경**: 없음 · **RLS 변경**: 없음
- **기존 기능 영향**:
  - `FeedItem` 타입에 필드가 는다 → 피드 메모리 사용이 는다(이미 받아 오는 데이터라 **네트워크는 그대로**)
  - 달력 시트의 세션 줄이 눌리게 된다(현재는 "📋 복사" 버튼만 눌린다) — 복사 버튼과 충돌하지 않게 영역을 나눈다
- **표시 항목** (저장된 것만):
  종목명·유형·순서 / 세트별 번호·중량·횟수·거리·시간·완료여부 / 소요 시간 · 완료 시각 · 인증 등급(🔥/●/✓) · 🏅 `record_note` · 🔥 타바타 분수
  ❌ 제외: `title`·`memo`·`intensity` (컬럼은 있으나 **항상 비어 있다**)
- **구현 방법**:
  1. 달력: 이미 프리페치한 `getSessionLogExercises` 결과를 텍스트 생성뿐 아니라 **시트 렌더에도 쓴다** (세션별로 나눠 보관)
  2. 피드: `getCrewFeed`가 이미 select한 세트를 `FeedItem`에 **보존**하고, 카드 탭 시 시트로 그린다
  3. 두 경로가 **같은 컴포넌트**를 쓴다 — 두 벌이 되면 갈라진다
- **테스트 방법**:
  - 단위: 유형별 세트 렌더(weight/bodyweight-reps/bodyweight-time/cardio) · 미완료 세트 표시 · 빈 세션
  - 화면(**A+B 두 계정** — 남의 기록 조회가 있다): A가 달력에서 자기 기록 열기 · A가 피드에서 **B의 기록** 열기 → **세트가 보이는가, RLS 오류가 없는가** · B 쪽에서 A 기록도 같은지 · 크루가 아닌 사람 기록은 애초에 피드에 없는지
- **미확정**: 없음

## ⑤ 참가자별 목표

- **현재 상태**: setup·ended에서는 이미 전부 보인다. **active만 `🔒`**
- **변경 대상 파일**: [challenge/page.tsx](src/app/(tabs)/challenge/page.tsx) 1개 (active 참여자 섹션 :987-1010)
- **DB 변경**: 없음 · **RLS 변경**: 없음 (`goals_select_member`가 이미 허용)
- **기존 기능 영향** (⚠️ 사전 보고):
  - **"🔒 공정성을 위해 기간 중에는 내 진행률만 볼 수 있어요" 정책 카드와 `🔒 종료일 공개` 배지가 바뀐다**
  - 목표는 active 중 **서버가 수정을 막으므로**(`challenge_in_setup`) 공개해도 목표를 낮추는 조작은 불가능하다
- **구현 방법**: setup 섹션의 목표 렌더(`theirGoals`)를 **같은 표현으로** active 섹션에 재사용한다. 표시 위치는 참여자 이름 아래(setup과 동일). **달성률·순위는 추가하지 않는다** (지시서 금지)
- **테스트 방법**:
  - 화면(**A+B 두 계정** — 챌린지는 상대가 있어야 성립): `node scripts/dev-fixture.mjs challenge`로 active 챌린지 구성 → A 화면에서 **B의 목표가 보이는가** · B 화면에서 **A의 목표가 보이는가** · **실적(%)은 여전히 잠겨 있는가**(Q2가 "목표만"일 때) · 목표 0개 참가자의 표시
  - 회귀: `challenge-room-check.mjs` 48/0 · `challenge-consent-test.mjs` 22/0
- **✅ 결정**: **목표(수치)만 공개하고 실적·%는 계속 잠근다.** 정책 카드는 "기간 중에는 **내 진행률**만 볼 수 있어요"로 유지하되, 목표는 보인다는 뜻이 되도록 문구를 다듬는다. `🔒` 배지는 **실적 자리에 그대로 둔다**
- **미확정**: 없음

## ⑥ 계획 상세

- **현재 상태**: 시트에 종목명 `join(" · ")` + "N종목"만. `selectedPlan.exercises`에 세트·수량이 **이미 있다**
- **변경 대상 파일**: [calendar-view.tsx](src/components/record/calendar-view.tsx) 1개
- **DB 변경**: 없음 · **RLS 변경**: 없음 · **신규 조회**: 없음
- **기존 기능 영향**: "운동 예정" 카드가 길어진다. 삭제·날짜이동·"운동 준비하기" 버튼 위치가 밀린다
- **구현 방법**: 카드 안에 종목별 세트 목록을 편다(접기/펴기 또는 항상 표시). 유형별 표기는 ④의 표시 컴포넌트와 **같은 규칙**을 쓰되, **계획에는 `done`이 없으므로** 완료 체크 칸은 그리지 않는다
- **테스트 방법**:
  - 단위: 유형별 계획 세트 렌더 · 세트가 0값인 계획(`newPlanExercises`가 만드는 기본값)
  - 화면(A 단독): 달력 미래 날짜 → 계획 생성 → **셀 클릭 → 세트·수량이 보이는가** · 루틴에서 만든 계획 · 지난 기록 복사로 만든 계획(값이 채워진 것) 둘 다 확인
- **미확정**: 세트를 항상 펼지 접을지 (제안: **종목 3개 이하면 펼치고 넘으면 접는다** — 시트가 88dvh라 넘치면 버튼이 밀려난다)

## ⑦ 동점 처리 — 점수 무변경 + 초과 달성 가름표 + 산식 설명

- **✅ 결정**: ⓐ 종합점수 **계산식 무변경** · 동점일 때만 **상한 없는 초과 달성률**로 가른다 · **종합점수 산식을 결과 화면에 펼쳐 보여준다**(범위 밖 신규 항목이지만 함께 넣기로 승인)
- **변경 대상 파일**: [goal-score.ts](src/lib/domain/goal-score.ts) · [goal-score.test.ts](src/lib/domain/goal-score.test.ts) · [challenge/page.tsx](src/app/(tabs)/challenge/page.tsx)
- **DB 변경**: **없음** · **RLS 변경**: 없음
- **기존 기능 영향**:
  - **과거 챌린지 점수·순위 불변** ✅ (계산식을 안 건드린다)
  - 기존 단언 `"단일 목표 초과 달성은 100점 상한 (어뷰징 억제)"` **그대로 통과** ✅
  - 완전 동점자의 상대 순서가 **DB 결과 순서 의존에서 명시 규칙으로 바뀐다** — 이게 개선이다
  - `challenge/page.tsx:978` 문구는 **여전히 참**이나 "동점이면 초과 달성이 순위를 가릅니다" 한 줄을 덧붙인다
- **구현 방법**:
  1. `goal-score.ts`에 순수함수 `uncappedAchievementScore(goals)` 추가 — `achievementScore`와 같되 `min(rate, 1)`을 **적용하지 않는다**. 기존 함수는 **손대지 않는다**
  2. `compare` 사슬에 새 기준을 **③ 참여율 다음, ④ 앞**에 끼운다:
     `① overall → ② achievement → ③ participation → ④ 초과 달성률(신규) → ⑤ allGoalsCompletedAtMs(여전히 null) → ⑥ completedGoalCount`
     ⑤가 죽어 있으므로 실질적으로 **④가 새 최종 가름표**가 된다
  3. `RankedParticipant`에 표시용으로 초과 달성률을 실어 화면이 근거를 말할 수 있게 한다
  4. **결과 화면 산식 표시**: 참가자 카드의 기존 3칸(평균 달성률·참여율·완료 목표) 아래에 조합식을 한 줄로 펼친다 — 예 `92.0 × 0.8 = 73.6 · 80.0 × 0.2 = 16.0 · 완료 2개 +6.0 → 95.6`. **계수는 코드 상수에서 읽는다**(문구에 `0.8`을 박으면 두 곳이 갈라진다 — `CLAUDE.md` §같은 사실을 두 곳에 두지 않는다)
  5. 시상대 표시도 함께 고친다 — 공동 순위가 남는 경우(초과 달성률까지 같을 때)를 대비해 **👑 중복·단상 높이 중복**과 `gndLabel`의 공동 꼴찌 누락을 처리한다
- **테스트 방법**:
  - 단위: `uncappedAchievementScore`가 상한을 안 먹는지 · 종합점수·달성률·참여율이 전부 같을 때 **초과 달성률이 큰 쪽이 앞서는지** · 초과 달성률까지 같으면 **공동 순위가 유지되는지** · **기존 `achievementScore` 단언 전량이 그대로 통과하는지**(회귀). **일부러 새 기준을 빼면 실패하는 단언을 넣는다**
  - 화면(**A+B 두 계정**): 픽스처로 두 계정이 **같은 점수, 다른 초과 달성률**이 되는 종료 챌린지를 만든 뒤 → **순위가 갈리는가** · **산식 줄의 숫자를 손으로 검산** · 시상대에 왕관이 하나인가
  - 회귀: `challenge-room-check.mjs` 48/0 · `challenge-consent-test.mjs` 22/0
- **미확정**: 가름표에 상한을 둘지 (상한 없이 진행 가정 — 위 ⑦ 절충 참조). 개발 서버 확인 때 실제 값을 보고 재론

## ⑧ 기록·통계

- **현재 상태**: 월간 요약 3칸(세션수·총 시간·달성률)만 있다. **중량·거리 누적 지표 없음.** 집계 RPC 없음
- **변경 대상 파일**: 신규 `src/lib/domain/workout-stats.ts`(순수 집계) · [workout.ts](src/lib/workout.ts)(통계 전용 조회 함수 신규) · 신규 `src/components/record/stats-panel.tsx` · [calendar-view.tsx](src/components/record/calendar-view.tsx)
- **DB 변경**: **없음**(클라 집계 유지 시) · **RLS 변경**: 없음
- **기존 기능 영향**:
  - ⚠️ **`getCompletedSessions`를 확장하지 않는다.** 달력·피커·기록 탭이 전부 이걸 쓴다. 세트를 얹으면 세션당 수십 행이 붙어 **관계없는 화면이 다 무거워진다.** 통계 전용 조회를 따로 만들고 **통계를 열 때만** 부른다
  - 월간 요약 3칸의 자리·구성이 바뀔 수 있다
- **표시 항목**: 운동시간 · 중량(Q3의 정의) · 거리 × {누적, 월간}. **그 외 지표는 넣지 않는다**(기간 비교·그래프·최고 기록·달성률은 지시서에서 범위 밖)
- **구현 방법**:
  1. 조회: `workout_sessions(completed_at, duration_minutes) + workout_exercises(exercise_type) + workout_sets(...)`를 `user_id=나 / status=completed / deleted_at is null`로 가져온다
  2. 집계는 **순수함수**로 분리하고 **기존 `summarizeVolume`을 재사용**한다 — 두 번째 볼륨 계산식을 만들지 않는다
  3. 월간은 `dayKey(completedAt, timeZone)` 접두사 매칭(`sessionsInMonth`와 같은 규칙). 누적은 전량 합산
  4. 화면은 월간 요약 카드 옆/아래에 붙이고 **누적↔월간 토글**을 둔다
  5. ⚠️ **운동시간과 볼륨의 기준 비대칭**(§⑧ 조사)을 화면에 한 줄로 알린다
- **테스트 방법**:
  - 단위: 취소·삭제 세션 제외 · 미완료 세트 제외 · 타바타 세션 처리 · 월 경계(타임존) · 빈 데이터. **일부러 `deleted_at` 필터를 빼면 실패하는 단언을 넣는다**
  - 화면(A 단독): 달력 탭 → 통계 → **누적/월간 값이 실제 기록과 맞는지 손으로 검산** · 월 이동 시 값이 따라 바뀌는지 · 기록이 없는 달 · 새로고침
- **✅ 결정**: **'중량' = 세트 볼륨(중량 × 횟수)** — 시스템의 기존 정의(`setVolumeKg` / `weightVolumeKg`)를 그대로 쓴다. **새 계산식을 만들지 않는다.** 완료 체크한 `weight` 세트만 집계
- **미확정**: 없음

---

# 4단계 착수 — 확정된 결정 (2026-08-04)

| | 항목 | 결정 |
|---|---|---|
| ① | 휴식시간 반영 시점 | **진행 중인 휴식에도 즉시 반영** |
| ① | 휴식시간 적용 범위 | **현행 유지** — 사용자 단위 전역 하나 (draft version 5 그대로) |
| ② | 팝업 UI | **제안 승인** — 풀스크린 · 운동 시작 시 자동 표시 · 닫기 = 최소화(종료 아님) |
| ② | 유산소 휴식 타이머 | **건드리지 않는다** (현행 유지) |
| ③ | 사진첩 | **대안 B** — 앨범 허용 + 등급만 분리(🔥/●). 촬영일 검사 없음 |
| ③ | 챌린지 사진 게이트 | **현행 유지** — 촬영·캡처 모두 인정 (DB 변경 없음) |
| ⑤ | active 중 목표 공개 | **목표(수치)만 공개.** 실적·%는 계속 잠금 |
| ⑦ | 동점 | **점수 계산식 무변경** + 동점일 때 **초과 달성률**로 가름 |
| ⑦ | 산식 설명 | **넣는다** — 결과 화면에 종합점수 조합식을 펼쳐 표시 |
| ⑧ | '중량' 정의 | **세트 볼륨 = 중량 × 횟수** (기존 `setVolumeKg` 재사용) |

**전 항목 결정 완료 — 8건 모두 착수 가능하다.**
남은 판단은 개발 서버에서 실물을 보고 정할 두 가지뿐이다: ①의 `RestBar` 버튼 배치, ⑦ 가름표 상한 여부.

## 권장 착수 순서

1. **④ + ⑥** — 결정 무관·DB 무관·표시 계층. ④에서 만드는 세트 표시 컴포넌트를 ⑥이 같은 규칙으로 쓴다
2. **① + ②** — 같은 파일(`record/page.tsx`)을 건드린다. ①을 먼저 끝내고 그 위에 팝업을 얹는다
3. **③** — 독립. 파일 1개
4. **⑤ + ⑦** — 같은 파일(`challenge/page.tsx`)을 건드린다
5. **⑧** — 유일하게 신규 조회가 있다. 달력 UI를 ⑥이 이미 건드린 뒤에 하는 편이 충돌이 적다

각 묶음이 끝날 때마다 `pnpm lint && typecheck && test && build`를 돌리고 **개발 서버에서 화면을 확인한 뒤** 다음으로 넘어간다. 전부 끝난 뒤 한 번에 확인하면 어느 변경이 깨뜨렸는지 못 가린다.

---

# 5단계 검증 계획 (공통)

모든 기능에 대해:
1. `pnpm dev` → **localhost:3000에서 실제 클릭·입력·이동** ← HTTP 200은 확인이 아니다
2. 모바일 뷰포트(개발자도구 기기 모드) + PWA 설치 상태
3. 새로고침 · 뒤로가기 · 탭 이동 후 재진입
4. 기존 운동 기록에 미치는 영향 (특히 ⑧의 집계가 과거 데이터를 바르게 접는지 **손 검산**)
5. **④⑤⑦은 A+B 두 계정** (남의 기록·남의 목표·남과의 순위를 보는 기능이다). ①②③⑥⑧은 A 단독
6. RLS 오류 유무 — 브라우저 콘솔·네트워크 탭에서 4xx 확인
7. 회귀: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + `rls-test.mjs` 125/0 · `challenge-room-check.mjs` 48/0 · `challenge-consent-test.mjs` 22/0

**신규 단언은 일부러 고장내서 실제로 실패하는 것까지 확인한다** (`CLAUDE.md` §테스트가 진짜 테스트인지).
