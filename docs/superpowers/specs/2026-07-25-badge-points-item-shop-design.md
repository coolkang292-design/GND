# 배지 → 포인트 → 아이템 상점 → 캐릭터 장착 설계

작성일: 2026-07-25
자산 규격: `docs/avatar-item-asset-guide.md`

---

## 1. 목표

같은 레벨이라도 사용자마다 캐릭터가 달라 보이게 만든다. 레벨은 노력의 양을
보여줄 뿐 개성을 못 보여준다. 아이템 장착으로 **"같은 Lv.21이라도 나는 다르다"**를
만들고, 현실에서 사기 힘든 명품·고급 운동장비를 노력으로 얻게 해 대리만족을 준다.

```
운동·소셜 활동 → 배지 획득 → 포인트 지급 → 상점 구매 → 캐릭터 장착 → 크루에 노출
```

마지막 "크루에 노출"이 빠지면 차별화가 성립하지 않는다. 자랑할 상대가 없으면
꾸밀 이유가 없다.

---

## 2. 현황과 격차

| 영역 | 현재 | 필요한 것 |
|---|---|---|
| 배지 | `user_badges` 테이블 O. 카탈로그 **3개**, 조건이 `mark_record_beaten` SQL 함수에 하드코딩 | 규칙 테이블화 + 46개 |
| XP·레벨 | `xp_transactions` 원장 + `apply_xp_and_progress` 완비 | 그대로 둔다 |
| 포인트 | **없음** | XP 원장 패턴 복제 (음수 허용) |
| 상점·아이템 | **없음** | 신규 |
| 캐릭터 | 단계별 풀씬 PNG 7장, 자세·조명 제각각 | **그대로 두고** 장착 전용 아바타 7장 신규 |
| 스트릭 | 클라이언트 순수 함수(`domain/streak.ts`)만 존재 | 배지 판정용 SQL 재계산 필요 |

---

## 3. 핵심 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | 배지 조건을 `badge_definitions` **데이터**로 뺀다 | 46개를 SQL 함수에 하드코딩하면 유지 불가. 배지 추가 = seed 한 줄 |
| D2 | 포인트는 **배지에서만** 나온다 | 사용자 결정. 포인트 = 성취의 증표라는 의미가 선명해진다 |
| D3 | **월간 반복 배지**로 장기 수입을 만든다 | 46개를 다 따면 상점이 죽는다. D2를 유지하면서 수입을 잇는 유일한 방법 |
| D4 | 캐릭터를 **둘로 나눈다** — 성장 캐릭터(기존) + 장착 아바타(신규) | 기존 풀씬은 자세·조명이 제각각이라 장착 불가. 연출은 살리고 장착은 따로 |
| D5 | 장착 아바타 7장은 **체형 동일** | 체형이 다르면 옷 1벌이 7벌이 된다. 성장감은 기존 풀씬이 담당 |
| D6 | 아이템 PNG를 **아바타와 같은 캔버스에 착용 위치 그대로** 그린다 | 합성이 좌표 계산 없이 겹치기가 된다. 앵커 테이블 불필요 |
| D7 | 아이템 이미지는 **Supabase Storage** | `public/`에 두면 아이템 추가마다 재배포 + 번들 비대 |
| D8 | 슬롯당 1개, **8슬롯 동시 장착** | 조합이 곧 개성. 슬롯이 하나면 꾸미기가 아니다 |
| D9 | 포인트·아이템 테이블에 `authenticated` **insert/update 권한 없음** | 기존 `user_badges`·`xp_transactions`와 동일. 앱을 뜯어도 위조 불가 |
| D10 | `user_showcase`·`user_items`는 **크루원 select 허용** | 다른 테이블은 전부 본인 전용이나, 자랑이 목적이므로 의도된 예외 |

---

## 4. 데이터 모델

### 4.1 배지 규칙

