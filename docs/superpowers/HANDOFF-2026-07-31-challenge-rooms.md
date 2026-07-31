# 인수인계 — 챌린지 방 전환 완료 + 참가/친구 분리 착수 (2026-07-31)

> 이 문서 하나로 이어받을 수 있게 썼다. **§1(지금 상태) → §2(다음 할 일) → §6(함정)** 순서로 읽어라.
>
> 이전 문서 `HANDOFF-2026-07-30-challenge-rooms.md`는 0044 착수 시점 기록이다. **0044는 끝났으므로 이 문서가 최신이다.**

**작업:** "그룹 멤버가 곧 챌린지 참가자"를 "챌린지가 직접 참가자를 갖는다"로 바꾸는 일.
**전체 3단계 중 2단계 완료.** 추가(0042·0043) → **전환(0044~0050 완료)** → 정리(미착수).

---

## 1. 지금 상태

### 1.1 마이그레이션 0044~0050 **전부 운영 적용·검증 완료**

| 번호 | 무엇 | 상태 |
|---|---|---|
| 0044 | `challenges_one_live` 드롭 + `challenges`·`user_goals` SELECT를 참가자에게 확대 | ✅ |
| 0045 | `start_challenge` 게이트를 참가자 기준으로 | ✅ |
| 0046 | `approve`·`unapprove`·`finalize`도 참가자 기준으로 | ✅ |
| 0047 | `challenge_goal_approvals` 읽기를 참가자에게 | ✅ |
| 0048 | 스키마 스냅샷 RPC (`pnpm db:snapshot`) | ✅ |
| 0049 | 챌린지 초대 링크 (`invite_code` + 발급·참가 RPC) | ✅ |
| 0050 | 목표 등록을 참가자에게 | ✅ |
| **0051** | **참가 ≠ 친구 (D5 폐기)** | ❌ **파일만 있고 미적용** — §2 |

### 1.2 배포됨

`main` HEAD `3a7c787`, 프로덕션 `gnd-8uehs4fxd-gnd4.vercel.app` → `gnd-one.vercel.app`. 번들에서 실물 확인함.

**`main`이 origin보다 33커밋 앞서 있다(푸시 안 함).** 이 프로젝트는 GitHub 연동 배포를 안 쓰므로 배포에는 지장 없다.

### 1.3 검증 실측 (전부 실 DB, 0050 적용 후)

| 스크립트 | 결과 |
|---|---|
| `scripts/challenge-invite-link-check.mjs` | **13 / 13** (신규) |
| `scripts/challenge-subset-start-check.mjs` | **8 / 8** (신규) |
| `scripts/rls-test.mjs` | **115 / 0** |
| `scripts/challenge-room-check.mjs` | **36 / 0** |
| `scripts/challenge-consent-test.mjs` | **22 / 0** |
| `scripts/challenge-aggregation-parity.mjs` | **4 / 4** |
| 단위 테스트 | **686 / 686** (63파일) |
| lint · typecheck · build | 0 · 통과 · ✅ |

**회귀 기준선은 전부 0 failed다.** 하나라도 실패하면 회귀다.

### 1.4 무엇이 바뀌었나 (사용자가 보는 것)

- **챌린지를 여러 개 동시에** 진행할 수 있다. 개수 상한은 없다
- 2개 이상이면 챌린지 탭에 **선택기 chip**. `＋ 챌린지 하나 더 만들기` 상시 노출
- 챌린지가 **그룹이 아니라 참가자**로 묶인다. 타 그룹·혼자모드 사용자도 초대 가능
- **초대 링크** — `🔗 초대 링크 복사하기` → `/challenge?join=GND-XXXXX`
- 링크로 처음 온 사람은 **닉네임만 정하면 바로 챌린지로** (크루 단계 건너뜀)
- 자동 시작·종료가 09:00 KST 크론 + 화면 진입 시에 돈다

### 1.5 ⚠ 미확인으로 남긴 것

**폰에서 초대 링크 전 과정을 아직 안 봤다.** 마지막 배포(온보딩 우회) 직후 멈췄다.

