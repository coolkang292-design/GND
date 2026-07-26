# GND 배지 이미지 제작 가이드 · 생성 프롬프트 (30장)

설계: `docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md`
규격 참고: `docs/avatar-item-asset-guide.md` (아바타·아이템용 — 이 문서와 별개)

---

## 0. 규격

```
캔버스      512 × 512 px 정사각, PNG, 알파 채널
배경        완전 투명 (바닥 그림자·후광 없음)
형태        정육각형 배지, 캔버스 가운데 정렬
여백        육각형 바깥으로 상하좌우 6% 여백 (약 31px) — 잘림 방지
저장 위치    public/badges/{badge_key}.png
```

**파일명은 아래 표의 `badge_key`와 정확히 같아야 한다.** 앱이
`/badges/${badge_key}.png`로 바로 찾아 쓰기 때문에, 이름이 다르면 그 배지만 안 뜬다.

### 절대 넣지 말 것

- **글자·숫자** — 이미지 생성 모델은 한글을 제대로 못 쓴다. 이름·설명·수치는 앱이 렌더한다.
- **배경·바닥·그림자** — 배지는 어두운 카드 위에 얹히므로 투명이어야 한다.
- **그린스크린** — 누끼를 따도 가장자리에 초록이 남는다. 반드시 투명 배경으로 받는다.

### 완성 후

30장이 다 모이면 용량을 줄인다. 캐릭터 7장이 각 2MB라 프리뷰가 타임아웃됐던 전례가 있다
(`PROGRESS.md` 2026-07-23). 배지는 512px이라 장당 100KB 이하가 목표다.

```bash
npx sharp-cli --input "public/badges/*.png" --output public/badges --optimize
```

---

## 1. 티어 4종 — 프레임이 등급을 말한다

배지 30장은 **가운데 그림만 다르고 테두리는 티어별로 똑같다.** 그래야 진열대에서
등급이 한눈에 읽힌다. 티어별 프레임 사양은 아래와 같다.

| 티어 | 프레임 | 발광 | 개수 |
|---|---|---|---:|
| 🥉 bronze | 무광 구리·브론즈 육각 테두리, 두께 보통 | 없음 | 8 |
| 🥈 silver | 광택 은·백금 육각 테두리, 안쪽에 얇은 이중선 | 은은한 흰빛 | 9 |
| 🥇 gold | 황금 육각 테두리, 두껍고 모서리에 작은 보석 6개 | 따뜻한 금빛 | 7 |
| 👑 legend | 무지개빛 홀로그램 육각 테두리, 가장 두껍고 장식적 | 강한 무지개 오라 | 5 |
| 🔥 반복 | bronze와 동일 프레임 + 불꽃 모티프 | 주황 발광 | 1 |

---

## 2. 작업 순서 — 이 순서를 지킬 것

```
① B-BASE 프롬프트로 🥉 프레임 배지 1장 생성        ← 화풍 기준점
② 확정된 ①을 첨부해 🥈·🥇·👑 프레임 3장 생성       ← 티어 기준점
③ 티어 기준점 4장을 첨부해 나머지 배지 생성         ← 가운데 그림만 교체
```

**③에서 참조 첨부는 선택이 아니라 필수다.** 텍스트만으로는 프레임이 매번 달라져
진열대에 늘어놓으면 30장이 제각각으로 보인다.

각 장을 받으면 앞서 만든 것들과 **나란히 놓고** 테두리 두께·색이 같은지 확인한다.
어긋나면 그 장만 재생성.

---

# PART 1 — 티어 기준점 4장

## B-BASE · 🥉 브론즈 프레임 (가장 먼저)

```
A single hexagonal achievement badge icon, centered, on a fully transparent
background. Game UI asset style.

FRAME:
- Regular hexagon, point-up orientation
- Thick beveled rim made of matte brushed bronze/copper metal
- Subtle inner shadow where the rim meets the center face
- The rim has a slight worn, tactile texture — not perfectly smooth plastic

CENTER FACE:
- Recessed dark charcoal face inside the hexagon
- On it, a simple bold pictogram of a small dog paw print in bronze

LIGHTING:
- Soft warm key light from the upper left
- Gentle specular highlight along the upper-left edge of the rim
- No glow, no aura — this is the lowest tier

STRICT REQUIREMENTS:
- Fully transparent background, alpha channel. No backdrop, no floor,
  no drop shadow outside the badge.
- No text, no numbers, no letters anywhere in the image.
- Square canvas, badge centered with even margin on all four sides.
- Clean vector-like edges suitable for rendering at small sizes (40px).
```

