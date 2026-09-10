# 인수인계 — 운동 다중 사진 + 피드 캐러셀 (2026-09-10)

**한 줄**: 기능 구현은 **끝났다**. DB 4건 적용·검증 완료, 자동 테스트 전부 초록.
**§3 버그는 고쳤고 화면으로 재현·확인까지 마쳤다**(2026-09-10 09:10~10:00 추가 작업).
남은 것은 **§4의 B 계정 확인 2건**뿐이다. **배포하지 마라.**

> 📌 **2026-09-10 추가 작업 요약** — §3을 통째로 다시 썼다. 원래 적어 둔 원인
> (*"완료 뒤에도 사진 버튼이 오버레이에 남아 있다"*)은 **틀렸다.** 화면을 100ms
> 간격으로 재 보니 그 버튼은 완료와 동시에 사라진다. 진짜 원인과 고친 자리는 §3에.

- 계획서(설계 근거 전량): [`plans/2026-09-10-workout-multi-photo-carousel.md`](plans/2026-09-10-workout-multi-photo-carousel.md)
- 이 문서는 **지금 당장 이어서 할 일**만 적는다. 왜 그렇게 만들었는지는 계획서에 있다.

---

## 0. 먼저 이것부터 (30초)

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...main   # 0 0 이 아니면 아래 §5 참조
git log --oneline -7
pnpm dev                                                # → http://localhost:3000
```

**⛔ 배포 금지** (사용자 지시 2026-09-10). `vercel --prod` 는 사용자가 따로 승인한다.

---

## 1. 지금 상태

### 커밋 (`934df3d` 이후 7개)

| 커밋 | 내용 | 원격 |
|---|---|---|
| `28d6420` | (앞 작업) 세트별 목표가 다를 때 요약 줄 수정 | ✅ |
| `be4fab2` | DB 토대 `0103`·`0104` + 계획서 | ✅ |
| `c91bfdd` | Phase 3·4 — 데이터 계층 · 나중 붙이기 다중화 | ✅ |
| `82b3784` | Phase 5 — 피드 캐러셀 | ✅ |
| `07978b3` | Phase 6·7 — 운동 중 촬영 · 완료 화면 사진 관리 | ✅ |
| `ad7f776` | `0106` 보안 수정 + 회귀 확장(147) | ✅ |
| `70d57c5` | 넘김 버튼 + 사진 버튼 강조 (사용자 지적 반영) | ❌ **로컬만** |

### DB — `0103`~`0106` **운영에 적용·검증 완료**

객체를 재조회해 확인했다(명령 성공만으로 끝내지 않았다).

| | 무엇 |
|---|---|
| `0103` | `UNIQUE(session_id)` 제거 · `sort_order smallint not null default 0` · `CHECK(0..4)` · `UNIQUE(session_id, sort_order) DEFERRABLE` · 컬럼 단위 insert grant |
| `0104` | `reorder_workout_images()` · storage.objects 의 첫 DELETE 정책 |
| `0105` | `clear_workout_verification()` — **사진 0장일 때만** 동작 |
| `0106` | 삭제 정책을 "행이 가리키지 않는 객체만"으로 축소 |

**기존 사진 83장 무손상.** 전량 지문 `md5 = 91310e6bc4a0f73ac70e2181746d8e42` —
작업 시작 전과 **동일**. 83행 전부 `sort_order = 0`.

### 검증 결과

`typecheck` ✅ · `lint` **0 errors** · `vitest` **3509건 / 206파일 통과** · `next build` ✅
`rls-test` **147/147** · `challenge-photo-test` **8/8** · `--tier readonly` **6종 전부 통과**

---

## 2. ⛔ 건드리면 안 되는 것 (전부 이유가 있다)

| 하지 마라 | 왜 |
|---|---|
| `set_workout_verification` 이 `active` 를 받게 고치기 | 사진 **저장**과 운동 **인증**은 다른 사건이다. 저장은 RLS 가 이미 허용한다 |
| `deleteWorkoutImage` 의 **행 → 파일** 순서 뒤집기 | `0106` 정책이 행 있는 파일의 삭제를 막는다. 뒤집으면 삭제가 통째로 실패한다 |
| `0106` 의 `not exists (... workout_images ...)` 줄 지우기 | 행만 남기고 파일을 지우면 **사진 없이 `photo_required` 챌린지 크레딧**을 받는다 |
| `workout_images` 에 UPDATE grant/정책 열기 | 재정렬은 RPC 로 한다. `0096` 이 좁혀 둔 면이다 |
| `workout_sessions.verification_status` 에 UPDATE grant 주기 | 사진 없이 `camera_verified` 를 위조할 수 있게 된다 |
| `aspect-[4/3]` 을 `4/5` 로 바꾸기 | 2026-08-31 에 사용자가 화면을 보고 되돌린 결정이다 |
| `feed-item.tsx` 에 탭 지연 260ms 다시 넣기 | `PhotoCarousel` 이 이미 갖고 있다. 두 겹이 되면 520ms 로 굼떠진다 |
| `UNIQUE(session_id, sort_order)` 의 `DEFERRABLE` 빼기 | 재정렬을 두 문으로 쪼개는 순간 깨진다. 5장 채운 사람만 밟아서 개발 중엔 안 보인다 |
| 회귀 단언을 통과하게 고치기 | 2026-09-10 에 그 단언 하나가 **진짜 구멍**을 잡았다(`0106`). 원인을 먼저 봐라 |
| `record/page.tsx` 의 `onCountChange={...}` 배선 지우기 | 늦게 끝난 업로드를 결과 화면이 이어받는 **유일한 길**이다 (§3) |
| `ActivePhotoButton` 에서 `onCountChange` 를 **setState 업데이터 안**에서 부르기 | React 가 업데이터를 렌더 중에 돌려 "Cannot update a component while rendering" 이 난다. 되돌린 적 있다 (§3) |
| `active-photo-button.test.tsx` 의 *"부모에게 알리기"* 를 `vi.fn()` 부모로 되돌리기 | 그러면 위 버그를 **못 잡는다**. 진짜 setState 하는 부모라야 한다 |
| 결과 화면 재조회 효과가 **0행일 때도** 수를 덮게 고치기 | 아직 안 올라온 사진이 있을 수 있다. 0으로 덮으면 `onCountChange` 가 넣은 값을 지운다 |

---

## 3. ✅ 그 버그 — 고쳤다. 원인은 적어 둔 것과 달랐다

### 처음에 적어 둔 원인은 틀렸다

원래 이 자리에는 *"`ActivePhotoButton`이 세션 완료 뒤에도 오버레이에 남아 있다"* 고
적혀 있었다. **아니다.** 완료를 누른 뒤 화면을 100ms 간격으로 재 봤더니 그 버튼은
결과 화면이 뜨는 것과 **같은 순간에 사라진다**:

```
 ms=363    사진버튼 있음 · 결과화면 없음
 ms=15101  사진버튼 없음 · 결과화면 있음      ← 사이에 남아 있는 구간이 없다