> 방장이 `gnd-one.vercel.app`에서 링크 복사 → **새 시크릿 창**에서 열기 →
> ① "챌린지에 초대받았어요 🏆"가 뜨는지 ② 닉네임만 정하고 **크루 화면 없이** 챌린지 탭으로 가는지
> ③ 참가자로 들어가 목표를 세울 수 있는지 ④ 주소창에서 `?join=`이 사라지는지

실 DB 스크립트로는 13/13 통과했으므로 **서버는 확인됐다.** 남은 위험은 화면 흐름뿐이다.

---

## 2. 다음에 할 일 — 0051 (참가 ≠ 친구)

### 2.1 왜 하는가

사용자 신고: **"리얼GND에 형이라는 아이디가 포함됨. 저 아이디는 다른 챌린지 멤버인데."**
→ **"각각의 챌린지별로 크루원을 따로 묶어야지, 기존 챌린지에 다른 챌린지 팀원을 묶으면 안 되지."**

실제로 그 계정은 **그룹 멤버가 아니었다.** 챌린지에 링크로 참가하면서 설계 D5가 `crew_links`를 만들었고, 크루 목록·홈 크루 카드에 떠서 "크루에 들어왔다"로 보인 것이다. `crew_links`에는 `challenge_id`가 없어 **챌린지가 끝나도 남는다.**

설계서 §9와 이전 인수인계서 §7이 "공개 챌린지를 도입하면 **D5를 반드시 재검토하라**"고 적어 둔 지점이 정확히 여기다. D5는 "지인 중심 소규모" 전제 위에서만 성립했다.

### 2.2 확정된 설계 (사용자 결정 2026-07-31)

| | 크루(친구) | 챌린지 참가자 |
|---|---|---|
| 맺는 법 | 닉네임 요청 + **상호 수락** | 초대·링크 |
| 피드·운동 알림·응원·콕 | ✅ | ❌ |
| 챌린지 랭킹·닉네임 | — | ✅ **그 챌린지 안에서만** |
| 챌린지 종료 후 | 남음 | **결과는 계속 보임** (자기가 한 대결의 기록) |

**접근 방식: 정의자 RPC로 감싼다. RLS는 한 줄도 안 넓힌다.**

크루 연결이 떠받치던 읽기가 세 겹이다.

```
sessions_select_own_or_crew      랭킹이 남의 세션 행을 읽는 근거
workout_session_crew_visible     그 세션의 세트·인증사진
profiles_select_own_or_crew      랭킹판 닉네임
```

여기에 "같은 챌린지 참가자" arm을 OR로 덧붙이면 작업은 짧지만, 참가자가 서로의 운동 원본을 **직접** 읽게 되어 반응(reactions)처럼 그 헬퍼를 타는 곁달린 기능으로 관계가 샌다. 친구가 아닌 사람에게 그만큼 열 이유가 없다.

**점수 계산은 SQL로 복제하지 않는다.** RPC가 세션 원본을 `getPeriodStatsByUser`와 같은 모양으로 돌려주고, 클라가 지금처럼 `foldPeriodStats`로 접는다. 두 벌이 되면 갈라지고, 그게 `challenge-aggregation-parity.mjs`가 막아 온 사고다.

### 2.3 남은 작업

**SQL은 이미 써 뒀다** — `supabase/migrations/0051_challenge_scoped_visibility.sql` (**미커밋·미적용**). 담긴 것:

1. `shares_challenge_with(uuid)` — 같은 챌린지(cancelled 제외, `joined`/`dropped`만)에 있는가
2. `get_challenge_participant_profiles(challenge_id)` — 랭킹판 닉네임용
3. `get_challenge_period_sessions(challenge_id)` — 기간 세션을 앱과 같은 모양의 jsonb로
4. `accept_challenge_invite`·`join_challenge_with_code`에서 **`crew_links` 생성 제거** ← D5 폐기 본체

**아직 안 한 것 (앱 코드):**

