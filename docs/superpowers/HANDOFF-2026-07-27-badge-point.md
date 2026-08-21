# 인수인계 — 배지 30종 + 포인트 경제 (2026-07-27 중단 시점)

> 이 문서 하나만 읽으면 이어서 작업할 수 있게 썼다.
> 계획서 전문: `docs/superpowers/plans/archive/2026-07-27-badge-catalog-and-point-economy.md`
> 설계 전문: `docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md`

---

## 0. 한 줄 요약

배지를 3개 → **30종**으로 늘리고 **포인트 경제**를 붙이는 작업.
**PHASE A(DB 엔진)·B(조회)·Task 7~8(컴포넌트) 완료. Task 9(배선)부터 남았다.**

---

## 1. 지금 상태

**브랜치** `main` · **마지막 커밋** `62c9789` · **작업 트리 깨끗함**(추적 파일 변경 없음)

### 완료한 커밋 (최신순)

```
62c9789 feat: 프로필 포인트 요약 3칸 + 배지 진열·전체 시트
7028b0e refactor: 배지 카탈로그를 DB 단일 원천으로 + 지갑 조회
a63c9ce test: 배지·포인트 엔진 실 DB 검증 + 불꽃 SQL↔TS 대조
98d7bbf feat: 0032 배지 판정·포인트 지급 엔진
266e188 feat: 0031 배지 정의·포인트 원장 스키마 + 30종 seed
0b0ce5d feat: 배지 이미지 재생성 — 티어 색 구분 개선
22e38f9 docs: 배지 30종·포인트 경제 구현 계획 (0031~0033)
```

### 마이그레이션 적용 상태

| 파일 | 운영 적용 | 내용 |
|---|---|---|
| `0031_badge_point_schema.sql` | ✅ **적용됨** | 4테이블 + 배지 30종 seed |
| `0032_badge_point_engine.sql` | ✅ **적용됨** | 판정·지급 엔진, RPC 4개 재정의 |
| `0033_badge_initial_evaluation.sql` | ❌ **아직 안 만듦** | 기존 실적 소급 (Task 11) |

**0022~0032는 수정 금지.** 다음 번호는 **0033**.

### 검증 실측 (전부 통과)

```
node scripts/badge-point-check.mjs      → 14/14
node scripts/streak-parity-check.mjs    → 불일치 0건 (실계정 9개)
pnpm vitest run src/lib/domain/badges.test.ts        → 10/10
pnpm vitest run src/lib/badge-keys.test.ts           → 3/3
pnpm vitest run src/components/profile/point-summary.test.tsx    → 4/4
pnpm vitest run src/components/profile/badge-showcase.test.tsx   → 8/8
```

### ⚠️ 타입 검사가 지금 깨져 있다 (의도된 상태)

`pnpm typecheck`는 **실패한다.** Task 5에서 `badgeShelf(catalog, earned)`로
시그니처를 바꿨는데 호출부 두 곳이 아직 옛 형태이기 때문이다:

- `src/components/record/badge-shelf.tsx` — Task 9에서 **삭제**할 파일
- `src/components/crew/member-profile-sheet.tsx` — Task 9에서 고칠 파일

**Task 9를 끝내면 회복된다.** 계획서에 예고된 지점이므로 놀라지 말 것.

---

## 2. 남은 작업 — Task 9부터

계획서의 해당 Task를 그대로 따르면 된다. 코드가 전부 들어 있다.

### Task 9 — 배선 · 기록 탭 정리 · 크루 시트 대응 ← **여기부터**

네 가지를 한 커밋으로 묶는다. 타입 검사가 여기서 회복된다.

1. **`src/components/profile/growth-hub.tsx`** — `PointSummary`·`BadgeShowcase`·
   `BadgeSheet`를 배선. `HubData`에 `balance`·`streakDays`·`shelf` 추가.
   불꽃은 **홈 🔥와 같은 `currentStreak()`으로 계산**해야 화면끼리 안 어긋난다.
2. **`src/components/record/calendar-view.tsx`** — `BadgeShelf` import와 사용(432행) 삭제
3. **`git rm src/components/record/badge-shelf.tsx`** — 프로필로 일원화
4. **`src/components/crew/member-profile-sheet.tsx`** — `MemberProfileBody`가
   `catalog`를 prop으로 받도록. 셸에서 `getBadgeCatalog()`를 함께 조회.
   배지 칩을 이모지 대신 `/badges/{key}.png` 이미지로.
   테스트 픽스처에 `periodKey` 추가 + `CATALOG` 상수 추가.

> 중단 직전에 growth-hub.tsx의 import·`HubData`만 고쳤다가 **되돌렸다.**
> 계획서 Task 9 Step 1~3에 그 코드가 그대로 있으니 처음부터 다시 하면 된다.

### Task 10 — 완료 모달에 포인트·배지

`WorkoutXpResult`에 `pointsAwarded`·`pointMultiplier`·`streakDays`·`newBadges` 추가 →
`XpEvent`에 `point`·`badge` 갈래 추가 → 모달에 렌더. TDD로 테스트 먼저.

### Task 11 — 0033 기존 실적 소급 ← **SQL Run 필요**

