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
| D6 | **발신자 기준 하루 총 지급 횟수 상한을 두지 않는다** | §3.1 |
| D7 | RPC가 **실제 지급 결과를 반환**한다 | 클라이언트가 로컬 기록으로 추측하면 기기·탭이 갈릴 때 틀린다 (§4.4) |

### 3.1 하루 총 상한을 두지 않는 이유 (D6)

제한은 이것 하나뿐이다.

```
보낸 사람 × 받은 사람 × KST 날짜 = 1회 지급
```

"발신자 하루 총 3회" 또는 "하루 총 30P" 같은 상한은 **이번 범위에서 제외한다.**

이 기능의 현재 목적은 포인트 경제 통제가 아니라 **크루 간 상호작용과 재방문 빈도를 늘리는 것**이다. 크루가 많을수록 응원 기회가 늘어나는 것은 초기 제품 의도에 부합한다 — 여러 크루에게 응원을 보내려면 앱을 여러 번 열어야 하고, 그게 노리는 행동이다. 초기부터 총량을 조이면 그 유인을 스스로 없앤다.

대신 **운영 지표를 관측한다.** 비정상 파밍이 데이터로 확인될 때 하루 총 상한·주간 상한·감쇠 규칙을 별도 스펙으로 검토한다.

| 지표 | 보는 이유 |
|---|---|
| 사용자당 일평균 응원 횟수 | 정상 사용 범위의 윤곽 |
| 사용자당 일평균 응원 포인트 | 상한 필요 시점의 기준선 |
| 운동 완료 포인트 대비 응원 포인트 비율 | 응원이 운동을 대체하기 시작했는지 |
| 상호 반복 응원 비율 | 둘이서 매일 주고받는 담합 패턴 |
| 크루 수와 응원 포인트의 상관관계 | 크루 수집만으로 버는 구조인지 |
| **운동 없이 응원 포인트만 획득하는 사용자 비율** | 가장 직접적인 파밍 신호 |

마지막 지표가 임계에 닿으면 D6을 뒤집는 것보다 "내가 오늘 운동한 날만 지급"을 먼저 검토한다 — 콕 찌르기(`0028`)가 이미 쓰는 방식이라 일관된다.

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

**(2) `send_cheer`에 지급 블록 추가 — 예외 격리 필수**

`cheers` insert 직후, 알림 발송 앞에 넣는다.

```sql
-- 포인트 지급은 응원을 취소시키지 않는다 (D5).
begin
  v_points := public.award_points(
    auth.uid(), 10, 'cheer_sent',
    'cheer', s.user_id::text || ':' ||
             (now() at time zone 'Asia/Seoul')::date::text,
    null,
    jsonb_build_object('session_id', p_session_id, 'cheer_type', p_cheer_type));
exception when others then
  v_points := 0;
  raise warning 'cheer_points_failed: sender=% receiver=% sqlstate=% msg=%',
    auth.uid(), s.user_id, sqlstate, sqlerrm;
end;
```

**왜 감싸야 하는가.** D5는 "포인트가 안 나가도 응원은 성공한다"인데, `award_points`가 예상 못 한 오류를 내면 **전체 트랜잭션이 롤백되어 응원 자체가 사라진다.** `cheers` insert가 이미 끝난 뒤라도 마찬가지다. 유니크 충돌은 `award_points`가 내부에서 잡아 0을 반환하므로(`0032:96`) 여기 걸리지 않는다 — 이 블록이 잡는 것은 그 밖의 예외(CHECK 위반, 지갑 행 잠금 실패 등)다.

격리 범위를 지킨다:

| 대상 | 처리 |
|---|---|
| 유니크 충돌 (하루 1회 초과) | `award_points`가 0 반환 — 기존 그대로 |
| 그 밖의 포인트 지급 오류 | **응원 insert·알림을 취소하지 않음** + `raise warning` |
| 응원 권한 검사 (`session_not_found`) | 예외 격리 **밖.** RPC 자체가 실패 |
| 세션 상태 검사 (`not_active`, `own_session`) | 예외 격리 **밖** |
| 쿨다운·세션당 상한 (`cheer_cooldown`, `cheer_limit`) | 예외 격리 **밖** |