- [ ] `challenge.ts` — `getChallengeParticipantProfiles` / `getChallengePeriodSessions` 래퍼 추가
- [ ] `getPeriodStatsByUser`를 RPC 경로로 교체. **`foldPeriodStats`는 그대로 쓴다**
- [ ] `challenge/page.tsx`의 `profilesByIds` → 새 RPC (랭킹판 닉네임)
- [ ] `challenge-performance-card.tsx`의 `getGroupMemberProfiles` → 새 RPC
- [ ] **`invite-sheet.tsx`의 "링크로 참가하면 서로 크루가 돼요" 문구를 정반대로 교체** — 이제 크루가 안 된다. 테스트(`invite-sheet.test.tsx`)도 그 문구를 단언하므로 같이 고쳐야 한다
- [ ] `challenge-invite-link-check.mjs`의 `crew_links` 단언을 **뒤집기** — 지금은 "연결이 생긴다"를 단언한다. 0051 후에는 **안 생겨야** 한다
- [ ] 개발환경 확인 → 배포

**적용 순서:** 앱 코드를 먼저 고치고 → 0051 Run → 검증 → 배포. **거꾸로 하면 랭킹이 잠깐 0으로 보인다**(RPC가 없는데 크루 연결은 사라진 상태).

> ⚠ 진행 중인 `7월 GND 챌린지`는 참가자 3명이 이미 서로 크루라(2026-07-27 상호 수락) 어느 경로로든 점수가 같다. 이 작업이 그 챌린지를 흔들지 않는다.

### 2.4 그 뒤 — 정리 단계 (진행 중 챌린지 종료 후, 2026-09-30 이후)

점수가 흔들리므로 **진행 중 챌린지가 끝난 뒤**에 한다.

- 완료 목표 보너스 `+3 → +9` (`goal-score.ts`의 `COMPLETED_GOAL_BONUS_PER`) + `setup-sheet.tsx:337`의 "+3점" 문구
- `profiles` RLS의 `or shares_group_with(id)` 제거
- `sessions_insert_own_draft`의 `group_id` 조건 제거
- `challenge_goal_approvals` 드롭
- `workout_sessions.group_id` · `challenges.group_id` · `user_goals.group_id` 드롭, `groups` · `group_members` 드롭
- 여기까지 하면 **혼자모드 유저도 챌린지를 만들 수 있다**(지금은 `create_challenge_room`이 `challenges.group_id`(not null)를 채워야 해서 `no_group_yet`으로 막힌다)

**정책을 좁힐 때는 `drop policy`+`create policy`가 아니라 `alter policy`를 써라.** 확대(OR 덧붙이기)는 이름을 틀려도 결과가 같아 무해했지만, 제거는 정반대다 — 이름이 틀리면 `drop`이 조용히 no-op 하고 옛 정책이 살아남아 그룹 arm이 되살아난다. `alter policy`는 `42704`로 죽는다(`0014:19`가 선례).

---

## 3. 새로 생긴 지침 2개 (반드시 지켜라)

### 3.1 개발환경에서 먼저 확인한 뒤 배포한다 — 예외 없음

`CLAUDE.md` 최상단에 있다. **`pnpm dev` → localhost:3000에서 눈으로 보고** 배포한다.

**왜 생겼나:** 0044 배포에서 lint·typecheck·단위 683건·build·번들 grep이 **전부 초록**이었는데 사용자 폰에서 ① 같은 챌린지가 참가자 수만큼 **3개로 중복** ② **챌린지 추가 버튼 부재**가 드러났다. 둘 다 앱을 한 번만 띄웠으면 즉시 보였다.

**단위 테스트·빌드·번들 grep은 화면이 어떻게 보이는가를 하나도 검증하지 않는다.** grep은 문자열이 번들에 들어갔는지만 보고 렌더 여부·**개수**·클릭 가능 여부는 모른다.

**한계:** 개발용 DB가 없다. localhost도 `.env.local`로 **운영 Supabase에 붙는다.** 화면 버그는 잡히지만 마이그레이션 사고에는 보호막이 없다.

### 3.2 공지(업데이트 알림)는 사용자가 지시할 때만 보낸다

배포했다고 자동으로 보내지 않고, 먼저 제안하지도 않는다. 릴리스 노트 항목 추가와 `pnpm release:notify`(DRY RUN)까지만 하고 멈춘다.

---

## 4. 도구 — `docs/db-current-schema.sql`

**"이 함수의 현행 정의가 뭐지?"를 파일 47개에서 찾지 마라.** 이 스냅샷을 보면 된다.

