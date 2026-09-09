# 운동 중 다중 사진 → 게시물 캐러셀 (계획)

**작성** 2026-09-10 · **상태** Phase 0(조사) 완료 · Phase 1(설계) 완료 · **DB 적용 대기 (승인 필요)**
**제품 원칙** `운동 1회(workout_session) = 피드 게시물 1개`. 새 게시물 시스템을 만들지 않는다.
**배포** 이번 작업에서는 **하지 않는다** (사용자 지시). 검증까지 하고 멈춘다.

---

## 0. 한 줄 요약

`workout_images` 의 `UNIQUE(session_id)` 를 `sort_order` 슬롯(0..4)으로 바꿔 **세션당 5장**까지
받고, 피드 카드의 사진 한 장 자리를 **4:3 캐러셀**로 넓힌다. 운동 중에는 **저장만** 하고
인증 확정은 완료 후에 한 번 한다.

---

## 1. Phase 0 — 재검증 결과 (2026-09-10 실측)

가정을 그대로 믿지 않고 운영 Supabase(`cjdskubyxlnojwzhwbfx`)와 코드 실물을 다시 조회했다.

### 1-1. 맞았던 것

| 항목 | 실측 |
|---|---|
| `workout_images` 컬럼 7개 | ✅ id · session_id · user_id · image_path · source · server_uploaded_at · client_captured_at |
| `UNIQUE(session_id)` | ✅ `workout_images_session_id_key` 존재 — 세션당 1장 |
| `sort_order` 없음 | ✅ |
| `source` 는 camera/album | ✅ check 제약 |
| `set_workout_verification` 이 completed 만 허용 | ✅ `if s.status <> 'completed' then raise 'invalid_status'` |
| `FeedItem.photoUrl: string \| null` · `signFirstImages()` | ✅ |
| `firstWorkoutImagePath()` 가 첫 장만 | ✅ |
| feed-item 4:3 · tap→lightbox · 더블탭→좋아요 · PhotoStamp | ✅ |
| 마지막 마이그레이션 `0102_multiple_plans_per_day` | ✅ |

### 1-2. ⚠️ 틀렸거나 빠져 있던 것 — 계획을 바꾼 4가지

**(a) `storage.objects` 에 DELETE 정책이 하나도 없다.**
버킷 전체(`avatars` 포함)에 걸린 정책은 INSERT 2개 · SELECT 1개 · UPDATE 1개뿐이다.
지금까지 **사진을 지우는 경로가 존재한 적이 없다.** 증거: `workout-images` 버킷에
객체가 **178개**인데 `workout_images` 행은 **83개** — 행이 가리키지 않는 **고아 객체가 95개**
쌓여 있다(반대로 객체 없는 행은 0개). §9 "삭제하면 row 와 Storage object 둘 다 정리"는
새 정책 없이는 **원리적으로 불가능**하다. → `0104` 에 넣었다.

**(b) `workout_images` 에 UPDATE grant 도 UPDATE 정책도 없다.**
`authenticated` 가 가진 것은 SELECT · DELETE · **컬럼 단위** INSERT 6개뿐이다.
`sort_order` 를 클라가 PATCH 하는 순간 권한과 정책 **둘 다** 새로 열어야 한다.
0096 이 좁혀 둔 면이라 그냥 열지 않는다. → **재정렬 전용 RPC** 로 우회한다(§4-2).

**(c) `canAttachPhotoLater({hasPhoto})` 는 사진 개수를 보고 있지 않다.**
호출부(`calendar-view.tsx:1708,1720`)가 넘기는 값은 `s.verification !== "none"` —
즉 **사진 행이 아니라 `workout_sessions.verification_status`** 다. `photoCount` 로 바꾸려면
판정 함수만 고쳐서는 안 되고 **달력이 세션별 사진 수를 받아 오는 경로를 새로 뚫어야** 한다
(`getCompletedSessions`, `workout.ts:1191`). 스펙 §10 이 "예: `photoCount < MAX`" 로 적은 것보다
작업이 한 겹 깊다.