```

### 진짜 원인 — 업로드를 기다리지 않는 설계와 완료 시점의 사진 수 세기

`ActivePhotoButton`은 업로드를 **`await` 하지 않는다.** 그게 그 컴포넌트의 요점이다
(땀나는 손이 버튼에 묶이면 안 된다). 그래서 완료를 누른 순간 **아직 올라가는 중인
사진**이 있을 수 있고, `handleComplete`가 세는 `listSessionPhotoRows`에는 그 행이
아직 없다. 그러면:

1. 결과 화면이 `resultPhotoCount = 0`으로 열려 **옛 `VerificationPhoto`**
   (아직 아무것도 없는 사람용)를 그린다 — 사진이 실제로는 있는데도.
2. `SessionPhotoManager`가 안 붙으니 **인증도 확정되지 않는다**
   → `verification_status = 'none'` → 달력·피드 스탬프가 안 찍힌다.

이게 인수인계서에 적힌 증상(`completed_at` 뒤에 사진, status `none`)과 정확히 맞는다.

### 고친 곳 세 군데

| 파일 | 무엇 | 왜 |
|---|---|---|
| `record/page.tsx` (`photoSlot`) | `ActivePhotoButton`에 **`onCountChange` 배선** | ⚠️ prop도 주석도 있었는데 **아무도 안 넘기고 있었다.** 버튼이 언마운트된 뒤에도 그 비동기 체인은 계속 도니, 늦게 끝난 업로드를 결과 화면이 이어받는 **유일한 길**이다 |
| `record/page.tsx` (효과) | 결과 화면 진입 시 사진 수 **1회 재조회** | `handleComplete`가 사진 수 읽기에 **실패하면** `catch`가 `setResultPhotoCount(0)`으로 덮는다. 그때만을 위한 그물. ⚠️ **0행이면 아무것도 안 한다** — 0으로 덮으면 `onCountChange`가 넣어 둔 값을 도로 지운다 |
| `session-photo-manager.tsx` | 마운트 때 사진 ≥1이면 `finalizeWorkoutVerification` 1회 | 사진이 어떤 경로로 생겼든 결과 화면은 반드시 지난다. 멱등이라 다시 써도 안전하다 |

⚠️ **`ActivePhotoButton`에서 확정을 부르는 것으로 고치지 마라** — 그쪽은 `active`
세션에서도 도는데 `set_workout_verification`은 `completed`만 받는다. (이 경고는 원래
인수인계서에 있던 그대로 유효하다.)

### 실측 증거 — 업로드를 18초 지연시켜 경합을 결정적으로 만든 뒤 측정

`window.fetch`를 감싸 **스토리지 업로드만** 18초 늦췄다(앱 코드는 안 건드렸다).

```
   16ms  완료 클릭 (업로드 진행 중)
 3694ms  POST rpc/complete_workout_v2 200
 3884ms  GET workout_images → 0행 · set_workout_verification 안 불림   ← 버그 재현
 4524ms  화면이 '사진을 올리면 여기에 표시돼요'(빈 상태)로 열림          ← 버그 재현
