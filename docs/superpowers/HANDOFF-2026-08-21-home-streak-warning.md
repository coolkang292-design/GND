# 홈 스트릭 소멸 경고 복원 — 인수인계

> 작성일: 2026-08-21 (구현·검증 결과는 같은 날 §11에 덧붙였다)
> 저장소: `C:\Users\SAMSUNG\workout-app`
> 브랜치: `main` (계획 작성 시 `11f829b` → 구현은 `255dbbd` 위에 올렸다)
> 상태: ✅ **구현·개발 서버 화면 확인 완료. 배포만 남았다 — 사용자 승인 대기.**

---

## 1. 다음 에이전트의 단 하나의 다음 행동

⚠️ **§4의 구현은 끝났다.** 결과와 실측은 **§11**에 있다. 남은 것은 **사용자 승인 후
배포**(§6)뿐이다. 아래 §2~§5는 *왜 그렇게 만들었는지의 기록*으로 남긴다 — 이 배너를
다시 손댈 때 읽어야 할 이유들이 거기 있다.

할 일은 **하나뿐이었다**: 홈에서 사라진 **스트릭 소멸 경고 배너**를 되살린다.
7일 점·헤더 한 줄·옛 스트릭 카드는 **되살리지 않는다** (§3 참조).

---

## 2. 어쩌다 이 일이 생겼나

2026-08-21에 홈 상단을 `나의 오늘` + `오늘의 크루` 두 카드로 개편하면서
`StreakCard`·`WeeklyStats`·`CharacterCard`·`HeaderStreak`를 홈에서 뺐다.

승인 설계서 §5는 *"성장·스트릭·주간 통계 카드 — **데이터는 모두 내 카드에 통합**,
별도 중복 카드만 제거"* 라고 적었는데, 구현은 **숫자만** 옮기고 두 가지를 빠뜨렸다.

| 옛 `StreakCard`가 갖던 것 | 지금 |
|---|---|
| `연속 N일` 숫자 | ✅ `나의 오늘` 카드의 `연속` 칸에 있다 |
| 최근 7일 점 (요일별 ●○) | ❌ 빠졌다 — **되살리지 않기로 했다** |
| **소멸 경고 배너** (`⚠️ …`) | ❌ 빠졌다 — **이것만 되살린다** |

사용자가 배포 후 화면을 보고 *"홈 화면에 스트릭 정보가 빠졌네"* 라고 지적했고,
선택지를 드린 결과 **"소멸 경고만 되살린다"** 를 골랐다.

경고가 중요한 이유: 나머지는 표시고, 이건 **"오늘 안 하면 끊긴다"를 알려 주는
행동 유발 장치**다. 평소엔 안 뜨므로 높이 비용도 0이다.

---

## 3. 범위 — 하지 말 것

- ❌ 7일 점을 되살리지 마라 (사용자가 고르지 않았다)
- ❌ 헤더 한 줄(`11일 연속 · 오늘 완료`)을 되살리지 마라 — 카드의 `연속 N일`과
  같은 숫자를 두 번 말한다. `header-streak.tsx`의 주석이 이유를 적고 있다
- ❌ `StreakCard`를 홈에 다시 렌더하지 마라 — `home-client.order.test.ts`가
  `<StreakCard`의 부재를 단언한다. **그 단언을 지우지 마라**
- ❌ DB·RPC·마이그레이션 변경 없음. 이 작업에 필요 없다
- ❌ 내 카드와 크루 카드 **사이에** 배너를 끼우지 마라 — §5 참조

---

## 4. 구현 계획 (TDD)

### Task 1 — 실패 테스트를 먼저 쓴다

파일: `src/components/home/personal-today-card.test.tsx`

`PersonalTodayCard`는 이미 `completedAts`와 `now`를 받으므로 **새 prop이 필요 없다.**
카드 안에서 `streakStage`·`daysSinceLastWorkout`로 단계를 구해 배너를 그린다.

써야 할 단언:

```tsx
// d4 = 마지막 운동이 어제. 경고가 뜬다.
it("스트릭이 끊길 위험이면 소멸 경고를 띄운다", () => {
  renderCard({ completedAts: [YESTERDAY], status: "idle" });
  const warn = screen.getByRole("alert");
  expect(warn.textContent).toContain("소멸 D-4");
  expect(warn.textContent).toContain("1일"); // 스트릭 수가 문구에 들어간다
});

// 오늘 이미 했으면 재촉하지 않는다
it("오늘 운동을 마쳤으면 경고를 띄우지 않는다", () => {
  renderCard({ completedAts: [TODAY], status: "done" });
  expect(screen.queryByRole("alert")).toBeNull();
});

// 기록이 아예 없거나 이미 소멸한 사람에게는 경고가 없다
it("기록이 없거나 이미 소멸했으면 경고가 없다", () => {
  renderCard({ completedAts: [] });
  expect(screen.queryByRole("alert")).toBeNull();
  cleanup();
  renderCard({ completedAts: [LONG_AGO] }); // 5일 이상 전
  expect(screen.queryByRole("alert")).toBeNull();
});

// 배너는 누를 수 있는 것이 아니다
it("경고는 링크도 버튼도 아니다", () => {
  renderCard({ completedAts: [YESTERDAY] });
  const warn = screen.getByRole("alert");
  expect(warn.closest("a")).toBeNull();
  expect(warn.querySelector("button")).toBeNull();
});
```

⚠️ **문구를 통째로 하드코딩하지 마라.** `pickByDay`가 `todayKey`로 변형을 고른다 —
`now`를 고정하면 결정적이지만, 문구 전체를 박으면 카피를 다듬는 순간 깨진다.
`소멸 D-4` 같은 **단계 표식**과 **스트릭 숫자**만 단언한다.

⚠️ **가짜 통과 점검을 반드시 하라.** 배너 렌더 한 줄을 지웠을 때 위 네 건 중
**첫 번째가 빨개지는지** 눈으로 확인하고 되돌려라 (`CLAUDE.md` §테스트가 진짜
테스트인지 확인한다).

### Task 2 — 카드에 배너를 넣는다

파일: `src/components/home/personal-today-card.tsx`

이미 import된 것: `currentStreak`, `workoutDayKeys`, `dayKey`, `DEFAULT_TIMEZONE`.
추가로 필요한 것:

```ts
import { daysSinceLastWorkout, streakStage } from "@/lib/domain/streak";
import { pickByDay, STAGE_MESSAGES } from "@/lib/domain/streak-messages";
```

옛 `streak-card.tsx:44-47`의 판정을 **그대로** 가져온다 (규칙을 다시 쓰지 마라):

```ts
const keys = workoutDayKeys(completedAts, tz);
const todayKey = dayKey(now, tz);
const stage = streakStage(keys, todayKey);
const warning =
  streak > 0 && STAGE_MESSAGES[stage]
    ? pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)
    : undefined;
```

⚠️ `STAGE_MESSAGES`는 `Partial<Record<StreakStage, …>>`라 **`d4`·`d3`·`d2`·`d1`에만
값이 있다.** `today_done`·`expired`·`none`은 자동으로 `undefined`가 되어 경고가
안 뜬다 — 이게 "평소엔 안 보인다"의 구현이다. 조건을 손으로 더 붙이지 마라.

⚠️ **단계마다 말할 수 있는 손실이 다르다.** 이 앱의 스트릭은 5일 유예다
(`STREAK_EXPIRY_DAYS = 5`). 어제 운동한 사람(d4)에게 "오늘 안 하면 리셋"은
**거짓말**이다 — `streak-messages.ts`의 주석이 이 사실을 길게 설명한다.
문구를 직접 짓지 말고 `STAGE_MESSAGES`를 그대로 써라.

마크업 — 옛 `streak-card.tsx:83-87`의 색을 유지하되 `role="alert"`를 붙인다:

```tsx
{warning && (
  <p
    role="alert"
    className="mt-3 rounded-card-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400"
  >
    ⚠️ {warning}
  </p>
)}
```

### Task 3 — 어디에 두는가

**`PersonalTodayCard` 안, 주 행동(CTA·칭찬 배너) 바로 아래.**

⚠️ **카드 밖(내 카드와 크루 카드 사이)에 두지 마라.** `home-client.tsx`의 주석이
*"사이에 다른 카드를 끼우지 마라 — 그 순간 비교가 스크롤 너머로 갈라진다"* 고
적어 뒀다. 경고는 내 스트릭 이야기이므로 내 카드 안이 맞다.

⚠️ 금색 CTA **아래**다. 위에 두면 오늘 눌러야 할 것보다 경고가 먼저 읽힌다 —
이 카드의 목적은 "비교하고 바로 누르는 것"이다.

---

## 5. 검증 — 테스트 통과만으로 완료 처리 금지

### 자동

```powershell
pnpm vitest run src/components/home/personal-today-card.test.tsx src/components/home/home-client.order.test.ts src/lib/domain/streak-messages.test.ts
```

기대: 전부 통과. `home-client.order.test.ts`의 `<StreakCard` 부재 단언이 **여전히
초록**이어야 한다 (옛 카드를 되살린 게 아니다).

