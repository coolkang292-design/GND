# 인수인계 — 챌린지 방 개편 (2026-07-30 시점)

> 이 문서 하나로 이어받을 수 있게 썼다. **§1(지금 상태) → §2(다음 할 일) → §6(함정)** 순서로 읽어라.

**작업:** "그룹 멤버가 곧 챌린지 참가자"를 "챌린지가 직접 참가자를 갖는다"로 바꾸는 일. 목적은 **한 사람이 여러 크루·여러 챌린지를 동시에 진행**하는 것.

**전체 3단계 중 1단계 완료.** 추가(0042·0043) → **전환(0044)** → 정리(0045).

**문서 3종:**
- 설계 `docs/superpowers/specs/2026-07-29-challenge-rooms-design.md` (13개 결정, 전체 그림)
- 계획 `docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md` (0042 단계만, 10 태스크)
- 이 문서

---

## 1. 지금 상태

### 1.1 `main`에 머지·배포됨

```
2d24661 feat: 챌린지 방 0042 (추가만) + 챌린지 집계 버그 2건 수정   ← 머지 커밋
56d2851 fix(0043): create_challenge_room의 잘못된 컬럼명
2f17771 test: 챌린지 방 0042 검증 스크립트
518a635 feat(0042): 기존 챌린지 참가자 백필
3fa7dc2 feat(0042): 챌린지 방 RPC 6개
fc14252 feat(0042): challenge_participants 테이블·RLS·알림유형
f505e02 docs: 실기기 확인 항목을 실측에 맞춤
e77f9de fix: 타바타 분수를 bodyweight_time 목표에 반영
01da1b6 fix: weight_days를 부위 대신 종목 수로 집계
668bed9 feat: 챌린지 방 순수 계산 3종
```

작업 트리 깨끗. 브랜치 `feat/challenge-rooms-0042`는 머지 후 남아 있다.

### 1.2 ✅ 0042·0043은 **DB에 적용 완료**

둘 다 사용자가 SQL Editor에서 Run했고 검증까지 끝났다. **0041(응원 포인트)도 적용돼 있다.**

### 1.3 무엇이 추가됐나 (0042)

| 절 | 내용 |
|---|---|
| 1 | `challenge_participants` — `(challenge_id, user_id)` PK. `role`(host/member) · `status`(invited/joined/dropped) |
| 2 | RLS — `revoke all` + `grant select`만. 쓰기는 RPC로만. 판정은 `is_challenge_participant` |
| 3 | 알림 유형 `challenge_invite` 추가 (기존 15종 보존 확인함) |
| 4 | RPC — `create_challenge_room` `invite_to_challenge` `accept_challenge_invite` `decline_challenge_invite` |
| 5 | RPC — `autostart_due_challenges` `autofinalize_due_challenges` (둘 다 멱등) |
| 6 | 백필 — 기존 챌린지의 `group_members`를 참가자로. **3행 생성 확인** |

0043은 0042 핫픽스 하나뿐이다 (§6.1).

### 1.4 앱 코드 변경 — 버그 수정 2건만

**0042는 "추가만" 하는 단계여서 화면·조회 경로는 건드리지 않았다.** 단, 실측으로 드러난 집계 버그 2건은 예외로 함께 고쳤다.

| 파일 | 무엇 |
|---|---|
| `src/lib/challenge.ts` | `weightPartsByDay` → `weightKindsByDay`, 집계를 종목명 기준으로. 타바타 분수를 `bodyweightTimeMin`에 합산 |
| `src/components/challenge/setup-sheet.tsx` | "부위" → "종목" 라벨 4곳 |
| `src/lib/domain/challenge-room.ts` | **신규.** `pickPrimaryChallenge` · `goalFloor` · `daysMeetingQualifier` — 0044가 쓸 재료. **아직 아무도 안 부른다** |

### 1.5 검증 결과 (전부 실DB)

| 항목 | 결과 |
|---|---|
| `scripts/challenge-room-check.mjs` | **32 / 0** |
| `scripts/rls-test.mjs` | **113 통과 / 0 실패** (2026-07-30 정리 후, §6.4) |
| 백필 재실행 안전성 | 행 수 유지 · `dropped` 미부활 · 부분 삭제 복구 — 3종 통과 |
| 단위 테스트 | 650 / 650 |
| 빌드 | 성공 |