20153ms  업로드 끝 → POST workout_images 201
20304ms  POST rpc/set_workout_verification 200                        ← 마운트 확정
20524ms  화면 '오늘의 사진 1/5'                                        ← 스스로 나음
```

### ⚠️⚠️ 배선을 잇자마자 드러난 진짜 버그 — 렌더 중 setState

`onCountChange`를 넘기는 순간 개발 서버가 이걸 띄웠다:

> Cannot update a component (`WorkoutScreen`) while rendering a different
> component (`ActivePhotoButton`).

`setSaved(n => { onCountChange(n + 1); return n + 1; })` — React는 **업데이터 함수를
렌더 중에 실행한다.** 그 안에서 부모 setState를 부르면 안 된다. 다음 값을 `savedRef`
로 미리 알아내고 렌더 밖에서 알리도록 고쳤다.

⚠️ **부모를 `vi.fn()`으로 둔 기존 테스트는 이걸 못 잡는다** — setState를 안 하니까.
회귀 테스트(`active-photo-button.test.tsx` › *"부모에게 알리기"*)는 **진짜로 상태를
바꾸는 부모**를 세우고 `console.error`를 감시한다. 그 테스트를 지우지 마라.

⚠️ 테스트 3509건·lint·typecheck·build가 **전부 초록인 상태**에서 개발 서버 화면이
잡은 오류다. 이 저장소 `CLAUDE.md`가 왜 화면 확인을 요구하는지의 실례다.

### 남은 실측 잔재 — 픽스처 A 계정 (사용자 판단 필요)

운영 DB의 A(`헬스장주주`) 계정에 오늘 만든 **테스트 세션 4건**이 남아 있다.
과거 세션의 사진은 결과 화면이 in-memory라 UI로 지울 수 없다 — 지우려면
사용자가 결정해야 한다(파괴적이라 이번 범위 밖으로 뒀다).

| 시각 | 사진 | 비고 |
|---|---|---|
| 09:01 | 2장 | 이전 세션이 남긴 것. **지금은 `camera_verified`** — 인수인계서가 적은 `none`이 아니다 |
| 09:26 | 3장 | 캐러셀·순서 바꾸기 확인용 (빨강1·초록2·파랑3) |
| 09:36 | 1장 | 경합 확인용 |
| 09:40 | 1장 | 경합 확인용 |
| 09:45 | 0장 | 삭제 → 인증 해제 확인용. 지금 `✓ 완료` |

## 4. 화면 확인 — 남은 것은 **B 계정 2건**뿐

### ✅ 실측으로 끝난 것 (2026-09-10, 사용자 크롬 · A 계정)

| 확인 | 결과 |
|---|---|
| 운동 중 **골드 `📷 사진 0/5`** 버튼이 상태 배지 옆에 크게 보인다 | ✅ 사용자 지적 ② 해소 |
| 촬영 → `0/5 → 1/5 → 2/5` · 업로드 중에도 안 잠긴다 | ✅ |
| DB에 슬롯 0·1로 · `source=camera` · `client_captured_at` 있음 | ✅ |
| 결과 화면 썸네일 목록 · 슬롯 배지 · ✕ 삭제 · `N/5` | ✅ 3장까지 확인 |
| **◀ ▶ 순서 바꾸기** — 초록2를 1번으로, 슬롯 배지도 따라감 | ✅ RPC 204 정상 |
| 끝 사진에는 한쪽 화살표만 그린다 | ✅ 부정 확인 |
| **마지막 사진 삭제** → 행(204) → 파일(200) → `clear_workout_verification`(200) | ✅ 순서까지 확인 |
| 삭제 뒤 **달력 스탬프 🔥가 사라지고** `✓ 완료` + *"사진이 없어 챌린지 성과에 안 잡혀요"* | ✅ **부정 확인** |
| 사진 있는 세션은 🔥 카메라 인증 · `사진 더 붙이기 (N/5)` 정확 | ✅ |
| 피드 **캐러셀** — `1/3 → 2/3 → 3/3`, `‹ ›` 양쪽, 점 3개 | ✅ 사용자 지적 ① 해소 |
| 끝 장에서 `›`가 사라진다 · 첫 장에서 `‹`가 없다 | ✅ 부정 확인 |
| **점을 눌러** 3/3 → 1/3 점프 (탭 영역 24×32px) | ✅ |
| 1장 카드에 **카운터·점·화살표가 없다** | ✅ 부정 확인 |
| 장수와 무관하게 카드 높이 일정 (4:3) | ✅ |
| §3 경합 버그 재현 → 스스로 나음 | ✅ §3 타임라인 |

### ⛔ 아직 못 한 것 — **B 계정이 필요하다. 사용자가 해 주셔야 한다**

1. **[미검증] B(크루)가 A의 게시물 사진 전 장을 넘길 수 있는가** · 좋아요/댓글
2. **[미검증] 비크루에게는 안 보이는가** (부정 확인)

**왜 제가 못 했나.** 이 세션의 브라우저 도구는 **사용자 크롬 하나**만 몹니다.
거기서 B로 로그인하면 **A 세션이 밀려납니다**(쿠키가 프로필 단위). 시크릿 창·엣지는
이 도구로 못 엽니다. 그리고 `DEV_FIXTURE_PASSWORD` 읽기는 이 세션에서 차단됐습니다.

**사용자가 하실 일** — 엣지(또는 크롬 시크릿 창)에서 `http://localhost:3000/login`,
`dev-fixture-b@gnd.local` / `.env.local`의 `DEV_FIXTURE_PASSWORD` 로 로그인한 뒤 피드:

| 볼 것 | 기대 |
|---|---|
| A의 09:26 게시물 | `1 / 3` 카운터 · `‹ ›` · 점 3개 |
| `›`를 두 번 | 초록2 → 빨강1 → 파랑3, `3 / 3`에서 `›` 사라짐 |
| 하트 · 댓글 | A 화면/알림에 반영 |
| A의 09:45 게시물(사진 0장) | 카운터·점·화살표 **없음** |

### 파일 선택 대화상자를 못 여는 문제 (에이전트용)

OS 파일 선택창은 자동화가 못 만진다. 대신 **숨은 input에 진짜 JPEG를 넣어
`change`를 쏘면** 앱 코드 경로(압축 → 업로드 → RLS → DB)는 그대로 탄다.

```js
window.__makeJpeg = (label, color) => {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 900;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 1200, 900);
  x.fillStyle = '#fff'; x.font = 'bold 380px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 600, 450);
  return new Promise(r => c.toBlob(b => r(new File([b], 'p.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9));
};
const input = document.querySelector('input[type=file][capture]');   // capture 없는 쪽이 앨범
const dt = new DataTransfer(); dt.items.add(await window.__makeJpeg('1', '#e11d48'));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

⚠️ 이건 **OS 대화상자만** 건너뛴다. 압축·업로드·RLS·DB는 진짜로 돈다.

### 🔧 경합을 결정적으로 만드는 법 (§3을 다시 확인할 때)

`window.fetch`를 감싸 **스토리지 업로드만** 늦춘다. 앱 코드는 안 건드린다.

```js
const orig = window.fetch;
window.fetch = function (...a) {
  const url = typeof a[0] === 'string' ? a[0] : a[0]?.url ?? '';
  const method = a[1]?.method ?? a[0]?.method ?? 'GET';
  if (method === 'POST' && /\/storage\/v1\/object\/workout-images\//.test(url)) {
    return new Promise(r => setTimeout(r, 18000)).then(() => orig.apply(this, a));
  }
  return orig.apply(this, a);
};
```

그 뒤 **사진을 넣고 곧바로 `운동 완료`를 누른다**. 고치기 전이라면 결과 화면이
빈 상태로 열린 채 그대로 있고, 고친 뒤라면 업로드가 끝나는 순간 `오늘의 사진 1/5`로 바뀐다.

## 5. 푸시 상태

이 문서를 쓴 시점에 **로컬에만 있는 커밋이 있는지 직접 확인해라.**

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...main   # 0 0 이어야 한다
git ls-remote --symref origin HEAD                     # 기본 브랜치는 서버에 직접 묻는다
```