`exception when others`는 `award_points` 호출 **하나만** 감싼다. 범위를 넓히면 권한 검사 실패까지 삼켜 비크루가 응원에 성공하게 된다.

오류를 완전히 숨기지 않는다. `raise warning`은 트랜잭션을 중단시키지 않으면서 Postgres 로그에 남아 운영에서 확인된다.

⚠ **현행 정의는 `0039:509`다.** `0011:319`가 아니다. 0011 파일을 고치면 아무 일도 안 일어난다 (인수인계서 §5.1). 새 마이그레이션에서 `pg_get_functiondef`로 뽑은 현행 정의에 위 블록을 얹는다.

### 4.3 반환값 변경 — 지급 결과를 돌려준다 (D7)

`send_cheer`의 현재 시그니처는 `returns public.cheers`라 지급 결과를 담을 자리가 없다.

**클라이언트가 로컬 기록으로 "오늘 이 사람에게 첫 응원인지"를 추측하면 안 된다.** 다른 기기·다른 브라우저·로컬 데이터 삭제·동시 탭에서 실제 지급은 0P인데 `+10P`로 표시된다. 포인트 인식이 이 기능의 목적이므로 틀린 표시는 그대로 목적 훼손이다.

**반환 형태**

```
{
  "cheer": { ...생성된 cheers 행... },
  "points_awarded": 10 | 0
}
```

**호출부 조사 결과 — 앱은 1곳, 스크립트는 2개**

| 위치 | 사용 | 조치 |
|---|---|---|
| `src/lib/social.ts:489` | `const { error } = ...` — 반환값 **버림** | `data`를 읽어 `points_awarded` 반환하도록 변경. `sendCheer`의 반환 타입 `Promise<void>` → `Promise<{ pointsAwarded: number }>` |
| `scripts/rls-test.mjs` | 7회 호출. **행 모양에 직접 의존** | ⚠ 아래 참조 |
| `scripts/crew-link-check.mjs` | 3회 호출. `status`와 에러코드만 확인 | 변경 불필요 |

앱 호출부가 한 곳뿐이므로 **새 RPC를 만들지 않고 기존 `send_cheer`의 반환 타입을 바꾼다.**

⚠ **`rls-test.mjs`의 두 단언이 깨진다.**

```
411행  ch1.json?.cheer_type === "fire"      →  ch1.json?.cheer?.cheer_type
429행  ch3.json?.message === "화이팅!"       →  ch3.json?.cheer?.message
```

나머지 5회는 `status`와 에러 문자열만 보므로 영향 없다. 이 저장소의 회귀 기준선이 `rls-test.mjs`이므로 **반환 타입 변경과 같은 커밋에서 고친다.**

생성 타입(`src/lib/types.ts`)과 클라이언트 타입도 함께 갱신한다.

### 4.4 화면

토스트는 **서버가 돌려준 `points_awarded`를 그대로 따른다.**

```
points_awarded = 10  →  📣 응원 보냈어요 +10P
points_awarded = 0   →  📣 응원 보냈어요
```

클라이언트가 지갑 잔액 차이로 지급 여부를 역산하지 않는다 — 왕복이 늘고 동시 지급과 경쟁한다.

포인트 내역 화면(`getRecentPointTransactions`)에 `cheer_sent` 라벨을 추가한다 — "응원 보내기".

## 5. 검증

`scripts/cheer-points-check.mjs` (기존 골격: `.env.local` 파싱 → anon signup → `check()` 집계 → service_role 정리)

