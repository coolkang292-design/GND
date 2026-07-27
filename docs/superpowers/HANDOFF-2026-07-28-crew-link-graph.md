# 인수인계 — 크루 연결 그래프 (2026-07-28 중단 시점)

> 이 문서 하나로 이어받을 수 있게 썼다. **§1(지금 상태) → §2(다음 할 일) → §5(함정)** 순서로 읽어라.

**작업:** "같은 그룹에 속했으니 크루"를 "닉네임으로 찾아 **서로 수락했으니 크루**"로 바꾸는 일.
**브랜치:** `feat/crew-link-graph` (main에서 분기, 6커밋 앞섬)
**중단 지점:** Task 2까지 완료. **Task 3 착수 직전에 사용자 지시로 중지.**

**문서 3종:**
- 설계 `docs/superpowers/specs/2026-07-28-crew-link-graph-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-crew-link-graph.md` (12 태스크)
- 이 문서

---

## 1. 지금 상태

### 1.1 커밋 (main..HEAD, 6개)

```
3d42ac5 docs: 설계 D12~D14 + 계획서에 0038 최종 변경 기록
d9206d9 fix(0038): 쌍 단위 잠금으로 동시성 3종 차단 · 수락 알림 실패가 연결을 되돌리지 않게 · 재요청 7일 쿨다운
c4baa55 feat(0038): 크루 요청·수락·해제·검색 RPC
c2e8fda docs: 계획서 Task 1 코드에 DB 리뷰 지적 반영
62a5828 fix(0038): 백필 1회성 보장 · 판정함수 grant 정정 · 인덱스·정책 보완
44db617 feat(0038): 크루 연결 그래프 스키마 + 관계 판정 + 기존 크루 이관
```

작업 트리 깨끗함(미커밋 변경 없음). 실제 코드 산출물은 **`supabase/migrations/0038_crew_link_graph.sql` 379줄 하나뿐**이다. `src/`는 아직 한 줄도 안 건드렸다.

### 1.2 ⚠️ 0038은 **아직 DB에 적용되지 않았다**

파일만 있고 Run하지 않았다. 그래서 **지금 앱은 100% 예전 그대로 동작한다.** 배포해도 아무 변화 없다. 되돌리려면 브랜치를 버리기만 하면 된다.

### 1.3 0038이 담고 있는 것

| 절 | 내용 |
|---|---|
| 1 | `crew_requests` — 요청 이력(pending/accepted/rejected/canceled). 부분 유니크 인덱스로 **진행 중 요청은 방향당 1건** |
| 2 | `crew_links` — 수락된 연결. `user_a < user_b` 정규화라 **쌍 하나 = 행 하나** |
| 3 | RLS — 두 테이블 모두 `revoke all` + `grant select`만. **쓰기는 전부 RPC로만** |
| 4 | `is_crew_with(uid)` — 0039가 `shares_group_with` 자리에 넣을 판정 함수 |
| 5 | 알림 유형 `crew_request`·`crew_accepted` 추가 (기존 13종 보존 확인함) |
| 6 | 기존 크루원 자동 연결 백필 — **리얼GND 3명 → 3쌍** |
| 7 | RPC 8개 — `search_profile_by_nickname` `send_crew_request` `accept_crew_request` `reject_crew_request` `cancel_crew_request` `remove_crew` `get_my_crew` `get_incoming_crew_requests` |

### 1.4 계획서 초안과 실제 파일이 다른 곳

계획서 Task 1·2의 SQL 블록은 **리뷰 전 초안**이다. DB 보안 리뷰를 거치며 12곳이 바뀌었고, **파일이 최종본**이다. 차이는 계획서 Task 2 끝의 "실행 중 확정된 변경" 표와 설계서 D12~D14에 적어 뒀다. 요약:

- 백필에 `where not exists (select 1 from crew_links)` 가드 — 재실행이 **해제한 사이를 되살리는 것**을 막는다
- `is_crew_with`의 revoke 제거 — RLS 정책이 부르는 함수라 revoke하면 anon 요청이 0행이 아니라 **42501로 죽는다**
- `send_crew_request`·`accept_crew_request`에 **쌍 단위 `pg_advisory_xact_lock`** — 데드락·자동수락 불발·raw 23505를 한 번에 막는다
- 수락 알림을 `begin/exception`으로 감쌈 — 알림이 죽어도 연결은 남는다
- **거절 후 7일 재요청 금지**(사용자 승인) — 코드는 `request_exists` 재사용해서 거절 사실을 숨긴다

---

## 2. 다음에 할 일 — Task 3부터

