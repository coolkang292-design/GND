# 설계 — 응원 포인트

- 작성: 2026-07-29
- 관련: `2026-07-29-challenge-rooms-design.md` (독립적. 이쪽이 더 작아 먼저 진행한다)

## 1. 목표

크루가 운동을 시작했을 때 응원을 보내면 보내는 사람에게 포인트를 준다. 혼자 운동만 하는 것보다 **서로 봐 주는 쪽이 이득**이 되게 만드는 게 목적이다.

## 2. 지금 있는 것

| 재료 | 위치 | 상태 |
|---|---|---|
| `send_cheer` RPC | 현행 정의는 `0039:509` | 크루 연결 기준(0039 전환 완료). 진행 중(`active`) 세션에만, 세션당 3회, 10초 쿨다운 |
| `award_points` | `0032:75` | 멱등. `p_amount <= 0`이면 무동작 |
| `point_transactions` | `0031:60` | `reason`에 CHECK 제약 |
| 멱등 유니크 인덱스 | `0031:77` | `(user_id, reason, source_type, source_id) where transaction_type='earn'` |

**`send_cheer`가 이미 크루 기준이라 챌린지 개편(그룹 제거)의 영향을 받지 않는다.** 그래서 먼저 내보낼 수 있다.

## 3. 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D1 | **상대 1명당 하루 1회**만 지급 | 서로 눈도장 찍는 파밍 차단 |
| D2 | **10P 고정** (불꽃 배수 미적용) | 운동 1회가 100P × 배수(`0032:302`). 응원은 1/10이 적정. 배수를 적용하면 고연속 유저가 응원만으로 과하게 번다 |
| D3 | **보내는 사람만** 지급 | 받는 쪽에도 주면 둘이서 서로 응원하는 담합이 순이익이 된다 |
| D4 | **응원(`cheers`)만.** 이모지 리액션 제외 | 리액션은 한 번 탭이라 사실상 무비용이고, RPC가 아닌 평범한 insert라 트리거를 새로 달아야 한다. 비용 대비 이득이 없다 |
| D5 | 상한 초과 시 **응원은 성공, 포인트만 0** | 응원 자체를 막으면 "왜 응원이 안 되지"가 된다. 응원은 사회적 행동이고 포인트는 부산물이다 |

## 4. 설계

### 4.1 멱등 키가 곧 상한

`award_points`는 유니크 위반을 잡아 0을 반환한다 (`0032:96`). 그러니 **키를 상한 모양으로 잡으면 별도 카운팅 로직이 필요 없다.**

```
reason      = 'cheer_sent'
source_type = 'cheer'
source_id   = <받는 사람 uuid> || ':' || <KST 날짜 YYYY-MM-DD>
```

`(user_id, reason, source_type, source_id)` 유니크 인덱스가 곧 "보낸 사람 × 받은 사람 × 날짜 = 1회"다. 같은 사람에게 그날 두 번째 응원을 보내면 insert가 유니크 위반으로 걸려 0P가 반환되고, 응원 자체는 정상 처리된다 (D5).

KST 날짜는 `(now() at time zone 'Asia/Seoul')::date`로 만든다. 앱의 하루 경계가 KST 기준이다 (`domain/time.ts`).

### 4.2 변경 지점 — 두 곳뿐

**(1) `point_transactions.reason` CHECK에 값 추가**

```sql
alter table public.point_transactions drop constraint if exists point_transactions_reason_check;
alter table public.point_transactions add constraint point_transactions_reason_check
  check (reason in (
    'workout_completed','badge_earned','item_purchase',
    'refund','admin_adjustment',
    'cheer_sent'                                    -- 0041
  ));
```

⚠ 기존 5개 값을 **하나도 빠뜨리면 안 된다.** 빠뜨리면 그 값을 쓰는 기존 지급이 조용히 죽는다.

**(2) `send_cheer`에 지급 한 줄 추가**

`cheers` insert 직후, 알림 발송 앞에 넣는다.

```sql
v_points := public.award_points(
  auth.uid(), 10, 'cheer_sent',
  'cheer', s.user_id::text || ':' ||
           (now() at time zone 'Asia/Seoul')::date::text,
  null,
  jsonb_build_object('session_id', p_session_id, 'cheer_type', p_cheer_type));
```

`send_cheer`는 `returns public.cheers`라 지급 결과를 돌려줄 자리가 없다. **반환 타입은 그대로 둔다** — 호출부(`social.ts:489`)가 반환값을 안 쓰고, 타입을 바꾸면 그쪽까지 건드려야 한다. 화면에는 §4.3으로 알린다.

⚠ **현행 정의는 `0039:509`다.** `0011:319`가 아니다. 0011 파일을 고치면 아무 일도 안 일어난다 (인수인계서 §5.1). 새 마이그레이션에서 `pg_get_functiondef`로 뽑은 현행 정의에 위 블록만 얹는다.

### 4.3 화면

응원 버튼을 누른 뒤 토스트에 `📣 응원 보냈어요 +10P`를 띄운다. 그날 이미 그 사람에게 응원했으면 포인트 문구 없이 `📣 응원 보냈어요`만 나온다.

지급 여부는 `send_cheer` 반환값에 없으므로 **클라이언트가 지갑을 다시 읽어 판단하지 않는다** — 그건 왕복이 하나 더 늘고 경쟁 상태도 생긴다. 대신 `point_transactions`를 이미 읽는 포인트 내역 화면(`getRecentPointTransactions`)에서 확인되게 하고, 토스트는 **"오늘 이 사람에게 응원한 적 있는지"를 클라이언트가 로컬로 판단**한다. 틀려도 손해가 없는 표시용 문구다.

포인트 내역 화면에 `cheer_sent` 라벨을 추가한다 — "응원 보내기".

## 5. 검증

`scripts/cheer-points-check.mjs` (기존 골격: `.env.local` 파싱 → anon signup → `check()` 집계 → service_role 정리)

① 크루 세션에 응원 → 지갑 +10P
② 같은 사람에게 같은 날 두 번째 응원 → 응원은 성공, 지갑 변화 없음
③ 두 번째 응원도 `cheers` 행은 정상 생성
④ 다른 사람에게 응원 → 다시 +10P
⑤ 세션당 3회 상한(`cheer_limit`)은 그대로 동작
⑥ 10초 쿨다운(`cheer_cooldown`)은 그대로 동작
⑦ 본인 세션 응원은 여전히 `own_session`
⑧ 비크루 세션 응원은 여전히 `session_not_found`
⑨ 완료된 세션 응원은 여전히 `not_active`
⑩ `point_transactions`에 `reason='cheer_sent'` 행 생성
⑪ 기존 `workout_completed` 지급이 CHECK 변경 후에도 정상
⑫ KST 자정 경계 — 날짜가 바뀌면 같은 사람에게 다시 지급

⑤~⑨는 **회귀 검증**이다. `send_cheer`를 통째로 다시 쓰므로 기존 규칙이 살아 있는지 확인해야 한다. `scripts/rls-test.mjs:403`에 이미 있는 케이스와 겹치므로 그 스크립트도 같이 돌린다.

**정리 조건:** 삭제는 `cheerpt-${RUN}-`로 시작하는 이메일에만. 실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)는 건드리지 않는다.

## 6. 범위 밖

- 이모지 리액션 포인트 (D4)
- 받는 사람 지급 (D3)
- 응원 관련 배지 (예: "응원왕 100회")
- 응원 문구 프리셋·커스텀 메시지 개선