**(d) 마지막 사진을 지웠을 때 인증을 되돌릴 서버 경로가 없다.**
`set_workout_verification` 은 **설정만** 하고 해제를 못 한다(`p_source` 가 camera/album 만 받는다).

> ⚠️⚠️ **이 항목은 2026-09-10 Phase 3에서 한 번 틀렸다가 고쳤다. 기록을 남긴다.**
> 처음에는 "`workout_sessions` 에 `sessions_update_own` 정책이 있으니 클라가 직접
> `verification_status` 를 되돌릴 수 있다 → 새 RPC 불필요"로 적었다. **정책만 보고
> 컬럼 grant 를 안 본 것이 오류였다.** 0096 이 `authenticated` 의 UPDATE 를
> `deleted_at · group_id · intensity · memo · timezone · title · visibility · workout_type`
> **여덟 칸으로 좁혀 놨고** `verification_status` 는 거기 없다. RLS 를 통과해도
> grant 에서 막힌다.
> **교훈: `pg_policies` 만으로 "클라가 쓸 수 있다"를 판정하면 안 된다.
> `information_schema.column_privileges` 를 같이 봐야 한다.**

⛔ **grant 를 넓히는 선택지는 없다.** `verification_status` 를 클라가 쓸 수 있게 되면
사진 한 장 없이 `camera_verified` 를 박아 넣을 수 있다 — 인증이라는 말이 무의미해진다.
→ **`0105`** 로 `clear_workout_verification(p_session_id)` 를 만들었다.
**사진이 0장일 때만** 동작한다(한 장이라도 남아 있으면 `photo_still_exists` 로 거절) —
즉 **내려가기만 하는** 함수라 악용할 여지가 없고, 실수로 불러도 멀쩡한 인증을 못 지운다.
`set_workout_verification` 이 `image_not_found` 로 **올라가는 것**을 막는 것과 대칭이다.

### 1-3. 손댈 필요가 **없다**고 확인된 것 (스펙이 걱정한 것들)

- **`set_workout_verification` 은 그대로 둔다.** 이 RPC 는 사진들을 보고 등급을 계산하지 않고
  **호출자가 넘긴 `p_source` 를 그대로 쓴다.** 그러므로 §8 의 "camera 가 하나라도 있으면
  `camera_verified`, 전부 album 이면 `photo_uploaded`" 는 **클라가 계산해 넘기면 끝**이다.
  `status <> completed` 검사도 손대지 않는다. **RPC 변경 0건.**
- **챌린지 `photo_required` 도 그대로 둔다.** `get_challenge_period_sessions` 가
  `exists (select 1 from workout_images wi where ...)` 를 쓴다 — **count 가 아니라 exists** 라
  "1장 이상이면 충족"이 이미 보존된다. **변경 0건.**
- **사진 XP 도 그대로 둔다.** `award_workout_photo_xp` 는 사진 **존재**만 보고,
  `apply_xp_and_progress` 가 `source_id = session_id` 로 멱등이다. 5장을 올려도 1회. **변경 0건.**
- **RLS insert 정책도 그대로 둔다.** `images_insert_own` 은 `owns_workout_session(session_id)` 만
  볼 뿐 **status 를 보지 않는다** — 즉 **active 세션에 사진 행을 넣는 것은 이미 허용돼 있다.**
  Storage 업로드 정책도 `folder[1] = auth.uid()` 뿐이라 마찬가지다. 운동 중 촬영에 필요한
  서버 권한은 **이미 다 열려 있다.**

### 1-4. 조사 중 발견한 기존 버그 (이번에 같이 고친다)

**홈 화면 크루 카드가 다중사진 후 아무 사진이나 뜬다.**
`workout.ts:1257` 의 `getLatestCrewWorkout` 이 `workout_images!inner(image_path)` 를
**정렬 없이** 받아 `[0]` 을 집는다. 세션당 1장일 때는 정답이 하나뿐이라 안 보이던 문제가,
2장이 되는 순간 PostgREST 반환 순서에 좌우된다. `firstWorkoutImagePath()` 도 같다.
→ 임베드에 `order` 를 걸거나 `sort_order` 로 정렬해 첫 장을 집는다.