```
pnpm db:snapshot     # → docs/db-current-schema.sql (함수 61 · 정책 65 · 인덱스 69)
```

마이그레이션을 적용한 뒤에는 **다시 뽑아라.** 0048이 만든 `admin_schema_snapshot()` RPC를 쓰고 service_role 전용이다.

이 도구가 실제로 값을 했다 — 0050의 원인(`goals_insert_own_setup`에 남은 `is_group_member`)을 스냅샷 grep 한 번으로 찾았고, 정책 전수 조사로 "링크 참가자를 막는 곳이 그 하나뿐"임을 확인했다.

---

## 5. DB·계정 현황 (2026-07-31, 정리 완료)

```
계정 4개:  오뎅끼데스까 · 스칼레또 · 낭만송곳니 · repro-mry7tyx0
그룹 1개:  리얼GND (오뎅끼데스까 owner + 스칼레또 · 낭만송곳니)
크루 연결 3쌍: 스칼레또↔오뎅끼 · 스칼레또↔낭만 · 오뎅끼↔낭만  (2026-07-27 상호 수락)
챌린지 6건: 7월 GND 챌린지[active] + cancelled 5건
```

**테스트 잔여물을 두 차례 정리했다.** 1차: `aa` 계정·불꽃 크루·챌린지 5건·프로필 없는 떠돌이 5개. 2차: `형`·`누나`·`ㅁㅇㄴㅁㅇ`·불꽃 크루·챌린지 2건.

두 번 다 **보존 대상이 삭제 목록에 끼면 중단**하는 안전장치를 통과시킨 뒤 실행했고, §6.3대로 **챌린지 → 그룹 → 유저** 순으로 지웠다.

**남은 것:** 오뎅끼데스까 소유의 `cancelled` 챌린지 5건. 화면에 안 뜨므로 무해하다. 지우려면 실사용 `7월 GND 챌린지`(`0b0766cf-210c-4a54-a169-68ddbcd0eedb`)를 **절대 건드리지 마라.**

**검증 스크립트를 돌린 뒤에는 계정 수를 확인하라.** 4개여야 한다.

---

## 6. 함정 (반드시 읽어라)

### 6.1 함수를 고칠 때는 **형제 함수도 같이 훑어라** — 오늘 세 번 밟았다

`start_challenge`만 고쳤다가(0045) 같은 전제를 공유하는 `approve_challenge_goals`를 놓쳐 **챌린지를 영영 시작할 수 없는 상태**를 만들었다. 0046으로 형제 3개를 고쳤더니 이번엔 정책(`approvals_select_crew`)이 남아 0047, 그리고 `goals_insert_own_setup`이 남아 0050.

**한 번에 끝내는 법:** `docs/db-current-schema.sql`에서 바꾸려는 술어(`is_group_member` 등)를 **전수 grep**하고, 그 목록을 근거로 한 파일에 담아라.

### 6.2 타입이 안 잡아 주는 시그니처 변경이 있다

`getActiveChallengeRanking(groupId)` → `(challengeId)`는 **둘 다 `string`이라 typecheck가 그냥 통과한다.** 그대로 뒀으면 호출부 3곳(홈 성과 카드·관리자 대시보드·소셜 랭킹)이 그룹 id를 챌린지 id 자리에 넘겨 조용히 `null`을 받고 **빈 화면으로 배포**됐을 것이다. 의미가 바뀌는 인자는 컴파일러를 믿지 말고 호출부를 전수로 훑어라.

### 6.3 RLS는 "내 행"으로 좁혀 주지 않는다

`challenge_participants`의 RLS는 `is_challenge_participant(challenge_id, auth.uid())`라 **내가 낀 챌린지의 모든 참가자 행**을 열어 준다(명단 조회에 필요해서). `getMyChallenges`가 `user_id` 필터 없이 그걸 목록으로 써서 **참가자 3명 = 챌린지 3개**로 보였고, `myRole`도 남의 값이 들어와 **member인 사람이 자기를 host로 보고 초대 UI까지 떴다.**

### 6.4 화면 상태를 effect 하나에 몰면 선택이 안 먹는다

