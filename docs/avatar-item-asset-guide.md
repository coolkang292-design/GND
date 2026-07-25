# GND 장착 아바타 · 아이템 이미지 제작 가이드

기존 7단계 풀씬 캐릭터(`public/characters/char-1~7.png`)는 **그대로 유지**한다.
이 문서는 아이템 장착 전용으로 **새로 만드는** 아바타 7장과 아이템 PNG의 규격이다.

> 기존 풀씬 캐릭터의 제작 지침은 `docs/design/character-image-guide.md`에 있다.
> 이 문서는 그것을 대체하지 않는다 — 두 세트는 용도가 다르며 공존한다.

---

## 0. 왜 따로 만드는가

기존 캐릭터는 단계마다 자세·카메라·조명이 전부 다르다(char-1은 앉아서 웅크림,
char-5는 데드리프트 로우앵글). 같은 후드티 PNG를 붙일 자리가 서로 다르므로
아이템 1종당 7벌을 그려야 한다 — 아이템이 늘어날수록 7배로 폭발한다.

장착 아바타는 **7장 전부 동일한 구도·동일한 체형**으로 만든다.
그러면 아이템 1종 = PNG 1장이고, 7단계 전부에 그대로 맞는다.

| | 성장 캐릭터 (기존) | 장착 아바타 (신규) |
|---|---|---|
| 역할 | 레벨·단계 서사 | 아이템 옷걸이 |
| 구도 | 단계마다 다름 | 7장 동일 |
| 배경 | 그림에 포함 | 투명 |
| 노출 | 홈 대표 카드, 성장 허브 | 꾸미기 화면, 피드, 크루 카드 |

---

## 1. 공통 규격 (7장 + 모든 아이템이 동일)

```
캔버스      1024 × 1536 px (2:3), PNG, 알파 채널
배경        완전 투명 (그림자·바닥·후광 없음)
구도        정면 전신, 좌우 대칭, A포즈 (팔을 몸에서 약 30도 벌림)
시선        정면
```

**신체 앵커 — 7장 모두 이 좌표를 지킨다. 아이템 정렬의 기준이다.**

| 부위 | 캔버스 상단에서 | px |
|---|---|---|
| 머리 최상단 | 10% | 154 |
| 눈높이 | 22% | 338 |
| 어깨선 | 32% | 492 |
| 가슴 중앙 | 40% | 614 |
| 허리 | 52% | 799 |
| 무릎 | 72% | 1106 |
| 발바닥 | 92% | 1413 |

```
몸 중심선     가로 50% (512px)
어깨 너비     캔버스 폭의 42% (430px)
```

> **체형은 7장 모두 동일하다.** 근육량·키·몸통 굵기를 단계별로 바꾸면
> 같은 옷이 한쪽에선 헐렁하고 한쪽에선 터진다. 성장감은 기존 풀씬 7장이
> 이미 담당하므로, 아바타는 옷걸이 역할만 한다.

### 성별 — 구분하지 않는다

아바타는 **중성 불독 한 세트**다. 남/여를 나누지 않는다.

- GND의 캐릭터는 불독이지 사람이 아니다. "여성 불독"을 그리려면 속눈썹·리본·
  잘록한 허리 같은 걸 붙여야 하는데, 그 순간 스테레오타입만 남고 캐릭터성이 죽는다.
- 기존 성장 캐릭터 7장이 이미 무성별이다. 아바타만 성별이 있으면 같은 사람의
  두 모습으로 안 읽힌다.
- 성별을 나누면 몸 실루엣이 달라져 **아이템도 전부 2배**가 된다(29장 → 58장).
  이후 아이템을 추가할 때마다 영구적으로 2장씩이다.

성별 표현이 필요하면 **아이템으로 고르게** 한다 — 버킨백·플랩백을 들든,
백팩을 메든 사용자가 정한다. 중성 실루엣이라 무엇을 얹어도 맞는다.

### 기본 복장 — 7장 모두 동일한 최소 베이스

```
상체   몸에 밀착된 검은 민소매 탱크톱
하체   몸에 밀착된 검은 숏 타이츠
발     맨발
```

**단계별로 기본 복장을 다르게 하면 안 된다.** 아이템은 이 위에 덮이는데,
기본 복장이 두꺼우면 밑에서 삐져나온다.

```
아바타가 컷오프 후드 조끼를 입고 있음
  + 나이개 드라이핏 티셔츠 장착
  = 후드 조끼가 티셔츠 밑으로 삐져나옴   ← 깨짐
```

밀착 베이스 레이어여야 어떤 상의·하의·신발을 얹어도 완전히 가려진다.
게임의 기본 아바타가 속옷 차림인 이유가 이것이다.

**그래서 단계 차이는 이 넷으로만 낸다:** 표정 · 눈빛 · 털 상태 · 오라