계획서의 12 태스크 중 **1·2 완료, 3부터 남음.**

### Task 3 (다음 차례) — 0038 적용 + 실 DB 검증

두 부분이다.

**(a) `scripts/crew-link-check.mjs` 작성** — 아직 없다. 이 파일을 만들다 중지했다.
`scripts/crew-profile-check.mjs`의 골격(`.env.local` 파싱 → `api()` → anon signup → `check()` 집계 → service_role 정리)을 그대로 따른다. 검증할 시나리오 33건을 준비해 뒀고 목록은 이 문서 §4에 있다.

**(b) 사용자가 SQL Editor에서 0038 Run** → 그 뒤 `node scripts/crew-link-check.mjs`
확인: `select count(*) from crew_links;` → **3**이어야 한다.

### Task 4~12 (계획서 그대로)

```
T4  순수 도메인 src/lib/domain/crew-link.ts (TDD, 12 테스트)
T5  클라 API src/lib/crew-link.ts + social.ts 알림type 2종·에러코드 7종
T6  표시 컴포넌트 2개 + SSR 테스트 10건
T7  /crew 화면 + 프로필 진입점 + 알림 라우팅 → 배포 → 폰 확인
T8  0039 전환 (판정 교체·팬아웃 3곳·세션 RLS 2곳)
T9  0039 Run + 회귀 검증
T10 피드·홈 조회 전환
T11 아침 브리핑 본문 제거
T12 최종 게이트·배포·릴리스 노트
```

**T7 끝의 배포·폰 확인 게이트를 건너뛰지 마라.** 0038만 적용된 상태에서 크루 화면을 먼저 확인한 뒤 0039로 넘어가는 게 이 계획의 안전장치다.

---

## 3. 실행 방식

사용자가 **서브에이전트 구동**(`superpowers:subagent-driven-development`)을 골랐다. 태스크마다 ①구현 에이전트 → ②스펙 준수 리뷰 → ③코드 품질 리뷰 순으로 돌렸다.

**이 방식이 실제로 값을 했다.** Task 1·2 모두 스펙 리뷰는 통과했는데 **코드 품질 리뷰가 프로덕션에서 터질 문제를 찾아냈다**(0038의 42501 에러, 백필이 해제를 되살리는 것, 데드락 3종). SQL 태스크에는 `everything-claude-code:database-reviewer`를 opus로 붙였다. 계속 그렇게 하는 걸 권한다.

---

## 4. Task 3 검증 시나리오 33건 (준비해 둔 것)

**검색** ①정확 일치 1명 ②`relation='none'`·`request_id=null` ③앞 2글자로는 0행 ④대소문자·공백 달라도 같은 1명 ⑤없는 닉네임은 0행이고 에러 아님
**요청** ⑥`status='pending'` ⑦보낸 뒤 `relation='request_sent'`·request_id 채워짐 ⑧받는 쪽은 `request_received` ⑨중복은 `request_exists` ⑩자기 자신은 `self_request` ⑪없는 uuid는 `target_not_found`
**받은함·수락** ⑫받은함 1건 ⑬제3자 수락은 `not_addressee` ⑭수락 성공 ⑮이미 수락된 것 재수락은 `not_pending` ⑯양쪽 `get_my_crew`에 서로(2건) ⑰수락 후 `relation='crew'`·`request_id=null` ⑱재요청은 `already_crew`
**역방향 자동수락** ⑲A→C pending 상태에서 C→A → `accepted` ⑳그 뒤 C 받은함에 안 남음
**거절·쿨다운** ㉑거절 성공 ㉒거절 직후 재요청은 `request_exists`(7일) ㉓거절은 알림 안 만듦
**취소** ㉔취소 성공 ㉕addressee가 취소하면 `not_requester` ㉖취소 뒤 받은함에서 사라짐
**알림** ㉗`crew_request` 도달 ㉘`crew_accepted` 도달
**직접 쓰기 차단** ㉙`crew_links` insert 4xx ㉚`crew_requests` insert 4xx
**해제** ㉛해제 성공 ㉜목록에서 사라짐 ㉝비크루 해제는 `not_crew`

**정리 조건:** 삭제는 반드시 `crewlink-${RUN}-` 로 시작하는 이메일에만. 실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)는 절대 건드리면 안 된다.

---

## 5. 함정 (반드시 읽어라)

### 5.1 고칠 함수 정의는 "가장 나중에 덮어쓴 것"이다 — T8에서 반드시 걸린다

이 저장소는 마이그레이션마다 `create or replace function`으로 같은 함수를 덮어쓴다. **옛 번호 파일을 고치면 아무 일도 안 일어난다.**