```
badge_definitions
  badge_key      text pk
  name, description, emoji
  tier           text  -- bronze|silver|gold|legend
  metric_key     text  -- 아래 §5.1 지표
  threshold      numeric
  point_reward   int
  period         text  -- 'lifetime' | 'monthly'
  sort_order     int
  status         text  -- 'active' | 'hidden'
```

기존 `user_badges`는 유지하되 **월간 반복 배지를 담기 위해 PK를 바꾼다**:

```
user_badges
  user_id, badge_key,
  period_key   text not null default 'lifetime'   -- 월간은 '2026-07'
  session_id, earned_at
  primary key (user_id, badge_key, period_key)    -- 기존 (user_id, badge_key)에서 확장
```

기존 3개 행은 `period_key = 'lifetime'`으로 자동 편입된다(default). 데이터 손실 없음.

### 4.2 포인트 원장

`xp_transactions`와 동일한 구조에 **음수(사용)를 허용**한다.

```
point_transactions
  id, user_id
  amount          int      -- 양수=적립, 음수=사용
  transaction_type text    -- earn|spend|refund|admin_adjustment
  reason          text     -- badge_earned|item_purchase|refund|admin_adjustment
  source_type, source_id
  balance_after   int      -- 감사용 스냅샷
  rule_version    text default 'point_v1'
  metadata        jsonb
  created_at
  unique (user_id, reason, source_type, source_id) where transaction_type='earn'

user_wallet
  user_id pk
  balance         int not null default 0 check (balance >= 0)
  lifetime_earned int not null default 0
  updated_at
```

`balance >= 0` 체크 제약 + 구매 시 `select ... for update` 행 잠금 →
동시 구매로 잔액이 마이너스가 되는 것이 **DB 레벨에서 불가능**하다.

### 4.3 상점·소유·장착

```
items
  item_key     text pk
  name, description
  slot         text  -- head|top|bottom|shoes|wrist|hand|back|prop
  category     text  -- 표시용 분류 (운동장비·명품의류·시계·차량…)
  rarity       text  -- common|rare|epic|legend
  price        int
  image_path   text  -- Storage 경로
  z_layer      int   -- 합성 순서 (§6)
  real_price_label text  -- "실제로는 1,500만원" 대리만족 표시
  required_level smallint default 1
  status       text  -- active|hidden
  sort_order   int

user_items
  user_id, item_key
  purchased_at, price_paid
  primary key (user_id, item_key)          -- 소유는 영구, 중복 구매 불가

user_equipment
  user_id, slot, item_key
  equipped_at
  primary key (user_id, slot)              -- 슬롯당 1개
```

---

## 5. 배지 엔진

### 5.1 지표 12종

`evaluate_badges(p_user_id)` 하나가 아래를 **한 번에 집계**한다.

| `metric_key` | 산출 |
|---|---|
| `workout_count` | `workout_sessions` completed, `deleted_at is null` |
| `streak_days` | 위 세션의 KST 날짜 distinct → 간격 5일 미만이면 사슬 유지 (`domain/streak.ts`와 동일 규칙) |
| `total_minutes` | `sum(duration_minutes)` |
| `cheers_received` | `cheers where receiver_id = user` |
| `reactions_received` | `reactions` join 내 세션 |
| `record_beaten` | `record_note is not null` 세션 수 |
| `photo_count` | `workout_images where image_path is not null` |
| `tabata_count` | `tabata_minutes is not null` |
| `challenge_success` | 종료된 챌린지 중 목표 달성 |
| `early_bird` | `started_at` KST 06시 이전 |
| `night_owl` | `started_at` KST 22시 이후 |
| `current_level` | `user_progress.current_level` |

월간 배지는 같은 지표를 **해당 월로 필터**해 계산한다.

### 5.2 판정·지급 흐름