---

## 2. 제작 순서 (일관성 확보)

1. **3단계(일단하개)를 먼저 만든다.** 중간 단계라 기준으로 삼기 좋다.
2. 마음에 들 때까지 3단계만 반복 생성한다.
3. 확정된 3단계 이미지를 **참조 이미지로 첨부**하고 나머지 6장을 생성한다.
   프롬프트에 반드시 넣을 문장:
   > "Use the attached image as the exact reference for body proportions,
   > pose, camera angle, and canvas placement. Keep the body identical.
   > Change only the facial expression, eyes, fur condition, and base clothing."
4. 7장이 다 나오면 **겹쳐서 확인한다.** 어깨선·발바닥이 어긋나면 그 장만 재생성.

---

## 3. 단계별 생성 프롬프트

### 공통 접두 (7장 모두 앞에 붙인다)

```
A full-body front-facing character portrait of a stocky bulldog character,
standing upright on two legs in a relaxed A-pose with arms angled about
30 degrees away from the body. Perfectly symmetrical, facing the camera directly.

STRICT LAYOUT REQUIREMENTS:
- Canvas 1024x1536, fully transparent background (no shadow, no ground, no glow behind)
- Top of head at 10% from the top edge
- Eye line at 22% from the top
- Shoulder line at 32% from the top
- Waist at 52% from the top
- Soles of the feet at 92% from the top
- Body centered horizontally, shoulder width 42% of canvas width
- Identical body proportions and muscle mass in every variant

GENDER: strictly gender-neutral. No eyelashes, no lipstick, no hair bow,
no cinched waist, no chest definition, no other gendered features.
A single unisex silhouette used by every user.

BASE CLOTHING — IDENTICAL IN ALL SEVEN VARIANTS, DO NOT CHANGE:
- Tight-fitting plain black sleeveless tank top
- Tight-fitting plain black short tights
- Bare feet
- No jacket, no hood, no shoes, no hat, no accessories, no held objects
- The base layer must be skin-tight so that clothing items drawn on top
  completely cover it with nothing peeking out underneath

Semi-realistic 3D render style, dramatic rim lighting from the upper left,
high detail, clean alpha edges.
```

### 1단계 — 개노답

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: exhausted, defeated, heavy-lidded eyes looking slightly down.
Fur: dull, matted, patchy, unkempt.
Aura: none.
Mood: someone who has given up but is still standing.
```

### 2단계 — 눈떴개

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: just woke up, one eyebrow raised, a first spark of awareness in the eyes.
Fur: still rough but no longer patchy.
Aura: a very faint warm glow at the silhouette edge.
Mood: the moment of noticing something has to change.
```

### 3단계 — 일단하개  ← 이 장을 먼저 만들고 기준으로 삼는다

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: neutral determination, jaw set, eyes forward and steady.
Fur: clean, groomed.
Aura: none.
Mood: not motivated, just showing up anyway.
```

### 4단계 — 물고가개

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: stubborn, teeth slightly gritted, intense focused stare.
Fur: clean, with a slight sheen of sweat.
Aura: faint heat shimmer around the shoulders.
Mood: refusing to let go.
```

### 5단계 — 미쳐보개

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: wild-eyed intensity, slight manic grin, pupils sharp.
Fur: damp with sweat, bristling slightly.
Aura: violet electric arcs crackling faintly around the arms.
Mood: past the point of reason.
```

### 6단계 — 판을짜개

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: calm, calculating, faint knowing smirk, sharp confident eyes.
Fur: immaculate, well-conditioned.
Aura: thin cool blue outline light.
Mood: in control, several moves ahead.
```

### 7단계 — 전설이개

```
[공통 접두]

STAGE VARIATION (base clothing stays exactly as specified above):
Expression: serene authority, eyes glowing faint gold, utterly composed.
Fur: pristine with a subtle golden sheen at the highlights.
Aura: warm golden light along the silhouette edge.
Mood: nothing left to prove.
```

---

## 4. 아이템 PNG 규격

**핵심: 아이템도 아바타와 같은 1024×1536 캔버스에 그린다.**

후드티를 그릴 때 "후드티만" 잘라서 그리는 게 아니라, **아바타가 서 있을 자리에
맞춰 투명 캔버스 위 제 위치에** 그린다. 그러면 앱에서 합성할 때 좌표 계산이
전혀 필요 없다 — 그냥 같은 자리에 겹치면 맞는다.

```
캔버스   1024 × 1536 px (아바타와 동일)
배경     완전 투명
위치     아바타 앵커에 맞춘 실제 착용 위치
조명     상단 좌측 림라이트 (아바타와 동일)
```

**아이템 생성 프롬프트 템플릿**