챌린지 목록·선택과 "선택된 챌린지의 데이터"를 한 effect에 두고 `selectedId`를 의존성에서 뺐더니(재조회 루프를 피하려고), chip으로 챌린지를 바꿔도 **이전 챌린지의 참여자·목표·순위가 그대로 남았다.** 사용자에겐 "새 챌린지에 기존 멤버가 포함된다"로 보였다. 로딩을 둘로 쪼개 해결했다(A: 목록·선택 / B: 선택된 것의 데이터).

### 6.5 검증 스크립트의 픽스처가 낡는다

0046·0047 적용 후 `challenge-consent-test`가 20/0 → 8/12, `rls-test`가 113/0 → 106/7로 깨졌다. **전부 `challenge_not_found`**였고 원인은 하나 — 스크립트가 챌린지를 **직접 insert**로 만들어 참가자 행이 없었다. 앱은 0044부터 `create_challenge_room` RPC만 쓴다. `pnpm test`(vitest)에 안 들어가는 스크립트라 게이트가 초록으로 남아 놓치기 쉽다.

### 6.6 `process.exit(1)`이 Windows에서 종료 코드를 뒤집는다

fetch 직후 `process.exit(1)`을 부르면 Node 24 + Windows에서 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`으로 죽고 종료 코드가 **127**이 된다(관례상 "command not found"). 실제 스크립트로 3/3 재현했다. **`process.exitCode = 1`로 설정하고 자연 종료시켜라.** 이 저장소의 다른 스크립트도 실패 경로에 같은 잠재 결함이 있다.

### 6.7 컬럼명을 스키마에서 확인하고 써라

`group_members`는 `joined_at`이다(`created_at` 아님). 0042가 여기서 틀려 후속 단언 24개가 연쇄 실패했다.

### 6.8 정리는 그룹 먼저, 유저 나중

`groups.owner_id`는 `on delete cascade`가 아니다. 그룹을 남긴 채 방장 계정을 지우면 **500**으로 실패하고 테스트 계정이 프로덕션 auth에 떠돌이로 남는다.

### 6.9 익명 가입 rate limit (429)

검증 스크립트를 연달아 돌리면 죽는다. 사이에 1~2분 둬라.

### 6.10 `git push`는 배포가 아니다

GitHub 연동 배포를 안 쓴다. `main`을 worktree로 분리해 `vercel --prod`를 직접 돌린다. 상세는 `CLAUDE.md`.

```bash
git worktree add --detach /tmp/deploy-main main
cp .env.local /tmp/deploy-main/ && cp -r .vercel /tmp/deploy-main/
cd /tmp/deploy-main && npx vercel@latest --prod --yes
```

배포 후 **프로덕션에서 파일을 직접 받아** 바뀐 코드가 들어갔는지 확인한다.

---

## 7. 범위 밖 / 미결

- **릴리스 노트에 링크 초대가 빠져 있다.** `2026-07-31-challenge-rooms` 항목은 링크 기능 전에 썼다. 한 줄 추가할지 사용자에게 물어라. **발송은 지시받을 때만**(§3.2)
- **챌린지 개수·인원 상한 없음** — 의도한 것이다(설계서 §9가 범위 밖으로 미뤄 둠). 실사용하다 문제가 되면 그때 정한다
- **`0039:143-150`의 `select ... into ... limit 1`** — 살아있는 챌린지가 여러 개면 임의의 한 건이 `record_views.challenge_id`에 박힌다. 0040의 열람권이 이 값을 쓴다. 대표 챌린지 규칙(`pickPrimaryRow`)과 같은 기준으로 바꿔야 한다
- **`challenges(group_id)` 대체 인덱스를 만들지 마라** — `challenges_one_live`가 그걸 커버하던 유일한 인덱스였지만 테이블이 1행이고 정리 단계가 그 컬럼을 지운다
- **마이그레이션 스쿼시** — 47개 → 51개로 늘었다. DB에는 최신 정의만 남으므로 **성능 문제는 없고 인지 부담만 있다**(§4의 스냅샷으로 완화됨). 정리 단계가 끝난 뒤 `pg_dump --schema-only`로 `0000_baseline.sql`을 만들고 옛 파일은 `archive/`로 옮기는 것을 권한다. **지금 하면 곧 지울 것들이 베이스라인에 박제된다**