### 1-5. ⚠️ 착수 전 정리할 것: 작업 트리가 더럽다

`main` 은 원격과 `0 0` 으로 동기지만, **커밋되지 않은 변경이 9파일 293줄** 남아 있다
(직전 세션의 풀업 사다리 작업 — `recommended-sets.ts` · `official-programs.ts` ·
`program-flow.tsx` · `PROGRESS.md` 등). 이 위에 사진 작업을 얹으면 **두 기능의 diff 가
섞여** 되돌리기와 리뷰가 어려워진다. 착수 전에 커밋하거나 stash 해야 한다. → §8 결정 D

---

## 2. First-Principles 분석

### 문제의 본질

**핵심 문제:** 운동 1회의 시각적 증거가 **한 장으로 제한**돼 있다.
**성공 기준:** 사진 0/1장 사용자의 화면과 동작이 **하나도 바뀌지 않으면서**, 2~5장이 한 게시물
안에서 넘겨진다. 기존 사진 83장이 전부 그 자리에 그대로 있다.

### 도전한 가정

| 가정 | 도전 | 판정 |
|---|---|---|
| "다중 사진이니 게시물 테이블이 필요하다" | 게시물의 정체성은 이미 `workout_sessions.id` 다. 좋아요·댓글·캡션이 전부 거기 붙어 있다 | **폐기** — 테이블 0개 추가 |
| "`set_workout_verification` 을 active 도 받게 고쳐야 한다" | 사진 저장과 인증 확정은 **다른 일**이다. 저장은 RLS 가 이미 허용한다 | **폐기** — RPC 변경 0건 |
| "사진마다 XP" | XP 는 "인증했다"는 사실에 붙지 장수에 붙지 않는다 | **폐기** — 멱등 유지 |
| "재정렬은 클라가 PATCH 하면 된다" | UPDATE 권한이 닫혀 있고, 슬롯 맞바꾸기는 트랜잭션 경계 문제다 | **수정** — RPC 1개 신설 |
| "`photo_required` 를 다중사진에 맞게 고쳐야 한다" | 서버가 이미 `exists` 다. 의미가 안 바뀐다 | **폐기** — 변경 0건 |
| "`string[]` 이면 충분하다" | 삭제·재정렬·source 표시가 전부 id 를 필요로 한다 | **유지** — 객체 배열 |

### 근본 사실 (Ground truths)

1. 게시물의 정체성 = `workout_sessions.id`. 사진은 그 아래 딸린 것이다.
2. 사진 순서는 **≤5개 원소의 전순서**다. 그 이상의 자료구조가 필요 없다.
3. 사진 저장(운동 중 가능)과 인증 확정(완료 후만 가능)은 **시점이 다른 별개의 사건**이다.
4. 인증 등급은 사진 집합의 **함수**다: camera 가 하나라도 있으면 `camera_verified`.
5. 이미 올라간 83장은 **어떤 경우에도 사라지거나 순서가 바뀌면 안 된다.**

### 추론 사슬

```
근본사실 2 (≤5 전순서)
  → smallint 슬롯 sort_order 하나면 표현이 끝난다
  → CHECK(0..4) + UNIQUE(session_id, sort_order) 조합이
     "세션당 6행 불가"를 트리거 없이 DB 에 박는다        ← 스펙 §3 의 우아한 지점
  → 그런데 같은 조합이 "슬롯 맞바꾸기"를 어렵게 만든다   ← 스펙이 못 본 충돌
  → 재정렬을 한 트랜잭션 한 문장으로 하면 풀린다
  → 그 한 문장을 어디에 둘 것인가?
       (a) 클라 PATCH  → UPDATE grant + UPDATE 정책 신설 (0096 후퇴)
       (b) SECURITY DEFINER RPC → 테이블 권한 그대로     ← 채택
근본사실 3 → uploadWorkoutImage 를 저장/확정 둘로 쪼갠다
근본사실 5 → sort_order DEFAULT 0 이 backfill 을 겸한다 (UPDATE 문 없음)
```