```
[확정된 3단계 아바타 이미지를 참조로 첨부]

Draw ONLY the {아이템 이름} positioned exactly where it would be worn on the
attached character. Output on a 1024x1536 fully transparent canvas with the item
at its exact worn position — do NOT draw the character, only the item.
The item must be fully opaque and large enough to completely cover the
character's black base layer underneath — no part of the base tank top or
tights may remain visible around the edges.
Match the attached image's lighting: rim light from the upper left.
Semi-realistic 3D render style, clean alpha edges, no shadow on the background.
```

### 슬롯과 z-순서

합성은 z 낮은 것부터 쌓는다.

| z | 슬롯 | 예시 |
|---:|---|---|
| 10 | `prop` (배경) | 펜트하우스, 전용기 (아바타 뒤) |
| 20 | `bag` (뒤) | 백팩 |
| **30** | **아바타 본체** | |
| 40 | `bottom` | 조거, 데님, 슬랙스 |
| 50 | `top` | 후드, 패딩, 트렌치코트, 트랙탑 |
| 60 | `shoes` | 스니커즈, 로퍼 |
| 70 | `wrist` | 시계 |
| 80 | `head` | 캡, 선글라스, 버킷햇 |
| 85 | `bag` (앞) | 핸드백, 토트 |
| 90 | `hand` | 샴페인, 서류가방, 클러치 |
| 100 | `prop` (전경) | 슈퍼카 (아바타 앞) |

`prop`과 `bag`은 아이템에 따라 아바타 앞뒤가 갈린다 — 표의 z는 기본값이고
실제 순서는 `items.z_layer` 행 값이 결정한다. 슬롯당 동시 장착은 1개다.

아이템은 전부 **패션 또는 성공의 상징**이다 (명품 의류·신발·가방·시계,
슈퍼카·펜트하우스·전용기). 운동용품은 만들지 않는다.

---

## 5. 파일 배치

| | 위치 | 이유 |
|---|---|---|
| 아바타 7장 | `public/avatars/avatar-1~7.png` | 단계 수 고정, 배포에 포함 |
| 아이템 PNG | **Supabase Storage** `items/` 버킷 | 계속 늘어남 — 앱 배포 없이 추가 |

아이템을 `public/`에 두면 아이템 하나 추가할 때마다 재배포해야 하고 번들이
계속 커진다. Storage에 두면 **① PNG 업로드 ② items 테이블에 row 1줄**로
상점에 즉시 등장한다.

---

## 6. 제작 목록 — 총 36장

### 아바타 7장 (필수 · 먼저)

| 파일 | 단계 |
|---|---|
| `avatar-1.png` ~ `avatar-7.png` | 개노답 · 눈떴개 · 일단하개 · 물고가개 · 미쳐보개 · 판을짜개 · 전설이개 |

7장이 없으면 아이템을 만들 기준(참조 이미지)이 없다. **3단계부터.**

### 아이템 29장

| 슬롯 | 장수 | 아이템 |
|---|---:|---|
| `head` | 4 | 나이개 캡 · 레이개 선글 · 버버개 버킷햇 · (구찌개 선글 예비) |
| `top` | 6 | 나이개 드라이핏 · 아디다개 트랙탑 · 노개페이스 눕시 · 몽클개 패딩 · 버버개 트렌치 · 구찌개 트랙수트 |
| `bottom` | 2 | 나이개 테크 조거 · 리바개 501 |
| `shoes` | 4 | 아디다개 울트라부스트 · 개조던 1 · 발렌시개 트리플S · 구찌개 로퍼 |
| `wrist` | 3 | 애플워개 울트라 · 롤렉개스 · 파텍개립 |
| `bag` | 3 | 루이비개 백팩 · 개넬 플랩백 · 에르개스 버킨 |
| `hand` | 2 | 개페리뇽 샴페인 · 루이비개 서류가방 |
| `prop` | 6 | 테슬개 · 포르개 911 · 벤개 G바겐 · 람보르개니 · 펜트개우스 · 전용기 |

### 단계별 최소 세트

전부 만들고 시작할 필요는 없다. 구현 단계에 맞춰 나눠 만든다.

| 구현 단계 | 필요한 이미지 | 장수 |
|---|---|---:|
| A 배지 엔진 | **없음** | 0 |
| B 포인트 원장 | **없음** | 0 |
| C 아바타·합성 | 아바타 7장 + 아무 아이템 3장 (슬롯이 다른 것으로 — 예: top·shoes·prop) | 10 |
| D 상점·꾸미기 | common·rare 14장 | 14 |
| E 소셜 노출 | 추가 없음 | 0 |
| 이후 | epic·legend 12장을 여유 있게 | 12 |

**A·B는 이미지가 한 장도 필요 없다.** 배지 따서 포인트 쌓이는 것까지는
아트 작업과 무관하게 먼저 굴러간다.