```
evaluate_badges(user)
  1. 지표 12종 집계 → jsonb metrics
  2. badge_definitions ⋈ metrics 로 threshold 통과 & 미보유 배지 선별
  3. user_badges insert (on conflict do nothing)
  4. 신규 배지마다 award_points(user, point_reward, 'badge_earned', badge_key)
  5. 신규가 있으면 notifications 1건 (type='badge_earned')
```

**호출 지점** — 전부 기존 definer RPC 끝에 한 줄 추가:

| 지점 | 이유 |
|---|---|
| `complete_workout_v2` | 운동·시간·사진·타바타·새벽·심야·레벨 |
| `mark_record_beaten` | 기록 갱신 — **기존 하드코딩 배지 지급 블록은 제거**하고 이걸로 대체 |
| `send_cheer` | 응원 받은 사람 기준 |
| 반응 트리거 | 반응 받은 사람 기준 |
| `finalize_challenge` | 챌린지 성공 |

`evaluate_badges`는 멱등이다. 여러 번 불려도 `on conflict do nothing`과
포인트 원장 유니크 인덱스가 중복 지급을 막는다.

### 5.3 카탈로그 (평생 46개)

| 지표 | 임계값 → 티어 | 개수 |
|---|---|---:|
| `workout_count` | 1·10 🥉 / 30·50 🥈 / 100 🥇 / 200 👑 | 6 |
| `streak_days` | 3·7 🥉 / 10 🥈 / 30·60 🥇 / 100 👑 | 6 |
| `total_minutes` | 600 🥉 / 3000 🥈 / 6000 🥇 / 12000 👑 | 4 |
| `cheers_received` | 1·10 🥉 / 50 🥈 / 200 🥇 | 4 |
| `reactions_received` | 10 🥉 / 50 🥈 / 200 🥇 | 3 |
| `record_beaten` | 1·5 🥉 / 10 🥈 / 25 🥇 | 4 |
| `photo_count` | 1·10 🥉 / 50 🥈 / 100 🥇 | 4 |
| `tabata_count` | 1 🥉 / 10 🥈 / 50 🥇 | 3 |
| `challenge_success` | 1 🥈 / 5 🥇 / 10 👑 | 3 |
| `early_bird` | 1 🥉 / 10 🥈 / 30 🥇 | 3 |
| `night_owl` | 1 🥉 / 10 🥈 / 30 🥇 | 3 |
| `current_level` | 10 🥈 / 20 🥇 / 35 👑 | 3 |

지급액: 🥉 200P ×15 · 🥈 600P ×13 · 🥇 2,000P ×13 · 👑 8,000P ×5
= **평생 76,800P**

### 5.4 월간 반복 배지 (매달 리셋)

| 배지 | 조건 | 지급 |
|---|---|---:|
| 이달 8회 | 해당 월 운동 8회 | 300P |
| 이달 12회 | 해당 월 운동 12회 | 600P |
| 이달 16회 | 해당 월 운동 16회 | 900P |
| 이달 무결석 | 해당 월 매주 1회 이상 | 600P |

월 최대 2,400P → **연 28,800P**

이 수치는 최상위 아이템(펜트하우스·전용기)의 도달 기간을 결정한다. 누적 수입:

| | 배지 | 월간 반복 | 누적 |
|---|---:|---:|---:|
| 1년차 | 45,000P | 28,800P | 73,800P |
| 2년차 | +25,000P | +28,800P | 127,600P |
| 3년차 | +6,800P | +28,800P | 163,200P |

하위 아이템을 사면 그만큼 늦어진다. 최상위는 **아무것도 안 사고 3년**,
현실적으로 4~5년짜리 목표다 — 의도된 설계다.

---

## 6. 장착 렌더링

기존 캐릭터는 손대지 않는다. 장착 전용 아바타 7장을 새로 만든다
(규격·생성 프롬프트는 `docs/avatar-item-asset-guide.md`).