### 핵심 통찰

> **스펙의 DB 설계(§3)는 "최대 5장 보장"과 "순서 변경 가능"을 동시에 요구하는데,
> 그 둘이 서로 밀어낸다.** `CHECK(0..4)` 가 상한을 지켜 주는 대가로 임시 슬롯(9 같은 값)을
> 쓸 수 없고, `UNIQUE` 때문에 두 번에 나눠 바꿀 수 없다.
> 재정렬을 **한 문장·한 트랜잭션**으로 만들면 둘 다 지켜진다.

**리허설로 확인한 것** (2026-09-10, 운영 서버 PG 17.6, `pg_temp` — 운영 스키마 무변경):

| 검사 | 결과 |
|---|---|
| slot=5 (6번째 사진) 삽입 | `check` 위반으로 차단 ✅ |
| 같은 세션 같은 슬롯 2장 | 23505 차단 ✅ |
| immediate 상태 · 5장 한 칸 밀기 | **성공** — 단일 UPDATE 문이면 즉시 검사여도 통과했다 |
| deferred · 5장 한 칸 밀기 | 성공 ✅ |

→ 즉 `DEFERRABLE` 은 **지금 구현에는 없어도 되는 보험**이다. 그래도 붙인다: 재정렬을
두 문으로 쪼개는 순간 깨지는데 **그 실패는 5장을 채운 사용자만 밟아서 개발 중에 안 보인다.**
정확성을 "문이 한 개"라는 사실에 매달아 두지 않는다.

### 받아들이는 트레이드오프

- 재정렬에 SECURITY DEFINER 함수 1개가 는다. 스펙 §17 의 "가능하면 없이"를 어기는 대신,
  테이블 UPDATE 권한을 영구히 여는 것을 피한다. **함수 하나가 정책+grant 둘보다 좁다.**
- 삭제를 위해 Storage DELETE 정책을 처음으로 연다. 범위는 upload 정책과 **동일**하다.
- 사진 삭제 시 슬롯에 구멍이 나면 **남은 사진을 다시 매긴다**(재정렬 RPC 재사용).
  안 그러면 `0,1,2,3,4` 중 앞 셋을 지운 뒤 `max+1 = 5` 가 CHECK 에 걸려 **2장뿐인데
  추가가 막힌다.**

---

## 3. 영향 범위 (전수 검색 결과)

| 심볼 | 파일 | 이번 변경 |
|---|---|---|
| `workout_images` | `social.ts` · `workout.ts` · `photo-window.ts` · 마이그 17개 · 스크립트 4개 | 스키마 확장 |
| `photoUrl` | `social.ts` · `feed-item.tsx` · `feed-item.test.tsx` | → `photos[]` |
| `WorkoutImageRelation` · `firstWorkoutImagePath` | `domain/social.ts` (+test) · `social.ts` | 확장 · 정렬 추가 |
| `signFirstImages` | `social.ts:642` | → `signSessionPhotos` (배치 유지) |
| `uploadWorkoutImage` | `workout.ts:892` · `verification-photo.tsx` · `late-photo-button.tsx` (+tests) | 저장/확정 분리 |
| `set_workout_verification` | DB · `workout.ts:916` | **DB 무변경**, 호출 시점만 이동 |
| `awardWorkoutPhotoXp` | `workout.ts:944` · 두 컴포넌트 | **무변경** (완료 후 1회) |
| `VerificationPhoto` | `verification-photo.tsx` · `record/page.tsx:3133` | 다중화 |
| `LatePhotoButton` · `canAttachPhotoLater` | `late-photo-button.tsx` · `photo-window.ts` · `calendar-view.tsx:1716` | `hasPhoto`→`photoCount` |
| `photo_required` | DB `get_challenge_period_sessions` · `challenge.ts` 등 | **무변경** |
| `ImageLightbox` | `image-lightbox.tsx` · `feed-item.tsx` · `member-profile-sheet.tsx` | 좌우 이동 선택적 |
| `PhotoStamp` | `photo-stamp.tsx` · 4개 호출부 | **무변경** (캐러셀 위에 그대로) |
| `photoOnly` | `social.ts:299` | `!inner` 유지 (PostgREST 는 부모 행을 겹치지 않는다) |
| `compressImage` | `lib/image.ts` | **무변경** (1280px · JPEG 85% 재사용) |
| Storage 정책 | `storage.objects` | **DELETE 정책 신설** |
| `workout_images` RLS | 3개 정책 | **무변경** (insert 가 이미 active 허용) |