### 1.6 ⚠ 미확인으로 남긴 것

**실기기 확인을 건너뛰고 머지했다(사용자 지시).** 확인해야 할 것은 하나다.

> 챌린지 탭에서 **스칼레또님 웨이트 운동일**이 `웨이트 운동일(하루 4종목+)` 라벨로 보이고 진행률이 **0% → 5%**(0일 → 1일)로 올라갔는지.

이건 0042가 아니라 **버그 수정(§1.4)의 결과**다. 서버 계산은 실데이터로 전후 대조해 확인했으니(0일 → 1일), 남은 위험은 "화면이 그 값을 안 읽는" 경우뿐이다.

타바타 → `bodyweight_time` 수정은 **현재 데이터로 확인 불가**다. `bodyweight_time` 목표를 가진 사람(낭만송곳니)은 기간 내 기록이 없고, 타바타를 하는 사람(오뎅끼데스까)은 그 목표가 없다. 단위 테스트 5건으로 고정돼 있다.

---

## 2. 다음에 할 일 — 0044 (전환)

**계획서가 아직 없다.** 0042 계획서를 쓸 때 "0042를 실기기로 확인한 뒤 0044 계획서를 쓴다"고 정했다 — 미리 쓰면 나중에 고치게 된다.

### 2.1 0044에서 할 것 (설계서 §7의 "0043 — 전환")

- `challenges_one_live` 인덱스 **드롭** ← 여기서 챌린지 개수 제한이 풀린다
- 집계·랭킹을 `challenge_participants` 기준으로 교체 (지금은 `group_members`)
- `get_challenge_ranking` 정의자 RPC 신설 — 랭킹 계산을 클라에서 서버로 (0040이 미뤄 둔 것, `0040:9`)
- `profiles` RLS에서 `or shares_group_with(id)` 제거 (`0039:33`의 한시적 조건)
- **`sessions_insert_own_draft`에서 `group_id` 조건 제거** (`0004:226` — 그룹을 직접 참조하는 마지막 정책)
- `challenge_goal_approvals`(전원 동의) 드롭
- 앱 코드: 완료 목표 보너스 `+3 → +9`, `setup-sheet.tsx:337`의 "+3점" 문구, 챌린지 탭 목록화, 홈 대표 챌린지
- 크론에 `autostart`·`autofinalize` 연결 (`vercel.json`의 09:00 브리핑에 얹음) + 화면 진입 시 지연 전환

### 2.2 0045에서 할 것 (정리)

`workout_sessions.group_id` · `challenges.group_id` · `user_goals.group_id` 드롭, `groups` · `group_members` 드롭, `is_group_member` · `shares_group_with` 드롭.

**실행 조건:** 그룹 의존성 6개 문자열(`group_id` `groups` `group_members` `is_group_member` `shares_group_with` `getMyGroups`)의 **현행** 참조가 0건임을 확인한 뒤에만. 파일이 아니라 `pg_policies`·`pg_get_functiondef`·`information_schema.triggers`로 봐야 한다. 설계서 §7.1에 상세.

### 2.3 전환 타이밍 — 중요

**진행 중 챌린지가 없을 때 0044를 적용해야 한다.** 랭킹 계산 주체가 클라이언트에서 RPC로 바뀌므로, 진행 중이면 참가자들이 보는 점수가 중간에 흔들린다.

현재 `7월 GND 챌린지`가 **`active`이고 종료일이 2026-09-30**이다. 그때까지 기다리거나, 참가자 합의로 조기 종료해야 한다. **이게 0044 착수의 실질적 제약이다.**

---

## 3. 실행 방식

사용자가 **서브에이전트 구동**(`superpowers:subagent-driven-development`)을 골랐지만, 실제로는 API 529·세션 한도로 서브에이전트가 두 번 죽어서 **대부분 인라인으로 했다.**

0041(응원 포인트)에서는 서브에이전트가 값을 했다 — 스펙 리뷰가 주석 축약을 잡고, DB 리뷰가 5건을, 코드 리뷰가 게이트 무력화 결함 2건을 잡았다. **SQL 태스크에는 `everything-claude-code:database-reviewer`를 opus로 붙이는 걸 권한다.**

---

## 4. 함께 들어간 것 — 삭제 가드

`scripts/_safe-delete.mjs` **신규**. 검증 스크립트 17개의 계정 삭제를 전부 이걸 경유하게 바꿨다.

