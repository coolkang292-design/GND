# 추천 계보 — 실물 감사 기록

**작성** 2026-08-31 · 대상: 운영 DB(`cjdskubyxlnojwzhwbfx`) + `main` 코드
**결론: 새 테이블도 새 컬럼도 만들지 않았다.** 필요한 정보가 이미 전부 저장되고 있다.

---

## 1. 세 개념이 이미 분리돼 있다

| 개념 | 저장 위치 | 누가 채우나 | 덮어쓰기 방지 |
|---|---|---|---|
| **A. 최초 외부 유입** | `profiles.acquisition_source/medium/campaign` | `crew.ts:44` `acquisitionColumns()` (프로필 생성 시 1회) | 0080 `freeze_profile_attribution` 트리거 + 아래 §2 |
| **B. 직접 초대자** | `profiles.invited_by` | `accept_friend_invite` · `join_challenge_as_newcomer` | 둘 다 `where invited_by is null` |
| **C. 뿌리 캠페인** | **저장 안 함 — 계산** | `analytics-referral-tree.ts` `resolveRoot()` | — |

## 2. A를 덮어쓰는 함수가 하나도 없다 (전수 조회)

`pg_get_functiondef`로 초대·참가 관련 함수 10개를 전수 검사했다.

```
accept_challenge_invite      acquisition 안 건드림
accept_crew_request          안 건드림   (invited_by는 읽기만)
accept_friend_invite         안 건드림 · invited_by 채움 (null일 때만)
create_challenge_room        안 건드림
issue_challenge_invite_code  안 건드림
issue_my_invite_code         안 건드림
join_challenge_as_newcomer   안 건드림 · invited_by 채움 (null일 때만)
join_challenge_with_code     안 건드림
join_discoverable_challenge  안 건드림
join_group_with_code         안 건드림
```

실제 UPDATE 문 (운영 DB 현행 정의):

```sql
-- accept_friend_invite
update public.profiles set invited_by = v_owner
 where id = v_me and invited_by is null;

-- join_challenge_as_newcomer
update public.profiles set invited_by = v_link_to
 where id = v_me and invited_by is null;
```

→ **first-touch가 코드와 트리거 양쪽에서 보장된다.** 계산 계층은 읽기만 하므로
`acquisition_*`가 초대 때문에 바뀔 경로가 없다.

## 3. 초대 종류도 이미 구별돼 있다 — `referral_kind` 컬럼 불필요

`crew_links.origin`을 각 함수가 다르게 넣는다.

```sql
-- accept_friend_invite      → 'invite_link'
-- join_challenge_as_newcomer → 'challenge'
```

운영 실측 분포: `invite_link=2 · search=3 · unknown=3`

→ 친구 초대와 챌린지 초대가 **저장 시점에 이미 갈려 있다.** 새 컬럼을 만들 이유가 없다.
⚠️ `unknown`은 0079 이전에 맺어진 관계다. **친구로 넘겨짚지 않고 "출처 모름"으로 둔다.**

## 4. 링크에 사람이 UTM을 붙일 필요가 없다 (이미 그렇다)

| 링크 | 추적 정보 | 어디서 |
|---|---|---|
| 친구 초대 | 초대 코드 → 코드 주인 | `issue_my_invite_code` → `accept_friend_invite` |
| 챌린지 초대 | `?by=<userId>` | `challenge/page.tsx:301` → `join_challenge_as_newcomer(code, p_inviter)` |

→ 둘 다 **코드/파라미터만으로 초대자를 찾을 수 있다.** URL에 이메일·닉네임이 없다(uuid만).
운영자가 `utm_campaign=`을 손으로 붙일 필요가 없다.

## 5. 운영 실데이터 (2026-08-31)

```
profiles                8 (invited_by 채워진 행 2)
  아라짱  ← 오뎅끼데스까
  test    ← 근육은퇴근중
crew_links              8
challenge_participants 35
analytics_events        (배포 D에서 신설)
```

## 6. 그래서 이번에 만든 것

**DB 변경 0건.** 코드만 추가했다.

- `src/lib/domain/analytics-referral-tree.ts` — `resolveRoot` · `referralKind` · `campaignSpread`
- `src/app/admin/_components/campaign-spread-panel.tsx` — 확산 성과표
- `queries.ts` — `profiles.invited_by`와 `crew_links(user_a,user_b,origin)`을 **읽기만** 추가

## 7. 안전장치 (계보 탐색)

| 위험 | 방어 |
|---|---|
| A→B→A 고리 | 지나온 사람 집합으로 감지 → `cycle` |
| 자기 자신을 초대자로 | `next === current.userId` → `self` |
| 초대자가 삭제/제외됨 | `byId.get()` 실패 → `missing_inviter` |
| 사슬이 비정상적으로 김 | `MAX_REFERRAL_DEPTH = 50` → `too_deep` |

**이상이 있으면 임의의 캠페인에 넣지 않고 `(뿌리 불명)`으로 두고 건수를 화면에 표시한다.**

## 8. 남는 한계

- 계측(2026-08-31) 이전 사용자는 `landing_opened`가 없어 `acquisition_campaign`도 거의 비어 있다.
  **추측 backfill을 하지 않는다** — `(직접 유입)` 또는 `(뿌리 불명)`으로 남는다
- `invited_by`는 한 명만 담는다. 여러 사람이 같은 사람을 권한 경우는 첫 번째만 남는다
  (first-touch 원칙과 같다)