---

## 4. DB 설계

### 4-1. `0103_workout_images_multi.sql` — 다중화 (⚠️ 고위험 · 승인 필요)

```sql
alter table public.workout_images drop constraint workout_images_session_id_key;
alter table public.workout_images add column sort_order smallint not null default 0;
alter table public.workout_images add constraint workout_images_sort_order_range
  check (sort_order between 0 and 4);
alter table public.workout_images add constraint workout_images_session_slot_key
  unique (session_id, sort_order) deferrable initially immediate;
grant insert (sort_order) on public.workout_images to authenticated;
```

**왜 backfill UPDATE 문이 없나** — `default 0` 이 그 일을 한다. 실측 83행 / 83세션이라
세션당 정확히 1장이고, 전부 0 슬롯에 들어가며 충돌이 없다. 기존 행은 **읽히지도 다시
쓰이지도 않는다**(`image_path` · `user_id` · `source` · `server_uploaded_at` 무변경).

**왜 지금 돌려도 운영 앱이 안 깨지나** — 옛 앱은 `sort_order` 없이 insert 하고 default 0 을
받는다. 같은 세션에 두 번째를 넣으면 예전엔 `..._session_id_key`, 지금은 `..._session_slot_key`
로 **똑같이 23505** 가 난다. 두 컴포넌트의 분기가 `msg.includes("duplicate")` 라 그대로 걸린다.
→ **이 마이그레이션만 적용된 상태에서 운영 동작은 바뀌지 않는다.**

### 4-2. `0104_workout_images_manage.sql` — 삭제·재정렬 권한 (승인 필요)

- `reorder_workout_images(p_session_id uuid, p_image_ids uuid[])` — SECURITY DEFINER,
  `search_path` 고정(`public, pg_temp`), `auth.uid()` 검사, `owns_workout_session()` 소유 검사,
  중복 id 차단, **전량 일치** 검사(부분 목록 거부), 소유 확인 후 한 문장으로 재매김.
  `revoke all from public, anon` → `grant execute to authenticated`.
- `storage.objects` 에 `workout_images_delete_own` DELETE 정책 —
  `bucket_id='workout-images' and folder[1] = auth.uid()::text` (upload 정책과 동일 범위).

### 4-2b. `0105_clear_workout_verification.sql` — 인증 해제 (Phase 3에서 추가)

`clear_workout_verification(p_session_id uuid) returns workout_sessions` —
SECURITY DEFINER · `search_path` 고정 · `auth.uid()` · 소유권 · **사진 0장 검사**.
비파괴 변경(새 함수 + grant)이라 CLAUDE.md 의 "그냥 실행한다" 칸에 해당한다.
추가 경위는 §1-2(d) 의 경고 상자 참조.

### 4-3. 새로 만들지 **않는** 것

- ❌ 새 테이블 · ❌ 트리거
- ❌ `set_workout_verification` 수정 · ❌ `award_workout_photo_xp` 수정
- ❌ `workout_images` UPDATE grant/정책 · ❌ `workout_sessions` 의 `verification_*` grant
- ❌ 새 버킷 · ❌ public 버킷 전환

### 4-4. 위험과 되돌리기