### 개발 서버 화면 확인 — 이게 진짜 관문이다

⚠️ **아래 함정 넷은 2026-08-21에 실제로 겪은 것이다. 그대로 따르면 시간을 아낀다.**

1. **3000 포트에 다른 세션의 dev 서버가 있을 수 있다.** Next 16은 같은 폴더에서
   두 번째 dev 서버를 **거부한다**. 남의 서버를 죽이지 말고 워크트리를 따로 떠라:

   ```bash
   git worktree add --detach <scratch>/dev-verify HEAD
   cp .env.local <scratch>/dev-verify/.env.local
   cd <scratch>/dev-verify && pnpm install --prefer-offline
   ```

2. ⚠️ **`node_modules`를 junction으로 걸지 마라.** Turbopack이
   `Symlink [project]/node_modules is invalid, it points out of the filesystem root`
   로 죽는다. 워크트리에서 `pnpm install`을 새로 돌려라 (15초면 끝난다).

3. ⚠️ **워크트리 서버는 커밋된 스냅샷을 본다.** 편집할 때마다
   `cp -r src/components src/lib <worktree>/src/` 로 밀어 넣고 새로고침해야
   화면이 바뀐다. 안 하면 "고쳤는데 화면이 그대로"에 빠진다.

4. ⚠️ **브라우저 패널 세션이 익명 계정으로 떨어질 수 있다.** 그러면 `/onboarding`으로
   튕긴다. 에이전트는 비밀번호를 입력하지 않으므로 **사용자에게 로그인을 요청**해야
   한다 (`dev-fixture-a@gnd.local` / `.env.local`의 `DEV_FIXTURE_PASSWORD`).
   현재 로그인 계정은 쿠키 `sb-<ref>-auth-token`(`.0`+`.1` 조각)을 base64 디코드해
   `user.email`로 확인할 수 있다.

**직접 볼 것** (375×812, `dev-테스터A`):

| 확인 | 기대 |
|---|---|
| A가 **오늘 운동 전**이고 어제 했으면 | 카드 하단에 주황 `⚠️ …(소멸 D-4)` 배너 |
| A가 **오늘 완료**면 | 배너 **없음** ← 부정 확인이 핵심이다 |
| `나의 오늘` 카드 높이 | 배너가 뜬 상태로도 **330px 이내** (2026-08-21 실측 280px, 배너 ~40px) |
| 크루 두 행 | 배너가 떠도 하단 탭 **위**에 남는가 (탭 top = 754px) |
| 콘솔 오류 | 0건 |

⚠️ 사용자 계정은 대개 **오늘 이미 운동**해서 배너가 안 뜬다. 그때는 "안 뜨는 것"이
정상이고, 뜨는 쪽을 보려면 어제만 운동한 계정이 필요하다. **검증하자고 운영 운동
기록을 지우지 마라.** 못 보면 못 봤다고 적어라.

### 전체 게이트

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

회귀 스크립트(`pnpm verify:regression`)는 **돌리지 않는다** — DB·RPC·RLS를 하나도
바꾸지 않는다.

---

## 6. 배포

**사용자 승인 없이 배포하지 마라.** 절차는 `CLAUDE.md`가 단일 원천이다. 요약:

```bash
git worktree add --detach <scratch>/deploy main
cp .env.local <scratch>/deploy/ && cp -r .vercel <scratch>/deploy/
cd <scratch>/deploy && pnpm install && npx next build
npx vercel@latest --prod --yes
```

배포 후 **프로덕션 파일을 직접 받아** 대조한다. 이번 건의 표식:

```bash
curl -s https://gnd-one.vercel.app/home \
  | grep -oE '/_next/static/chunks/[a-zA-Z0-9._/-]+\.js' | sort -u \
  | while read c; do curl -s "https://gnd-one.vercel.app$c" | grep -o "소멸 D-"; done
```

`git push`는 배포가 아니다. 이 프로젝트는 GitHub 연동 배포를 쓰지 않는다.

---

## 7. 오늘까지의 상태 — 이미 끝난 것들

`main` = `11f829b`. 2026-08-21에 두 번 배포했다.

| 배포 | 내용 |
|---|---|
| `gnd-8s4f27do1` (13:30) | 홈 경쟁 보드 본체 |
| `gnd-ogbp3m3az` (13:5x) | 내 프로필 → 성과 시트 |

배경·결정 이력은 이 둘을 봐라:

- `docs/superpowers/HANDOFF-2026-08-21-home-personal-crew-competition-board.md` — §13이 최신
- `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md` — §4에
  사용자가 뒤집은 지시 A~E가 표로 있다

⚠️ 설계서 §4의 **보완 기준 1·2는 철회됐다**(배지 타일·완료 칩은 되살아났다).
문서 위쪽만 읽고 "배지를 빼야 한다"고 오해하지 마라.

---

## 8. 이 작업과 별개로 남아 있는 것

| 무엇 | 상태 |
|---|---|
| `전체 크루 보기 ›` | ⚠️ **아무도 화면으로 못 봤다.** dev-테스터A의 크루가 2명뿐이라 조건상 안 뜬다(3명부터). 크루 3명 이상인 계정에서 한 번 볼 것 |
| 내 프로필 → 성과 시트 (지시 E) | ⚠️ **에이전트는 화면으로 못 봤다.** 사용자가 직접 확인했다고 확언해 배포했다 |
| 호출부가 없어진 컴포넌트 정리 | `header-streak.tsx`·`start-workout-cta.tsx`·`character-card.tsx`·`weekly-stats.tsx`·`formatTotalMinutes`. 백그라운드 작업으로 따로 띄워 뒀다. ⚠️ **`streak-card.tsx`는 이 작업이 끝날 때까지 지우지 마라** — 경고 판정 코드의 원본이다 |

⚠️ 이번 작업으로 `streak-card.tsx`의 마지막 존재 이유(경고 배너)가 카드로 옮겨
간다. 옮긴 뒤에는 그 파일도 정리 대상에 넣되, **`streak-messages.ts`·`streak.ts`는
남긴다** — 기록 화면의 오늘 카드가 `streakHeadline`을 쓰고 있다.

---

## 9. Git 주의사항

`main`에 이 작업과 **무관한 사용자 소유 미추적 파일 7건**이 있다. 절대 삭제·수정·
일괄 스테이징하지 마라. **`git add .`를 쓰지 말고** 검증한 파일 경로만 명시한다.

```
docs/GND-학습-진도.md · docs/GND-학습-커리큘럼.md · docs/GPT-프로젝트-지침.md
docs/design-sources/avatar-shop/ · public/avatar-mock/
scripts/make-study-pack.mjs · scripts/validate-avatar-mock-assets.mjs
```

`pnpm lint`의 경고 2건은 `scripts/make-study-pack.mjs`(위 미추적 파일)의 것이다.
**이 작업과 무관하고, 고치지 마라.**

---

## 10. 완료 판정표

- [x] 어제만 운동한 상태에서 홈에 `⚠️ …(소멸 D-N)` 배너가 뜬다 — d4·d3·d2·d1 넷 다 봤다
- [x] 오늘 운동을 마치면 배너가 **사라진다** (부정 확인) — A의 실제 오늘 화면
- [x] 기록 없음·이미 소멸 상태에서도 배너가 없다 — 소멸은 화면으로, 기록 없음은 테스트로
- [x] 배너 문구를 하드코딩하지 않고 `STAGE_MESSAGES`에서 가져온다
- [x] 배너 렌더를 지우면 테스트가 **빨개진다** (가짜 통과 점검 완료 — 3건이 빨개졌다)
- [x] 7일 점·헤더 한 줄·옛 `StreakCard`를 되살리지 않았다
- [~] `나의 오늘` 카드가 배너 포함 330px 이내 → **347px로 17px 넘겼다.** 크루 두 행은
      하단 탭 위에 남는다(697px < 754px). 판단 근거는 §11
- [x] lint·typecheck·test·build 전부 통과
- [ ] 사용자 승인 후 배포, 프로덕션 번들에서 `소멸 D-` 확인 ← **남은 것은 이것뿐**
- [x] `PROGRESS.md`와 이 문서를 갱신

---

## 11. 구현 결과 (2026-08-21, 같은 날 이어서)

### 무엇을 넣었나

`src/components/home/personal-today-card.tsx` — 판정 다섯 줄 + 배너 한 조각.
판정은 옛 `home/streak-card.tsx:44-47`을 **그대로** 옮겼고 문구는 손대지 않았다.
자리는 카드 **안**, 금색 CTA **아래**.

테스트를 먼저 쓰고 빨간 것을 본 뒤 구현했다
(`personal-today-card.test.tsx`의 `PersonalTodayCard — 스트릭 소멸 경고`).
계획의 넷에 **"경고는 주 행동 아래에 온다"** 를 하나 더했다 — §4 Task 3의 자리 결정이
주석에만 있으면 다음 사람이 배너를 위로 옮겨도 **아무 테스트도 안 빨개진다.**