**지급 규칙**
① 크루 세션에 응원 → 지갑 +10P
② **10초 쿨다운이 지난 뒤** 같은 사람에게 같은 날 다시 응원 → 응원 성공, 지갑 변화 없음
③ 두 번째 응원도 `cheers` 행은 정상 생성
④ 다른 사람에게 응원 → 다시 +10P
⑩ `point_transactions`에 `reason='cheer_sent'` 행 생성
⑫ KST 자정 경계 — 날짜가 바뀌면 같은 사람에게 다시 지급

**회귀 (기존 규칙 보존)**
⑤ 세션당 3회 상한(`cheer_limit`)
⑥ **10초 이내 재응원 → `cheer_cooldown` 오류**
⑦ 본인 세션 응원 → `own_session`
⑧ 비크루 세션 응원 → `session_not_found`
⑨ 완료된 세션 응원 → `not_active`
⑪ 기존 `workout_completed` 지급이 CHECK 변경 후에도 정상

**반환값·예외 (D7·D5)**
⑬ 첫 응원 RPC 반환값의 `points_awarded = 10`
⑭ 같은 상대에 대한 당일 추가 응원은 `points_awarded = 0`
⑮ 포인트 지급이 0이어도 응원 행과 알림은 정상 생성
⑯ **포인트 지급 오류를 강제로 일으켜도 응원 자체는 유지**
⑰ 서로 다른 기기(토큰)에서 호출해도 중복 지급 없음
⑱ KST 날짜가 바뀐 뒤 같은 상대에게 다시 10P
⑲ **동일 상대의 서로 다른 운동 세션에 응원해도 당일 1회만 지급**
⑳ 다른 상대에게는 각각 10P
㉑ 기존 `send_cheer` 호출부가 모두 새 반환 타입에 대응 (§4.3의 `rls-test.mjs` 2곳 포함)
㉒ `scripts/rls-test.mjs` 전체 통과

### 5.1 ②와 ⑥은 서로 다른 것을 본다

원래 시나리오 ②("같은 사람에게 같은 날 두 번째 응원")는 쿨다운과 충돌한다. 10초 안에 두 번 보내면 `cheer_cooldown`으로 막혀 **하루 1회 지급 규칙이 아니라 쿨다운을 검증하게 된다.**

- **②** — 쿨다운을 넘긴 뒤 재응원. 보는 것은 **지급이 0P인가**
- **⑥** — 10초 이내 재응원. 보는 것은 **`cheer_cooldown`이 뜨는가**

**테스트에서 실제로 10초를 기다리지 않는다.** `rls-test.mjs`는 `await sleep(10500)`을 두 번 써서 그 구간에만 21초를 쓴다. 새 스크립트는 service_role로 직전 `cheers` 행의 `created_at`을 과거로 당겨 쿨다운을 통과시킨다 — 시간을 기다리는 대신 시간을 조작한다.

### 5.2 ⑯ 지급 오류를 강제로 일으키는 법

`award_points`는 견고해서 자연스럽게 실패하지 않는다. service_role로 `point_transactions`에 **일시적인 CHECK 제약을 걸어** 지급을 실패시키고, 응원 행과 알림이 남는지 확인한 뒤 제약을 되돌린다. 이 케이스가 없으면 §4.2의 예외 격리가 실제로 동작하는지 아무도 모른다.

### 5.3 ⑲가 필요한 이유

멱등 키가 `받는 사람 + 날짜`라 세션이 달라도 같은 키가 나온다. ①~④만으로는 "세션이 다르면 또 주지 않나"가 검증되지 않는다 — 키 설계가 의도대로인지 확인하는 케이스다.

**정리 조건:** 삭제는 `cheerpt-${RUN}-`로 시작하는 이메일에만. 실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)는 건드리지 않는다.

## 6. 범위 밖

- **발신자 기준 하루 총 지급 상한·주간 상한·감쇠 규칙** (D6) — §3.1의 운영 지표에서 비정상 파밍이 확인될 때 별도 스펙으로 검토
- 이모지 리액션 포인트 (D4)
- 받는 사람 지급 (D3)
- 응원 관련 배지 (예: "응원왕 100회")
- 응원 문구 프리셋·커스텀 메시지 개선