| 위험 | 크기 | 대응 |
|---|---|---|
| `UNIQUE(session_id)` 제거가 되돌릴 수 없다 | **중** | 제거 직후엔 데이터가 그대로라 `add constraint` 로 즉시 복구 가능. 앱 배포 후 2장 이상이 생기면 불가 |
| 기존 83장 손상 | **낮** | UPDATE/DELETE 문이 없다. 적용 전후 개수·경로 대조로 확인(§7) |
| 옛 앱이 깨짐 | **낮** | 위 근거대로 동작 동일. 배포 전에 `pnpm dev` 로 실측 |
| 고아 객체 95개 | **없음(기존)** | 이번 범위 아님. 별도 정리 과제로 남긴다 |
| Storage DELETE 정책이 넓다 | **낮** | upload 와 동일 범위. 남의 폴더는 경로 첫 칸이 달라 불가 — §7 에서 B 계정으로 실측 |

---

## 5. 작업 순서

| Phase | 내용 | 산출 |
|---|---|---|
| **0** ✅ | 조사 — 코드·DB·RLS·Storage·RPC·테스트 전수 | 이 문서 §1 |
| **1** ✅ | 설계 · 마이그레이션 초안 · 위험 보고 | `0103` · `0104` 초안 · 이 문서 |
| **2** ✅ | 승인(2026-09-10) 후 DB 적용 → 객체 재조회 검증 → 스냅샷 갱신 | §5-1 |
| **3** | 데이터 계층 — `photos[]` 모델 · 배치 서명 · upload/finalize 분리 · 5장 상한 · §1-4 버그 | `domain/social.ts` · `social.ts` · `workout.ts` · 새 `domain/workout-photos.ts` |
| **4** | 기존 기능 다중화 — `VerificationPhoto` · `LatePhotoButton` · `photo-window` · 달력 photoCount 경로 | 4파일 + 테스트 |
| **5** | 피드 캐러셀 — 4:3 · swipe · dots · `N/M` · tap · 더블탭 | 새 `feed/photo-carousel.tsx` · `feed-item.tsx` |
| **6** | 운동 중 촬영 — active overlay 카메라 버튼 · 즉시 복귀 · `2/5` 표시 | `active-session-overlay.tsx` · `record/page.tsx` |
| **7** | 완료 화면 사진 관리 — 추가/삭제/순서(좌우 이동 버튼) | 새 `record/session-photo-manager.tsx` |
| **8** | 검증 — A/B 실화면 · 보안 · 회귀 · lint · typecheck · test · build | 보고서 |

**배포는 하지 않는다.**

### 5-1. Phase 2 적용 기록 (2026-09-10, 사용자 승인 후 MCP 로 적용)

`0103` · `0104` 모두 적용 완료. **"명령이 성공했다"가 아니라 객체를 재조회해 확인한 것:**

| 확인 | 결과 |
|---|---|
| `workout_images_session_id_key` | **사라짐** ✅ (부정 확인) |
| `workout_images_sort_order_range` | `CHECK ((sort_order >= 0) AND (sort_order <= 4))` ✅ |
| `workout_images_session_slot_key` | `UNIQUE (session_id, sort_order) DEFERRABLE`, `condeferrable=true` ✅ |
| `reorder_workout_images` | `prosecdef=true` · `search_path=public, pg_temp` · ACL `postgres/authenticated/service_role` — **anon·PUBLIC 없음** ✅ |
| storage `workout_images_delete_own` | DELETE / `{authenticated}` / 자기 폴더 한정 ✅ |

**기존 사진 83장 보존 — 적용 전후 전량 지문 대조:**
`83행 / 83세션 / camera 75 / album 8 / null_captured 5`,
`md5(id|session_id|user_id|image_path|source|server_uploaded_at)` = `91310e6bc4a0f73ac70e2181746d8e42`
→ **적용 전과 완전 동일.** 전부 `sort_order = 0`, 다른 슬롯 0건.

**동작 실측** (롤백되는 트랜잭션 안에서 실제 세션에 삽입 — 잔여 0건, 지문 불변 재확인):