**막는 방식:** 닉네임 하드코딩이 아니라 **실행 시작 시점 스냅샷**. 그때 존재하던 계정은 이 실행이 만들지 않았으므로 삭제 금지. 스냅샷 조회가 실패하면 아무것도 안 지운다(fail-closed).

적대적으로 확인했다 — 실계정 5개를 "이 실행이 만든 것"으로 강제 등록한 뒤 `cleanup()`을 불렀더니 5개 전부 거부하고 0개를 지웠다.

**두 가지 모드**
- `register()` + `cleanup()` — 등록한 것만 지운다. 실행 중 다른 경로로 가입한 실사용자까지 보호. `cheer-points-check.mjs`·`challenge-room-check.mjs`가 이 방식
- `deleteIfCreatedThisRun(id)` — 스냅샷에 없으면 지운다. 나머지 15개 스크립트에 드롭인으로 넣은 모드

---

## 5. DB·계정 현황 (2026-07-30)

```
계정 4개:  오뎅끼데스까 · 스칼레또 · 낭만송곳니 · repro-mry7tyx0
그룹 1개:  리얼GND
챌린지 1개: 7월 GND 챌린지 (active, 2026-07-27~2026-09-30, photo_required=true)
참가자 3행: 오뎅끼데스까(host) · 스칼레또(member) · 낭만송곳니(member) — 전부 joined
목표 9개
```

`repro-mry7tyx0`은 재현용 계정인데 운동 2건·600P가 있어 사용자 판단으로 남겼다.

**검증 스크립트를 돌린 뒤에는 계정 수를 확인하라.** 4개여야 한다. 그보다 많으면 떠돌이 테스트 계정이 남은 것이다.

---

## 6. 함정 (반드시 읽어라)

### 6.1 컬럼명을 스키마에서 확인하고 써라 — 0042에서 실제로 밟았다

`create_challenge_room`이 `order by gm.created_at`을 썼는데 `group_members`에 그 컬럼이 없다. **실제 이름은 `joined_at`**(`0001:32`). 챌린지 생성이 `42703`으로 실패하고, 그 함수가 만드는 `chId`가 `undefined`가 되어 **후속 단언 24개가 연쇄 실패**했다. 0043이 이것만 고친다.

적용 전엔 안 드러난다. 계획서 SQL을 쓸 때 이걸 먼저 돌려라:

```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and table_name in ('group_members','challenges','user_goals','challenge_participants')
order by table_name, ordinal_position;
```

### 6.2 함수의 현행 정의는 "가장 나중에 덮어쓴 파일"이다

이 저장소는 마이그레이션마다 `create or replace function`으로 같은 함수를 덮어쓴다. **옛 번호 파일을 고치면 아무 일도 안 일어난다.**

| 함수 | **현행(고칠 것)** |
|---|---|
| `send_cheer` | `0043_challenge_room_fix.sql`이 아니라 **`0041_cheer_points.sql`** |
| `create_challenge_room` | **`0043_challenge_room_fix.sql`** |
| `poke_user` · `view_record` · `start_workout` · `mark_record_beaten` · `apply_xp_and_progress` | **`0039_crew_link_switchover.sql`** |
| `get_crew_member_profile` · `award_points` · `evaluate_badges` | **`0032_badge_point_engine.sql`** |
| `complete_workout_v2` | **`0032_badge_point_engine.sql`** |

0044에서는 파일에서 베끼지 말고 **DB에서 `pg_get_functiondef`로 현행 정의를 뽑아라.**

### 6.3 `groups.owner_id`는 `on delete cascade`가 아니다

그룹을 남긴 채 방장 계정을 지우면 **500**으로 실패하고 테스트 계정이 프로덕션 auth에 떠돌이로 남는다. 2026-07-30에 실제로 2개가 남아서 손으로 치웠다. **정리는 그룹 먼저, 유저 나중.** `rls-test.mjs:570`(`finally` 안)이 같은 이유로 그렇게 한다.

### 6.4 회귀 기준선은 이제 **전부 0 failed**다 (2026-07-30 정리 완료)

낡은 스크립트 3종을 고쳤다. **이제 실패가 하나라도 있으면 회귀다.**