배지 30종이 생겼지만 판정은 운동 완료 때만 돈다. 이미 쌓인 실적에 한 번 돌려야
도입 즉시 진열대가 채워진다. `evaluate_badges`가 멱등이라 여러 번 돌려도 안전.

**예상 결과** — 스칼레또 7종 · 오뎅끼데스까 6종 · 낭만송곳니 1종 근처.

### Task 12 — 게이트 · 실기기 · 배포

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` →
실 DB 스크립트 2종 → 사용자 실기기 확인 → `pnpm dlx vercel deploy --prod --yes` →
번들 grep(`GND 포인트`·`포인트 배수`·`보유 배지`) → `PROGRESS.md` 갱신.

---

## 3. 콜드 에이전트가 알아야 할 것

### 이 프로젝트의 규칙

- **게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- **커밋 시점:** 자동 검증 → **사용자 실기기 확인** → 그다음 커밋·배포
- **마이그레이션은 에이전트가 못 돌린다.** 파일을 만들고 사용자에게 SQL Editor
  Run을 요청한 뒤 기다린다. Run 전에 검증 스크립트를 돌리면 전부 실패한다.
- 테스트 관례: 순수 도메인 `src/lib/domain/*.test.ts`, 컴포넌트는
  `renderToStaticMarkup` SSR. 훅·이벤트가 필요하면 파일 상단에
  `// @vitest-environment jsdom`.

### 설계의 핵심 결정 (이유까지)

| 결정 | 이유 |
|---|---|
| 배지 조건을 `badge_definitions` **테이블**로 | 30종을 SQL 함수에 하드코딩하면 유지 불가. 배지 추가 = seed 한 줄 |
| 포인트는 **운동마다 + 배지 보너스** | 배지에서만 나오면 다 딴 순간 수입이 끊기고 ⚡배수가 곱할 대상을 잃는다 |
| 불꽃은 **홈 🔥와 같은 사슬 규칙** | 앱 전체가 이미 이 숫자를 쓴다. 두 숫자가 공존하면 버그로 보인다 |
| 불꽃 배지는 **5일마다 스택** | "사슬 끊긴 뒤 재달성" 방식이면 **배지를 더 받으려 5일 쉬는 게 이득**이 된다 |
| 반복 배지 멱등키 = **달성한 날(KST)** | 불꽃은 하루 최대 1만 늘어 같은 이정표를 같은 날 두 번 못 밟는다. 사슬 시작일 계산이 불필요해진다 |
| 하루 2번째 운동은 **포인트도 0** | XP만 제한하면 하루에 짧게 여러 번 끊어 하는 악용이 생긴다 |

### 조용히 틀릴 수 있는 지점 (전부 테스트로 막아뒀다)

1. **불꽃 SQL ↔ TS** — 갈라지면 홈 🔥와 배지가 다른 숫자를 말한다.
   `scripts/streak-parity-check.mjs`가 실계정으로 대조한다.
2. **배수 구간표** — SQL `point_multiplier`와 `point-summary.tsx`의 `TIERS`가
   같아야 한다. 화면이 안내한 배수와 실제 지급액이 달라진다.
   `point-summary.test.tsx`가 경계 10개를 고정한다.
3. **배지 키 ↔ 이미지 파일명** — 어긋나면 배지를 따도 깨진 이미지가 뜬다.
   `src/lib/badge-keys.test.ts`가 seed와 `public/badges/`를 대조한다.

### 배지 이미지

`public/badges/` **30장 완성** · 384×384 · 36~52KB · 합계 1.35MB.
파일명 = `badge_key`. 티어별 프레임(브론즈 구리 / 실버 / 골드 보석 / 레전드 방패+무지개).

배지를 추가·재생성할 때는 `docs/badge-asset-prompts.md`를 읽고
`node scripts/slice-badge-sheets.mjs`로 시트를 자른다. **sharp가 프로젝트
의존성이 아니라** 별도 설치가 필요하다(스크립트 상단 주석 참조).

---

## 4. 범위 밖 — 다음 스펙으로 넘길 것

- **아이템 상점·구매·장착.** 포인트를 *쓰는* 쪽(`spend`)은 스키마에만 있고 UI가 없다.
- **가격표 재산정.** 목업의 롤렉스 1,500P는 이 수입 구조(운동당 100P × 배수)에서
  운동 15회면 사진다 — 조던(1,200P)과 값이 같아 명품의 위계가 사라진다.
  설계 §5.4에 적어뒀다.
- **드림 아이템 진행바**(목업 좌측 하단), **포인트 내역 화면**.
  `getRecentPointTransactions()`는 만들어 뒀으나 아직 아무 데도 안 쓴다.
- **프로필 화면 재배치.** 목업에는 지금 `/profile`에 있는 5개 섹션(레벨 혜택·
  다음 단계·성장 타임라인·XP 내역·XP 안내 버튼)이 없다. 어디로 옮길지 미정.

---

## 5. 이어서 시작하는 법

```
1. docs/superpowers/plans/archive/2026-07-27-badge-catalog-and-point-economy.md 를 연다
2. "Task 9" 섹션부터 그대로 따라간다 (코드가 전부 들어 있다)
3. Task 9를 끝내고 pnpm typecheck 가 통과하는지 확인한다  ← 회복 지점
4. Task 11에서 사용자에게 0033 Run을 요청한다
5. Task 12에서 실기기 확인 후 배포한다
```