| 검사 | 결과 |
|---|---|
| 한 세션에 5장 삽입 | 5장 ✅ (슬롯 0,1,2,3,4) |
| 6번째 사진 (slot 5) | `check` 차단 ✅ |
| 이미 찬 슬롯에 중복 | 23505 차단 ✅ |
| `auth.uid()` 없이 재정렬 RPC 호출 | `not_authenticated` 거부 ✅ |

⚠️ **`pnpm db:snapshot` 은 `storage.objects` 정책을 담지 않는다 — 원래부터 그렇다.**
새로 만든 `workout_images_delete_own` 뿐 아니라 **기존** `workout_images_upload_own` ·
`workout_images_read_own_or_crew` · `avatars_upload_own` 도 스냅샷에 **0건**이다
(2026-09-10 확인). 즉 **Storage 정책 회귀는 스냅샷 diff 로 절대 안 잡힌다** —
0090 의 트리거 두 개와 같은 사각지대다. 감시자는 `rls-test.mjs` 의 storage 단언뿐이므로,
Phase 8 에서 **삭제 정책에 대한 단언을 그쪽에 반드시 추가한다**(B가 A 사진을 못 지우는지).

### 설계 결정 (Phase 3~7 세부)

- **모델**: `SessionPhoto = { id, url, source, sortOrder }`, `FeedItem.photos: SessionPhoto[]`.
  `media[]` 라는 이름을 쓰지 않는다(영상 일반화 금지).
- **서명**: `signFirstImages` → `signSessionPhotos`. `createSignedUrls` 는 **이미 배치**라
  경로 배열만 20개→최대 100개로 늘리면 된다. **왕복 수는 그대로 1회** — N+1 없음.
- **정렬**: 임베드에 `order(sort_order)` 를 걸고, 클라에서도 한 번 더 정렬한다(방어).
- **인증 확정**: 완료 시 `photos.some(p => p.source === 'camera') ? 'camera' : 'album'` 을
  `set_workout_verification` 에 넘긴다. `client_captured_at` 은 **camera 사진 중 실제
  저장된 값**의 가장 이른 것을 쓰고, 없으면 `null`(임의 생성 금지).
- **운동 중 업로드**: 촬영 → 압축 → `uploadWorkoutImage`(저장만) 를 **await 하지 않고**
  화면 복귀. 실패는 토스트 + 상태 배지. 중복 촬영은 업로드 중 카운트를 낙관 반영해
  `photoCount + inFlight >= 5` 면 버튼을 잠근다. 백그라운드 큐를 새로 만들지 않는다.
- **슬롯 배정**: 새 사진은 `max(sort_order)+1`. 동시 업로드 경합으로 23505 가 나면
  **다시 읽어 한 번 재시도**한다(DB 가 진실이다).
- **삭제**: `workout_images` row DELETE → Storage `remove()` → 남은 사진 재정렬 RPC.
  **마지막 1장을 지우면** `workout_sessions.verification_status = 'none'` 으로 직접 UPDATE
  (§1-2(d)). 그 세션이 `photo_required` 챌린지에 속했다면 집계에서 빠지는 것이 **정상**이며,
  화면이 그 사실을 그 자리에서 말한다(`missingRequiredPhoto` 재사용).
- **캐러셀 lazy**: 현재 ±1장만 `<img>` 로 그리고 나머지는 자리만 잡는다. 1장이면
  **지금 마크업과 동일한 경로**를 타서 캐러셀 코드가 아예 안 붙는다.
- **탭/스와이프 구분**: 터치 시작 좌표를 기억해 이동량이 임계(약 10px)를 넘으면
  탭 타이머를 취소한다. 기존 260ms 더블탭 판정은 그대로 둔다.
- **4:3 유지**: `aspect-[4/3]`. 장수와 무관하게 카드 높이가 안 변한다.

---

## 6. 테스트 (구현 전에 쓴다)

**Domain** — 0장 · 1장 · 5장 · 정렬 · `photoCount < 5` · `= 5` · 같은 날 추가 허용 ·
다음날 차단 · 사진 1장 있어도 버튼 유지(§10 회귀).

