# 인수인계 — 운동 다중 사진 + 피드 캐러셀 (2026-09-10)

**한 줄**: 기능 구현은 **끝났다**. DB 4건 적용·검증 완료, 자동 테스트 전부 초록.
**남은 것은 화면 확인 마무리와 아래 §3의 미해결 버그 1건**이다. **배포하지 마라.**

- 계획서(설계 근거 전량): [`plans/2026-09-10-workout-multi-photo-carousel.md`](plans/2026-09-10-workout-multi-photo-carousel.md)
- 이 문서는 **지금 당장 이어서 할 일**만 적는다. 왜 그렇게 만들었는지는 계획서에 있다.

---

## 0. 먼저 이것부터 (30초)

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...main   # 0 1 이면 아래 §5 참조
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

---

## 3. ⚠️⚠️ 미해결 버그 1건 — 다음 사람이 첫 번째로 할 일

### 증상

**운동 완료 직후 `"잠시 후 결과 화면으로 넘어가요…"` 구간에서 사진을 찍으면,
사진은 저장되는데 `verification_status` 가 `none` 으로 남는다.**

실측(2026-09-10, 세션 `f261c634-0719-4f54-a866-34c2fe0363dd`):

```
completed_at    2026-09-10 00:01:06   ← 완료 핸들러가 여기서 돌았다 (사진 0장)
first_photo_at  2026-09-10 00:01:46   ← 그 뒤에 찍었다
verification_status = 'none'          ← 사진 2장이 있는데도
```

### 왜 생기나

`ActivePhotoButton`(운동 중 사진 버튼)이 **세션이 completed 된 뒤에도 오버레이에
그대로 남아 있다.** 인증 확정은 `record/page.tsx` 의 완료 핸들러가 **한 번만**
부르므로, 그 이후에 생긴 사진은 확정될 기회가 없다.

계획 §9 의 *"서버와 화면의 인증 상태가 어긋나면 안 된다"* 위반이다.
달력·피드 스탬프가 사진이 있는데도 안 찍힌다.

### 고치는 법 (권장)

`SessionPhotoManager` 가 **처음 목록을 읽었을 때 사진이 1장 이상이면
`finalizeWorkoutVerification(sessionId)` 을 한 번 부른다.**
`set_workout_verification` 은 같은 값을 다시 써도 안전하고(멱등),
사진이 어떤 경로로 생겼든 결과 화면에 닿는 순간 상태가 맞춰진다.

- 파일: `src/components/record/session-photo-manager.tsx` 의 마운트 `useEffect`
- ⚠️ **`ActivePhotoButton` 에서 확정을 부르는 것으로 고치지 마라** — 그쪽은
  `active` 세션에서도 도는데 `set_workout_verification` 은 `completed` 만 받는다
- 테스트: `session-photo-manager.test.tsx` 에 *"사진이 있으면 마운트 때 인증을
  한 번 확정한다"* + *"사진이 0장이면 부르지 않는다"* 두 건

### 정리해야 할 실측 잔재

위 세션 `f261c634…` 에 **테스트로 넣은 사진 2장**이 운영 DB 에 남아 있다
(픽스처 A `헬스장주주` 계정, 빨강 `1` · 초록 `2` 이미지). 위 버그를 고친 뒤
결과 화면에서 지우거나, 확인이 끝나면 정리해라.

---

## 4. 남은 화면 확인 (사람 손이 필요하다)

### 이미 실측으로 끝난 것

| 확인 | 결과 |
|---|---|
| 운동 중 📷 버튼이 상태 배지 옆에 보인다 | ✅ |
| 촬영 → `0/5 → 1/5 → 2/5` | ✅ |
| 업로드 중에도 버튼이 안 잠긴다 (`disabled: false`) | ✅ |
| DB 에 슬롯 0·1 로 들어간다 · `source=camera` · `client_captured_at` 있음 | ✅ |
| 피드 캐러셀이 뜬다 (사용자 화면에서 `1 / 2` + 점 2개 확인) | ✅ |
| 1장·3장·5장 카드가 전부 341×256 (ratio 1.333) — 장수와 높이 무관 | ✅ |
| 1장 카드에 점·카운터·트랙이 **없다** (부정 확인) | ✅ |

### 아직 못 한 것

1. **[미검증] 실제 손가락 스와이프** — 브라우저 패널이 숨겨져 있으면 드래그가
   30초 타임아웃으로 죽는다. **패널을 띄운 채로** `left_click_drag` 를 하거나
   폰에서 확인해라.
2. **[미검증] 완료 화면 사진 관리** — 썸네일 목록 · 추가 · ✕ 삭제 · ◀▶ 순서.
   §3 버그 때문에 아직 결과 화면까지 못 갔다.
3. **[미검증] 마지막 사진 삭제** → *"사진을 모두 지워서 인증이 풀렸어요"* 토스트
   + 달력 스탬프가 사라지는지(부정 확인).
4. **[미검증] B 계정(크루)** — A 게시물의 **사진 전 장**이 넘겨지는가 · 좋아요/댓글.
5. **[미검증] 비크루 차단** (부정 확인).

### 두 계정 확인 방법

```bash
node scripts/dev-fixture.mjs status     # A: 헬스장주주 · B: 근육은퇴근중
```

- A `dev-fixture-a@gnd.local` · B `dev-fixture-b@gnd.local`
- 비밀번호는 `.env.local` 의 `DEV_FIXTURE_PASSWORD`
- ⚠️ **같은 브라우저 프로필의 새 탭/창으로는 안 된다** — 쿠키가 프로필 단위라
  나중 로그인이 앞의 것을 덮는다. 크롬 = A, 엣지 = B
- ⚠️ **에이전트가 모는 인앱 브라우저는 쿠키 저장소가 별개다.** 사용자가 자기
  크롬에서 로그인해도 안 넘어온다 — 패널 안에서 따로 로그인해야 한다
  (2026-09-10 에 이걸로 한 번 헛돌았다)

### 파일 선택 대화상자를 못 여는 문제 (에이전트용)

OS 파일 선택창은 자동화가 못 만진다. 대신 **숨은 input 에 진짜 JPEG 를 넣어
`change` 를 쏘면** 앱 코드 경로(압축 → 업로드 → 카운트)는 그대로 탄다.

```js
function makeJpeg(label, color) {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 700;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 900, 700);
  x.fillStyle = '#fff'; x.font = 'bold 220px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 450, 350);
  return new Promise(r => c.toBlob(b => r(new File([b], 'p.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9));
}
const input = document.querySelector('input[type=file][capture]');
const dt = new DataTransfer(); dt.items.add(await makeJpeg('1', '#e11d48'));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

⚠️ 이건 **OS 대화상자만** 건너뛴다. 압축·업로드·RLS·DB 는 진짜로 돈다.

---

## 5. 푸시 상태

`70d57c5` **하나가 로컬에만 있다** (`origin/main...main` = `0 1`).
나머지 6개는 원격에 올라가 있다(`origin/main` = `ad7f776`).

```bash
git push origin main
git fetch origin --prune && git rev-list --left-right --count origin/main...main   # 0 0
```

⚠️ **운영 DB 에는 `0103`~`0106` 이 이미 적용돼 있다.** 저장소가 뒤처지면 다음
사람이 DB 와 코드가 어긋난 것을 모른다 — 이어서 작업하면 푸시해라.

---

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