⚠️ **운영 DB에는 `0103`~`0106`이 이미 적용돼 있다.** 저장소가 뒤처지면 다음
사람이 DB와 코드가 어긋난 것을 모른다 — 이어서 작업하면 푸시해라.

⛔ **배포는 아직 안 했다.** `vercel --prod`는 사용자가 따로 승인한다.

## 6. 새로 생긴 파일·바뀐 계약

### 새 파일

| 파일 | 무엇 |
|---|---|
| `src/lib/domain/workout-photos.ts` | 상한(5) · 슬롯 배정 · 정렬 · 인증 등급 판정 · `movePhoto` (순수) |
| `src/components/feed/photo-carousel.tsx` | 4:3 캐러셀 (스냅 스와이프 · ‹ › · 점 · `N/M`) |
| `src/components/record/active-photo-button.tsx` | 운동 중 `📷 사진 N/5` |
| `src/components/record/session-photo-manager.tsx` | 완료 화면 썸네일 관리 (추가·삭제·◀▶) |

### 바뀐 계약 (호출부가 있으면 같이 봐야 한다)

- `FeedItem.photoUrl: string | null` → **`FeedItem.photos: SessionPhoto[]`**
- `uploadWorkoutImage()` 는 이제 **저장만** 한다. 인증은 `finalizeWorkoutVerification()`
- `canAttachPhotoLater({ hasPhoto })` → **`{ photoCount }`**
- `CalendarSession` 에 **`photoCount`** 추가 (`getCompletedSessions` 가 임베드로 센다)

### 새 함수 (`src/lib/workout.ts`)

`listSessionPhotoRows` · `listSessionPhotos` · `finalizeWorkoutVerification` ·
`reorderWorkoutImages` · `deleteWorkoutImage`

---

## 7. 알아 두면 좋은 것

- **`pnpm db:snapshot` 은 `storage.objects` 정책을 한 줄도 안 담는다.** 새 DELETE
  정책뿐 아니라 **기존 upload/read 정책도 0건**이다. 스토리지 정책 회귀는 스키마
  diff 로 절대 안 잡히고, **`rls-test.mjs` 가 유일한 감시자**다.
- **고아 스토리지 객체 95개의 정체가 밝혀졌다** — 88개가 `test.jpg`·`priv.jpg`·
  `slot*.jpg`, 즉 `rls-test.mjs` 가 과거에 남긴 찌꺼기다(0104 전에는 지울 수단이
  없었다). 이제 스크립트가 자기 뒷정리를 한다. **남은 88개 정리는 파괴적이라
  사용자 승인이 필요하다** — 이번 범위 밖.
- `reorder_workout_images` 는 `void` 를 돌려줘서 PostgREST 가 **204** 를 준다.
  `status === 200` 으로 단언하면 성공을 실패로 신고한다.
- 회귀 기준선은 `scripts/regression-baselines.json` 이 갖는다. `rls-test` = **147**.

---

## 8. 이번 범위가 아닌 것

동영상 · 릴스 · 자유 게시물 · `feed_posts` · 해시태그 · 필터 · 사진 편집 ·
위치/사람 태그 · SNS 공유 · 북마크 · DM · 5장 초과 · 새 XP 규칙 · 새 챌린지 규칙 ·
라이트박스 안에서 좌우로 넘기기(피드 캐러셀이 우선) · 고아 객체 88개 정리 ·
**프로덕션 배포**.