## B-SILVER · 🥈 실버 프레임 — ①을 첨부

```
Using the attached badge as the exact style and layout reference, produce the
SILVER tier version of the same badge frame.

KEEP IDENTICAL: hexagon shape and orientation, rim thickness, bevel geometry,
center face recess, lighting direction, canvas size, centering, margins.

CHANGE ONLY:
- Rim material becomes polished silver / white gold with a mirror sheen
- Add a thin secondary inner line inside the rim, concentric with the hexagon
- Add a very subtle cool white glow around the outer rim edge
- The center pictogram becomes silver instead of bronze

Fully transparent background. No text, no numbers.
```

## B-GOLD · 🥇 골드 프레임 — ①을 첨부

```
Using the attached badge as the exact style and layout reference, produce the
GOLD tier version of the same badge frame.

KEEP IDENTICAL: hexagon shape and orientation, bevel geometry, center face
recess, lighting direction, canvas size, centering, margins.

CHANGE ONLY:
- Rim material becomes rich polished gold, noticeably thicker than the reference
- Six tiny faceted gemstones set into the six corners of the hexagon
- Warm golden glow radiating softly from behind the rim
- The center pictogram becomes gold

Fully transparent background. No text, no numbers.
```

## B-LEGEND · 👑 레전드 프레임 — ①을 첨부

```
Using the attached badge as the exact style and layout reference, produce the
LEGENDARY tier version of the same badge frame.

KEEP IDENTICAL: hexagon shape and orientation, center face recess, lighting
direction, canvas size, centering, margins.

CHANGE:
- Rim becomes the thickest and most ornate of the set: iridescent holographic
  metal that shifts between violet, cyan and magenta
- Small decorative flourishes at each of the six corners
- A strong prismatic rainbow aura radiating outward from the rim
- The center pictogram is bright white with a prismatic edge

Fully transparent background. No text, no numbers.
```

---

# PART 2 — 배지 30장

각 배지는 **해당 티어의 기준점을 첨부**하고 아래 델타 프롬프트를 쓴다.
델타 프롬프트 앞에는 항상 이 문장을 붙인다:

```
Using the attached badge as the exact frame and style reference, keep the frame,
tier material, lighting, canvas size and centering completely identical.
Replace ONLY the pictogram on the center face with the following.
Fully transparent background. No text, no numbers, no letters.

New center pictogram:
```

---

## 🏃 운동 횟수 — 6장

| # | `badge_key` | 티어 | 이름 | 가운데 그림 (프롬프트에 넣을 문장) |
|---|---|---|---|---|
| 1 | `workout_1` | 🥉 | 🐣 첫 발 | A single small dog paw print pressing down, with one tiny sprout growing beside it |
| 2 | `workout_10` | 🥉 | 🦴 열 번 찍었개 | A bone crossed with a small axe, like a tally mark carved into wood |
| 3 | `workout_30` | 🥈 | 💪 습관이 됐개 | A flexed muscular dog arm with a small clock face on the bicep |
| 4 | `workout_50` | 🥈 | 🔥 쉰 번째 | A dog paw print engulfed in a rising flame |
| 5 | `workout_100` | 🥇 | 💯 세 자릿수 클럽 | Three stacked laurel-wreathed discs, like three stacked medals |
| 6 | `workout_200` | 👑 | 🏆 전설이개도 고개 숙임 | An ornate trophy cup with a bulldog silhouette on its face, laurel branches on both sides |

## ⏱️ 총 운동 시간 — 4장

| # | `badge_key` | 티어 | 이름 | 가운데 그림 |
|---|---|---|---|---|
| 7 | `minutes_300` | 🥉 | 🎬 영화 세 편 | A film reel with a dumbbell replacing its center hub |
| 8 | `minutes_1200` | 🥈 | ✈️ 인천에서 상파울루 | A paper airplane arcing over a curved globe horizon line |
| 9 | `minutes_3000` | 🥇 | 😴 이틀 꼬박 | A crescent moon and a sun joined in a circle, a sleeping dog curled inside |
| 10 | `minutes_6000` | 👑 | 📅 나흘을 통째로 | An hourglass whose sand has become tiny dumbbells, wrapped in laurel |

## 🔥 불꽃 — 5장