아이템 PNG가 아바타와 같은 1024×1536 캔버스에 **착용 위치 그대로** 그려지므로,
합성은 좌표 계산 없이 z-순서로 겹치기만 하면 된다.

| z | 슬롯 |
|---:|---|
| 10 | `prop` (배경형 — 트레드밀·로잉머신) |
| 20 | `back` |
| **30** | **아바타 본체** (`avatar-{stage}.png`) |
| 40 | `bottom` |
| 50 | `top` |
| 60 | `shoes` |
| 70 | `wrist` |
| 80 | `head` |
| 90 | `hand` |
| 100 | `prop` (전경형 — 차량) |

`prop`의 앞/뒤는 `items.z_layer` 값으로 갈린다. 구현은 `position:absolute`
스택 — 캔버스 조작·라이브러리 불필요.

---

## 7. 아이템 카탈로그 (25종)

**누구나 아는 대중 브랜드**로 구성한다. 원 브랜드가 바로 떠올라야 "저걸 갖고 싶다"가
성립하고, 그게 이 시스템의 동기 부여 전부다. `real_price_label`을 상점에 함께
노출해 대리만족을 강화한다 (`롤렉개스 · 22,000P · 실제로는 1,800만원`).

### 🥉 common — 첫 주 ~ 첫 달

| 아이템 | 슬롯 | 가격 | 실제가 |
|---|---|---:|---|
| 🥤 단백질 개셰이크 | hand | 300P | 5만 |
| 🧢 나이개 캡 | head | 500P | 5만 |
| 👕 나이개 드라이핏 | top | 800P | 8만 |
| 👖 나이개 테크 조거 | bottom | 1,000P | 15만 |
| 👟 아디다개 울트라부스트 | shoes | 1,200P | 22만 |
| 💪 하이퍼아이개 마사지건 | hand | 1,500P | 40만 |

### 🥈 rare — 2 ~ 8개월

| 아이템 | 슬롯 | 가격 | 실제가 |
|---|---|---:|---|
| 🕶️ 오클개 선글라스 | head | 2,500P | 30만 |
| 🧥 아디다개 트랙탑 | top | 2,800P | 20만 |
| 👟 개조던 1 레트로 | shoes | 3,500P | 40만 |
| ⌚ 애플워개 울트라 | wrist | 4,000P | 120만 |
| 🧥 노개페이스 눕시 | top | 4,500P | 50만 |
| 🎒 루이비개 백팩 | back | 5,500P | 350만 |
| 👟 발렌시개 트리플S | shoes | 6,000P | 130만 |

### 🥇 epic — 1 ~ 2년

| 아이템 | 슬롯 | 가격 | 실제가 |
|---|---|---:|---|
| 🧥 몽클개 패딩 | top | 10,000P | 300만 |
| 🏋️ 로개 바벨 풀세트 | hand | 12,000P | 500만 |
| 👜 개넬 클래식 플랩백 | back | 16,000P | 1,500만 |
| 🧥 구찌개 트랙수트 | top | 18,000P | 400만 |
| ⌚ 롤렉개스 서브멍리너 | wrist | 22,000P | 1,800만 |
| 🚗 테슬개 모델 개 | prop(앞) | 28,000P | 8,000만 |

### 👑 legend — 인생 목표

| 아이템 | 슬롯 | 가격 | 실제가 | 도달 |
|---|---|---:|---|---|
| ⌚ 파텍개립 노틸개스 | wrist | 40,000P | 3억 | 약 1년 |
| 🚗 포르개 911 | prop(앞) | 50,000P | 2억 | 약 1.5년 |
| 🚙 벤개 G-바겐 | prop(앞) | 60,000P | 2.5억 | 약 2년 |
| 🏎️ 람보르개니 우라멍 | prop(앞) | 80,000P | 4억 | 약 2.5년 |
| 🏙️ 한강뷰 펜트개우스 | prop(뒤) | 100,000P | 100억 | 약 3년 |
| ✈️ 개인 전용기 | prop(뒤) | 130,000P | 500억 | 약 4년 |