| 함수 | 덮어쓴 이력 | **현행(고칠 것)** |
|---|---|---|
| `mark_record_beaten` | 0018 → 0020 → 0021 → **0032** | `0032_badge_point_engine.sql:355` |
| `poke_user` | 0011 → **0028** | `0028_poke_requires_workout.sql:15` |
| `get_crew_member_profile` | 0026 → **0032** | `0032_badge_point_engine.sql:382` |
| `start_workout` | **0011** | `0011_social.sql:196` |
| `apply_xp_and_progress` | **0029** | `0029_level_up_notification.sql:48` |

T8에서는 파일에서 베끼지 말고 **DB에서 `pg_get_functiondef`로 현행 정의를 뽑아라.** 쿼리는 계획서 Task 8 Step 1에 있다.

### 5.2 알림 팬아웃은 2곳이 아니라 3곳이다

처음에 운동 시작·레벨업 2곳으로 착각했는데, **기록 갱신(`record_beaten`)도 크루 전원 팬아웃**이다. 배지 획득은 본인에게만 가므로 건드릴 필요 없다(`0036:102`).

### 5.3 레벨업 팬아웃은 런타임으로 검증할 수 없다

Lv.2가 200 XP인데 하루 최대 획득이 150이고(기본 100 + 보너스), 같은 날 두 번째 운동은 0 XP다. 스크립트 한 번으로 레벨업을 못 일으킨다. **구조 검증**(`pg_get_functiondef`에 `crew_links` 있고 `group_members` 없음)으로 대체하고, **그 한계를 스크립트 출력에 남겨라.** 조용히 빠뜨리면 나중에 "전부 검증됨"으로 읽힌다.

### 5.4 혼자모드는 지금 알림이 0건이다 (같이 고침)

팬아웃 두 곳이 `group_id is not null` 게이트를 통과해야 발송되는데, 혼자모드 유저는 `group_id`가 null이라 **지금 알림이 한 건도 안 나간다.** 0039에서 이 조건을 뺀다. "혼자 시작 → 나중에 크루 추가" 흐름을 실제로 성립시키는 부분이다.

### 5.5 세션 RLS는 두 곳을 같이 고쳐야 한다

`sessions_select_own_or_crew`(`0004:214`)만 고치고 `workout_session_crew_visible()`(`0004:161`)를 안 고치면 **피드에 껍데기(제목만)가 뜬다.** 후자가 운동·세트·인증사진을 연쇄로 열어 주는 관문이다.

---

## 6. 저장소 사고 기록 — 다른 세션과 충돌했다

작업 중 **같은 저장소에서 다른 Claude 세션이 동시에 돌고 있었다**("관리자 분석 대시보드"). 메인 체크아웃의 브랜치를 가져가 버려서:

- 내 Task 1 구현은 무사했다(하네스가 별도 worktree로 격리해 줬다).
- 다만 **내 계획서 수정 커밋 하나(`9991b12`)가 그 세션 브랜치 `feat/admin-analytics-dashboard`로 들어갔다.** 그 위에 상대 커밋(`d3fab6f`)이 얹혀 묻혀 있어서 임의로 들어내면 상대 작업까지 날아간다. **손대지 않았다.**
- 내용 자체는 `c2e8fda`로 이 브랜치에 cherry-pick 해 뒀으므로 **이쪽은 문제없다.**

**이어받는 사람이 할 일:** `feat/admin-analytics-dashboard`에서 `9991b12`("docs: 계획서 Task 1 코드에 DB 리뷰 지적 반영")를 빼야 한다. 그 브랜치를 다루는 세션이 하는 게 안전하다. 그냥 둬도 기능상 문제는 없고, 그쪽 PR에 무관한 문서 변경 1건이 섞일 뿐이다.

**교훈: 한 저장소에서 두 세션을 동시에 돌리지 마라.** 굳이 해야 한다면 각자 `git worktree`로 분리해라.

---

## 7. 이번 범위 밖 (다음 스펙)

- **챌린지 개편** — "내가 만들고 크루를 초대하는 방". 전원 목표 + 전원 동의 게이트(0025)·랭킹·목표 승인을 동시에 손대야 해서 별도 스펙으로 뺐다. 사용자가 원하는 최종 그림에는 들어 있다.
- 차단(block), 크루 추천, 크루 수 상한, QR·링크로 크루 맺기, 앞글자 검색.
- `profiles` SELECT RLS에 남겨 둔 `or shares_group_with(id)` — 챌린지 랭킹판에 참가자 닉네임이 떠야 해서 한시적으로 남긴다. 챌린지 개편 때 지운다.