**Feed** — 1장이면 기존 UI(캐러셀 미출현) · 2장 이상 캐러셀 · dot · `2 / 4` · swipe ·
현재 사진으로 lightbox · 더블탭 좋아요 · 사진 없는 게시물 · swipe 를 탭으로 오인 안 함.

**Verification** — active 에서 업로드 성공 · active 에서 확정 **안 함** · 완료 후 확정 ·
camera 1장 섞이면 `camera_verified` · 전부 album 이면 `photo_uploaded` · 5장이어도 XP 1회 ·
`photo_required` 는 1장부터 충족 · 마지막 삭제 시 인증 해제.

**Security** (`rls-test.mjs` · `cross-user-abuse-check.mjs` 확장) — B가 A 세션에 사진 추가/삭제/
재정렬 불가 · 비크루의 조회 차단 · 크루의 **전 장** 조회 가능 · 6번째 차단 · `sort_order >= 5` 차단 ·
`reorder_workout_images` 에 남의 세션 id · 부분 목록 · 중복 id 전부 거부.

⚠️ 기존 단언을 스냅샷만 고쳐 통과시키지 않는다. `rls-test.mjs:298` 의
"server_uploaded_at 클라 직접 쓰기 불가"는 **컬럼 권한**에 기대고 있음을 실측 확인했으므로
UNIQUE 제거 후에도 그대로 유효하다.

---

## 7. 실제 화면 검증 (자동 테스트로 대체하지 않는다)

**픽스처**: `node scripts/dev-fixture.mjs create` — 크롬 = A(`dev-테스터A`), 엣지 = B.
⚠️ 같은 브라우저의 새 탭/창은 쿠키를 공유해 **나중 로그인이 양쪽을 덮는다.**

**A 계정**: 운동 시작 → 세트 입력 → 운동 중 사진 1장 → 다음 세트 → 사진 추가 →
**`2/5` 눈으로 확인** → 완료 → 사진 목록 → 추가·삭제·순서 변경 → 피드 →
**4:3 유지 확인** → swipe → dot → `2 / N` → tap lightbox → 더블탭 좋아요 → 댓글 → 운동 상세.

**B 계정(크루)**: A 게시물의 **사진을 전부 넘겨 볼 수 있는지** · 좋아요/댓글 정상.

**비크루 계정**: 사진 접근 차단(부정 확인).

**회귀(부정 확인)**: 사진 0장 게시물이 예전 그대로인지 · **사진 1장 게시물에 캐러셀 UI가
안 뜨는지**(점·카운터가 없어야 한다).

**마이그레이션 전후 데이터 보존 대조** — 적용 직전/직후에 같은 질의를 돌려 비교한다:
`count(*)` = 83 · `count(distinct session_id)` = 83 · `image_path` 전량 체크섬 ·
`source` 분포(camera 75 / album 8) · `client_captured_at is null` = 5 · 고아 객체 95(불변).

---

## 8. 승인이 필요한 결정

| # | 결정 | 기본안 |
|---|---|---|
| **A** | `0103` 운영 적용 (**`UNIQUE(session_id)` 제거** 포함) | 승인 시 MCP 로 적용 후 객체 재조회 검증 |
| **B** | `0104` 적용 (재정렬 RPC 1개 + Storage DELETE 정책 1개) | 승인 시 함께 적용 |
| **C** | 재정렬을 SECURITY DEFINER RPC 로 (테이블 UPDATE 권한 개방 회피) | RPC 채택 |
| **D** | 미커밋 293줄(풀업 사다리)을 먼저 커밋할지 stash 할지 | **먼저 커밋** 권장 |

---

## 9. 이번 범위가 아닌 것

동영상 · 릴스 · 스토리 · 자유 게시물 · `feed_posts` · 해시태그 · 필터 · 사진 편집 ·
위치/사람 태그 · SNS 공유 · 북마크 · DM · 5장 초과 · 새 XP 규칙 · 새 챌린지 규칙 ·
**고아 객체 95개 정리**(별도 과제) · **프로덕션 배포**(사용자 승인 후 별도).