| # | `badge_key` | 티어 | 이름 | 가운데 그림 |
|---|---|---|---|---|
| 11 | `streak_5` | 🔥반복 | 🔥 불꽃 5일 | A single bold flame with five small tick marks arranged in an arc beneath it. **Rim gets an orange glow** |
| 12 | `streak_best_15` | 🥈 | 🔥 슬슬 진심이개 | Two flames braided together, rising taller than the frame center |
| 13 | `streak_best_30` | 🥇 | 📆 개근상 | A calendar page fully engulfed in flame, corners curling |
| 14 | `streak_best_60` | 🥇 | 🩺 이쯤 되면 병이개 | A flame shaped like a heartbeat/ECG line, with a tiny stethoscope curled around its base |
| 15 | `streak_best_100` | 👑 | 🎉 개도 백일잔치 | A grand flame crowned with a small tiara, confetti sparks bursting outward |

## 🏋️ 웨이트 볼륨 — 6장

| # | `badge_key` | 티어 | 이름 | 가운데 그림 |
|---|---|---|---|---|
| 16 | `volume_1t` | 🥉 | 🐕 대형견 25마리 | A golden retriever sitting on top of a small barbell plate |
| 17 | `volume_5t` | 🥉 | 🐘 코끼리 한 마리 | An elephant standing on a barbell, the bar bending slightly under its weight |
| 18 | `volume_20t` | 🥈 | 🚌 시내버스 두 대 | Two city buses stacked, held up by a single dog paw beneath them |
| 19 | `volume_50t` | 🥈 | 🦕 티라노사우루스 여섯 마리 | A T-Rex skeleton silhouette being bench-pressed, tiny arms gripping the bar |
| 20 | `volume_100t` | 🥇 | ✈️ 보잉 737 한 대 | A passenger jet resting across a barbell held overhead |
| 21 | `volume_250t` | 👑 | 🗽 자유의 여신상 | The Statue of Liberty holding a barbell overhead instead of a torch |

## 🏃‍♂️ 유산소 거리 — 5장

| # | `badge_key` | 티어 | 이름 | 가운데 그림 |
|---|---|---|---|---|
| 22 | `cardio_10k` | 🥉 | 🐾 동네 한 바퀴 백 번 | A looping running track oval with paw prints along its lane |
| 23 | `cardio_42k` | 🥈 | 🏃 마라톤 풀코스 | A running bulldog breaking through a finish-line ribbon, tongue out |
| 24 | `cardio_100k` | 🥈 | 🚌 서울에서 평택까지 | A winding road receding to a horizon, a map pin planted at the far end |
| 25 | `cardio_250k` | 🥇 | 🚄 서울에서 대구까지 | A high-speed train nose emerging from motion lines, paw prints as its tracks |
| 26 | `cardio_500k` | 👑 | 🌊 서울에서 부산 찍고 대전까지 | The Korean peninsula outline with a glowing route line running down it and back partway |

## 🏅 기록 갱신 — 4장

> 이 4개는 **기존 배지의 키를 그대로 쓴다.** 이미 획득한 사람이 있으므로 키를 바꾸면 안 된다.

| # | `badge_key` | 티어 | 이름 | 가운데 그림 |
|---|---|---|---|---|
| 27 | `record_beaten_1` | 🥉 | 🏅 어제의 나를 이겼개 | A single medal on a ribbon with an upward arrow crossing it |
| 28 | `record_beaten_5` | 🥉 | 💪 다섯 번 넘었개 | A bar chart of five ascending bars, the tallest topped with a small flame |
| 29 | `record_beaten_10` | 🥈 | 🔥 기록이 무섭개 | A stopwatch shattering, its fragments flying outward |
| 30 | `record_beaten_25` | 🥇 | 👑 갱신이 취미개 | A crown resting on an ascending line graph that breaks past the frame edge |

---

## 3. 체크리스트

- [ ] B-BASE 확정 (이게 나머지 29장의 기준이므로 마음에 들 때까지 재생성)
- [ ] 티어 기준점 4장 확정 — 나란히 놓고 등급 차이가 한눈에 읽히는지
- [ ] 30장 생성 완료, 파일명이 `badge_key`와 정확히 일치
- [ ] 전부 투명 배경 (흰 배경 위·검은 배경 위 양쪽에 얹어 확인)
- [ ] 글자·숫자가 들어간 장이 없는지
- [ ] 40px로 축소해도 무슨 그림인지 알아볼 수 있는지 ← 실제 노출 크기다
- [ ] 용량 최적화 후 `public/badges/`에 저장