| 스크립트 | 이전 | 지금 |
|---|---|---|
| `scripts/rls-test.mjs` | 103 통과 / 6 실패 | **113 통과 / 0 실패** |
| `scripts/poke-levelup-check.mjs` | 3 / 10 | **11 / 11** |
| `scripts/challenge-consent-test.mjs` | 20 / 0 | 20 / 0 (원래 정상) |

무엇이 문제였나 — 셋 다 같은 패턴이다. **마이그레이션이 새 전제조건을 추가할 때 전용 스크립트를 새로 만들고 `rls-test.mjs`는 안 고쳤다.**

- **챌린지 3건** — `0025`가 `start_challenge`에 전원 동의 게이트를 더했는데 스크립트가 `approve_challenge_goals`를 한 번도 안 불렀다. 호출을 넣고, 덤으로 "동의 없으면 `consent_incomplete`로 막힌다"는 단언을 새로 추가했다(0025 게이트에 대한 커버리지가 아예 없었다)
- **찌르기 3건** — `0028`이 "오늘 운동을 마친 사람만"을 더했는데 이 스크립트에서 운동을 완료하는 건 A뿐이었다. B가 세션을 만들어 완료하게 했다. 세트는 필요 없다 — 게이트가 보는 건 `status='completed'`와 오늘 KST 날짜뿐이다
- **`poke-levelup-check.mjs` 7건** — `create_group` + `join_group_with_code`로만 크루를 엮었는데 `0039`가 크루의 뜻을 `crew_links` 상호 수락으로 바꿨다. `linkCrew` 헬퍼(0038 RPC)를 넣어 **B를 A·C·D 셋 다와** 연결했다. B가 관찰자라서 셋 다 필요하다. 그룹은 세션의 `group_id` 때문에 그대로 둔다

**`rls-test.mjs`에 `try/finally`를 넣었다.** 이전엔 중간에 죽으면 픽스처가 프로덕션 auth에 그대로 남았다(rate limit으로 실제로 겪음). 요약과 `process.exit`은 `finally` **밖**에 둔다 — 안에 두면 예외를 삼켜 아무것도 검증 못 한 실행이 exit 0으로 보고된다.

### 6.5 익명 가입 rate limit (429)

검증 스크립트를 연달아 돌리면 `over_request_rate_limit`으로 죽는다. 사이에 1~2분 둬라. 2026-07-30에 이걸로 실행이 중단되며 계정이 남았다.

### 6.6 PostgREST는 오류 시 배열이 아니라 에러 객체를 준다

테이블이 없거나 권한이 없으면 `{code, message}`가 온다. 그걸 `.some()`에 넘기면 `ps.some is not a function`으로 **실행이 통째로 죽는다.** 배열 반환 헬퍼는 `Array.isArray(r.json) ? r.json : []`로 감싸라.

### 6.7 알림 유형 CHECK를 다시 쓸 때 기존 것을 빠뜨리지 마라

현재 **16종**이다. 하나라도 빠지면 그 유형의 알림이 조용히 죽는다. 집합으로 기계 대조하는 게 안전하다 — 0042에서 그렇게 했다.

### 6.8 백필은 챌린지 단위 가드를 쓰지 마라

`where not exists`를 챌린지 단위로 걸면 **부분 실패 복구를 막는다.** 참가자 3명 중 1명만 들어간 상태에서 재실행하면 통째로 건너뛴다. 행 단위 `on conflict do nothing`이어야 한다. `do update`는 `dropped`를 되살리므로 금지. 그리고 **`host`를 먼저 넣어야** 한다 — 순서를 바꾸면 방장이 `member`로 들어가고 `do nothing`에 막힌다.

---

## 7. 이번 범위 밖 (설계서 §9)

- **공개 챌린지·누구나 참가** — 도입하면 **D5(참가자 전원 자동 크루 연결)를 반드시 재검토해야 한다.** D5는 "지인 중심 소규모" 전제 위에서만 성립한다. 모르는 사람 50명과 자동 연결되면 크루 목록이 무의미해지고 피드·프로필이 사실상 공개된다
- 챌린지 개수 상한, 초대 남용 방지(pending 상한)
- 챌린지별 열람권 분리 (지금은 대표 챌린지 하나)
- 팀전·2:2 대결
- 응원 포인트의 하루 총 상한 — `2026-07-29-cheer-points-design.md` §3.1의 운영 지표에서 파밍이 확인될 때만
- 포인트 내역 화면 — `getRecentPointTransactions`가 죽은 코드로 남아 있다