⚠️ 계획 §4는 `daysSinceLastWorkout`도 import하라고 적었지만 **넣지 않았다.** 그건 옛
카드에서 부제(`streakHeadline`)에 쓰이던 것이고 부제는 되살리지 않는다 — 쓰지 않는
import는 lint가 잡는다.

### 가짜 통과 점검 — 실제로 했다

배너 렌더 블록을 지우고 돌렸더니 5건 중 **3건이 빨개졌다**
(`소멸 경고를 띄운다` · `링크도 버튼도 아니다` · `주 행동 아래에 온다`).
나머지 둘은 부정 확인이라 원래 초록이다 — **그 둘만 있었으면 아무것도 검사하지 않는
테스트였다.** 되돌린 뒤 27건 전부 초록.

### 개발 서버 화면 확인 (375×812, `dev-테스터A`)

`pnpm dev`(3000번, 다른 세션 서버 없었다)에 **직접 로그인해서 조작**했다.

| 시점 | 단계 | 화면 | 카드 높이 |
|---|---|---|---|
| 실제 오늘 (08-21) | `today_done` | 배너 **없음**, `오늘 완료` 칭찬 배너 | 281px |
| +1일 | `d4` | `⚠️ 11일 연속 중, 오늘 칸만 비어 있어요. 채우면 12일입니다 (소멸 D-4)` | 347px |
| +2일 | `d3` | `⚠️ 11일은 그냥 생긴 게 아니잖아요. 아직 당신 겁니다 (소멸 D-3)` | 347px |
| +3일 | `d2` | `⚠️ 11일 지키실 거면 지금이 마지노선이에요… (소멸 D-2)` | 347px |
| +4일 | `d1` | `⚠️ 마지막입니다. 오늘 안 하면 11일 → 0일… (D-1)` | 347px |
| +5일 | `expired` | 배너 **없음**, 연속 `0일` | 281px |

- 배너는 카드 **안**, CTA **아래**, 링크도 버튼도 아니다 (DOM으로도 확인)
- 크루 카드 하단 **697px** < 하단 탭 **754px** — 경고가 떠도 두 행이 다 보인다
- 콘솔 오류 **0건** (6회 실행 전부)
- 7일 점·헤더 한 줄은 **없다**

⚠️ **330px 목표를 17px 넘겼다(347px).** 배너가 375px에서 두 줄이 되어 54px + 위 여백
12px를 쓴다(계획서는 ~40px로 봤다). 넘겨도 된다고 판단한 근거는 목표의 **목적**이다 —
설계 §10이 330px을 정한 이유는 "크루 두 행이 하단 탭 위에 남게"이고 그건 지켜진다.
다만 **남은 여유가 57px뿐**이라 이 카드에 무엇을 더 얹으려면 다시 재야 한다.
줄이려면 문구가 아니라(문구는 도메인이 갖는다) **글자 크기·여백**을 건드려야 하고,
그건 별도 결정이다.

### ⚠️ 뜨는 쪽을 본 방법 — 운영 기록을 건드리지 않았다

§5의 경고대로 **아무 계정도 배너 조건이 아니었다**(A와 오뎅끼데스까는 오늘 운동함,
B와 낭만송곳니는 이미 소멸). 그래서 기록을 지우거나 심는 대신 **브라우저 시계만
하루씩 앞으로 돌렸다**(Playwright `page.clock.install`). A의 마지막 운동일(08-21)이
어제~5일 전이 되어 d4~expired가 순서대로 재현된다.

- 홈은 **읽기 전용**이라 쓰기가 없다. 이 방법으로 DB는 한 줄도 바뀌지 않았다
- 시계는 **로그인 뒤에** 건다. 먼저 걸면 토큰이 만료로 보여 로그인이 꼬인다
- 다음에 스트릭·기한 화면을 볼 때 그대로 쓸 수 있다. 계정을 새로 만들 필요가 없다

### 남은 것

- **배포** (§6). 사용자 승인 전에는 하지 않는다
- 이 작업으로 `home/streak-card.tsx`의 **마지막 존재 이유가 없어졌다.** 지금은 자기
  자신과 자기 테스트만 참조한다 — §8의 정리 대상에 넣어도 된다.
  `streak-messages.ts`·`streak.ts`는 **남긴다**(기록 화면이 쓴다)
- §8의 `전체 크루 보기 ›`·내 프로필 시트는 **여전히 화면으로 못 봤다.** 이번 확인은
  A의 크루가 2명이라 `전체 크루 보기 ›` 조건(3명 이상)에 못 미친다