> 펜트하우스·전용기는 `prop(뒤)` 슬롯이라 **아바타 뒤 배경으로 깔린다.**
> 전용기 앞에 명품을 두른 개가 서 있는 그림이 된다 — 최종 플렉스.
> `개인 전용기`는 말장난이 저절로 성립한다 (개 + 인 전용기).

**네이밍 리스크**: 원 브랜드가 명확히 식별되는 패러디다. 크루 단위 사적 사용에서는
실질 위험이 낮으나, 앱스토어 등록·공개 서비스 시 재검토가 필요하다.
`items.name`은 DB 데이터이므로 코드 변경 없이 일괄 교체할 수 있게 둔다.

---

## 8. 화면

| 화면 | 내용 |
|---|---|
| **상점** (신규 탭 또는 프로필 진입) | 등급·슬롯 필터, 가격·실제가, 보유/미보유/잔액부족 상태, 구매 확인 시트 |
| **꾸미기** (신규) | 좌: 합성 아바타 미리보기 / 우: 슬롯 8칸. 슬롯 탭 → 보유 아이템 선택 → 즉시 반영 |
| **내 차고** (프로필) | 보유 전체 진열, 미보유는 잠금 실루엣 + 가격 |
| **배지** (기록 탭) | 기존 `badge-shelf.tsx` 확장 — 46개 + 월간, 티어별 그룹, 지급 포인트 표시 |
| 홈 `character-card` | **기존 풀씬 캐릭터 유지** + 포인트 잔액 표시 |
| 피드 `feed-item` | 닉네임 옆 합성 아바타 썸네일 |
| `crew-card` | 크루원별 합성 아바타 썸네일 |

---

## 9. 보안·정합성

1. `point_transactions`·`user_wallet`·`user_items`·`user_equipment`·`badge_definitions`
   모두 `authenticated`에게 **select만** 부여. 변경은 security definer RPC 경로뿐.
2. `purchase_item(p_item_key)` 은 단일 트랜잭션:
   `select ... for update` 잔액 잠금 → 소유 중복 확인 → `items.price` **서버 값**으로
   차감 → `user_items` insert → `point_transactions` spend 기록.
   가격을 클라이언트가 보내지 않는다.
3. `equip_item(p_slot, p_item_key)` 은 `user_items` 소유 확인 후에만 반영.
4. `evaluate_badges`는 멱등. 중복 호출해도 배지·포인트가 두 번 지급되지 않는다.
5. `user_wallet.balance`는 캐시다. 원장 `sum(amount)`로 언제든 재계산·검증 가능.

---

## 10. 검증

| 층 | 방법 |
|---|---|
| 도메인 단위 | 배지 임계값 판정·스트릭 사슬·합성 z-순서를 순수 함수로 분리해 TDD (`src/lib/domain/`) |
| SQL | 실 DB 스크립트 — 46개 배지 각 임계값 경계, 월간 리셋, 잔액 부족 구매 거부, 중복 구매 거부, 동시 구매 경합, `evaluate_badges` 멱등 |
| RLS | 2인 픽스처 — 타인 지갑·거래 내역 조회 차단 / 크루원 장비·소유 아이템 조회 **허용** |
| 시각 | 아바타 7장 × 대표 아이템 조합 합성 스크린샷 육안 확인 |
| 실기기 | 배지 획득 → 포인트 알림 → 구매 → 장착 → 피드에 반영까지 폰에서 1회 완주 |

---

## 11. 범위 제외

- 아이템 판매·환불·거래 (`refund` 사유는 스키마에만 두고 UI 없음)
- 유료 재화, 확률형 뽑기
- 시즌제·기간 한정 아이템
- 아이템에 의한 XP·스탯 보정 (**순수 외형만**)
- 기존 성장 캐릭터 7장 재제작
