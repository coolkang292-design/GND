# 운동 이미지 생성 프롬프트 — 붙여넣기용 (2026-10-05)

운동 선택 화면에서 운동 이름 앞에 붙는 그림. **자주 쓰는 운동은 우리가 GPT로 만들고,
나머지는 무료 소스(wger → 빈 곳만 free-exercise-db)로 채운 뒤 순차 교체한다**(사용자 결정 2026-10-05).

> ⚠️ 이 문서를 통째로 GPT에 넣지 마라. 아래 코드 블록을 **하나씩** 복사한다.
> 자르기: `scripts/slice-exercise-images.py` · 이름↔파일 연결: `src/lib/domain/exercise-images.ts`

---

## 0. 확정된 화풍 (사용자 확정 2026-10-05)

**회색 3D 인체 + 목표 근육 파란색 강조 + 짙은 회색 기구 + 남색 배경 + 칸 구분선, 2행 5열.**

화풍 기준 시트 — **새 시트를 받을 때 이 두 장 중 하나를 첨부한다:**
- `운동 이미지/전신 운동 근육 인포그래픽 콜라주.png`
- `운동 이미지/10가지 가슴 운동 해부학 인포그래픽.png`

> ⚠️ **다른 앱의 운동 그림을 참고 이미지로 넣지 마라.** 결과물이 그 그림을 본뜬 것이
> 된다. 화풍은 위 **우리 시트**를 첨부해서 맞춘다.

### 지금까지 들어간 그림 — 운동 51개 (그림 49장)

`python scripts/build-exercise-images.py`가 두 출처를 합친다. **겹치면 Codex PASS가 이긴다.**

| 출처 | 운동 수 | 내용 |
|---|---:|---|
| Codex 파일럿 PASS (`운동 이미지/GPT 생성된 이미지/`) | 41 | 39장 + 별칭 2(바벨 백스쿼트·컨벤셔널 데드리프트) |
| 사용자 시트에서 자른 것 | 10 | 랫풀다운(Codex FAIL) · 시티드 덤벨 리어 레터럴 레이즈 · 니 푸시업 · 덤벨 벤치프레스 · 덤벨 스퀴즈 프레스 · 인클라인 덤벨 플라이 · 디클라인 덤벨 플라이 · 인클라인 벤치프레스 머신 · 디클라인 푸시업 · 스탠딩 케이블 플라이 |

연결 기준은 **운동 ID(UUID)** 다. 결과 연결표는 `src/lib/domain/exercise-images.data.json`.

쓰지 않는 파일: `시트1.png`(같은 10종 이전 판, 배경색이 다름) · `AaEI….png` 두 장(검정 배경 초안).

⚠️ 아래 §2의 시트 A~E 목록은 Codex 파일럿 이전에 쓴 것이라 **이미 그림이 생긴 운동이 섞여 있다**
(푸시업·덤벨 플라이·풀업·매달리기·덤벨 컬·바벨 컬·인버티드 로우·케이블 푸시다운·덤벨 해머 컬·
레그프레스류·플랭크·크런치·마운틴 클라이머·러닝·로잉 등). 새로 받기 전에 연결표와 대조해 뺀다.

### 받은 파일

- 아무 이름으로 `운동 이미지/`에 넣으면 된다. 에이전트가 `SHEETS`에 등록하고 자른다
- PNG가 아니어도 된다 — 이 화풍은 배경째 쓴다
- **칸 순서가 곧 운동 이름이다.** 그림에 글자를 넣지 않는다(GPT가 한글을 깨뜨린다)

---

## 1. 공통 머리말 — 모든 시트를 이 문단으로 시작한다 (기준 시트 첨부)

```
Using the EXACT same style as the attached image, create a new wide image of
exactly 10 exercise illustrations in a 2 rows x 5 columns grid.

SAME STYLE AS ATTACHED:
- The same realistic 3D anatomical male figure in light grey, with ONLY the
  main target muscles highlighted in bright blue.
- Gym equipment in dark grey / black metal, clearly visible.
- Dark navy background with a subtle vignette in every cell.
- Thin light grid lines separating the 10 cells.

RULES:
- Each figure and its equipment must be FULLY INSIDE its own cell with clear
  empty space on all four sides. Nothing may touch or cross the grid lines or
  the image edge — do not crop machines or feet.
- Same scale and camera distance in every cell.
- No text, no numbers, no labels, no arrows, no logos.

THE 10 EXERCISES, in reading order (left to right, top row first):
```

머리말 바로 아래에 시트별 목록을 붙인다.

---

## 2. 남은 시트 5장 — 자주 쓰는 운동 42종 + 추천 목록 8종

자주 쓴 54종(운영 기록 2026-10-05 기준) 중 그림이 없는 42종과, 부위별 추천 카드에
나오는 8종(레그 컬·사이클·로잉·덤벨 해머 컬·케이블 푸시다운·인버티드 로우·카프 레이즈·벤치 딥스).

**사용자 확인이 필요한 동작 3개** — 아래 프롬프트는 이 가정으로 썼다
- `타이슨 푸시업`: 주먹을 쥐고 하는 푸시업
- `DY 로우 머신`: 가슴을 패드에 대고 앉아 당기는 로우 머신
- `숄더프레스`: 머신 숄더 프레스 (`오버헤드 프레스`·`덤벨 숄더 프레스`가 따로 있다)

### 시트 A · 가슴·어깨

```
1. Incline barbell bench press — lying on a bench inclined about 35 degrees,
   pressing a barbell straight up above the upper chest. Side view.
2. Flat dumbbell fly — lying on a FLAT bench, both arms opened wide to the
   sides with a slight elbow bend, a dumbbell in each hand.
3. Seated chest press machine — sitting upright against the back pad, pushing
   two handles straight forward at chest height. Side view.
4. Push-up — body in one straight line, hands under the shoulders, arms
   extended. Side view.
5. Wide push-up — push-up with hands placed far wider than the shoulders.
   Front view.
6. Fist push-up — push-up resting on closed fists (knuckles on the floor);
   make the fists clearly visible.
7. Inchworm — legs straight, bent at the hips in an inverted V, hands on the
   floor walking forward away from the feet. Side view.
8. Pike push-up — hips raised high in an inverted V, head lowered toward the
   floor between the hands. Side view.
9. Standing dumbbell lateral raise — standing, raising a dumbbell in each hand
   straight out to the sides to shoulder height (T shape). Front view.
10. Seated dumbbell shoulder press — sitting on an upright bench, pressing two
   dumbbells overhead. Front view.
```

### 시트 B · 어깨·등·팔

```
1. Shoulder press machine — sitting in a shoulder press machine, pushing two
   handles straight overhead. Side view.
2. Pull-up — hanging from a bar with the chin above the bar, overhand grip.
   Back view.
3. Dead hang — hanging from a pull-up bar with arms fully straight, feet off
   the ground. Front view.
4. Barbell row — bent over with the torso about 45 degrees forward, knees
   slightly bent, pulling a barbell to the lower stomach. Side view.
5. One-arm dumbbell row — one knee and one hand on a flat bench, torso parallel
   to the floor, the other hand pulling a dumbbell up to the hip. Side view.
6. Chest-supported row machine — sitting with the chest against a front pad,
   pulling two handles back toward the torso. Side view.
7. Superman row — lying face down on the floor, chest and arms lifted, elbows
   pulled back toward the ribs. Side view.
8. Inverted row — lying under a bar set at waist height, body straight, heels
   on the floor, pulling the chest up to the bar. Side view.
9. Standing dumbbell curl — curling a dumbbell in each hand toward the
   shoulders, elbows pinned to the sides. Front view.
10. Standing barbell curl — curling a barbell to chest height with an underhand
   grip, elbows at the sides. Side view.
```

### 시트 C · 팔·하체

```
1. Overhead cable triceps extension — standing facing AWAY from a cable
   machine, arms raised overhead, extending a rope attachment forward until the
   arms are straight. Side view.
2. Cable triceps push-down — standing facing a cable machine, elbows pinned at
   the sides, pushing a short bar down until the arms are straight. Side view.
3. Dumbbell hammer curl — standing, curling dumbbells with palms facing each
   other (neutral grip). Front view.
4. Bench dip — hands on the edge of a bench behind the body, legs extended
   forward, body lowered by bending the elbows. Side view.
5. Bodyweight squat — no equipment, thighs parallel to the floor, both arms
   extended straight forward. Side view.
6. Jump squat — jumping straight up out of a squat, both feet clearly off the
   ground. Side view.
7. Forward lunge — front leg stepped FORWARD, back knee almost touching the
   floor, torso upright, hands on hips. Side view.
8. Reverse lunge — the BACK leg stepped far behind, back knee almost touching
   the floor, torso upright, arms swinging. Show it from the opposite side
   to the forward lunge so the two look different. Side view.
9. Side lunge — stepping out to one side, that knee deeply bent, the other leg
   straight. Front view.
10. 45-degree leg press machine — reclined, feet on the large sled platform,
   pushing it away. Side view.
```

### 시트 D · 하체·코어

```
1. Leg extension machine — sitting, lower legs extended straight forward under
   the roller pad. Side view.
2. Lying leg curl machine — lying face down, knees bent, curling the roller pad
   toward the buttocks. Side view.
3. Romanian deadlift — legs nearly straight, hips pushed far back, back flat,
   barbell lowered to just below the knees. Side view.
4. Barbell hip thrust — upper back on a bench, feet flat, hips raised so the
   body is a flat table from knees to shoulders, barbell across the hips.
   Side view.
5. Standing calf raise — no equipment, standing up high on the toes, heels
   lifted. Side view.
6. Forearm plank — on the forearms and toes, body straight from head to heels.
   Side view.
7. Crunch — lying on the back, knees bent, shoulders curled off the floor,
   hands behind the head. Side view.
8. Sit-up — torso raised all the way up to sitting, knees bent. Side view.
9. Lying leg raise — lying on the back, both legs straight and raised to
   vertical. Side view.
10. Dead bug — lying on the back, one arm extended overhead and the OPPOSITE
   leg extended just above the floor, the other arm pointing up and the other
   knee bent 90 degrees in the air.
```

### 시트 E · 코어·유산소

```
1. Bird dog — on hands and knees, one arm extended forward and the opposite leg
   extended straight back. Side view.
2. Bicycle crunch — lying on the back, shoulders lifted, one elbow meeting the
   opposite raised knee while the other leg extends.
3. Russian twist — sitting on the floor leaning back, feet lifted, hands
   clasped and rotated to one side. Front view.
4. Mountain climber — high plank on straight arms, one knee driven toward the
   chest. Side view.
5. Jumping jack — legs spread wide and arms raised overhead in an X shape,
   feet off the ground. Front view.
6. High knees — running in place, one knee lifted to hip height, arms pumping.
   Side view.
7. Walking — walking upright mid-stride outdoors-style, no equipment, no
   treadmill. Side view.
8. Running — running mid-stride with one foot off the ground, leaning slightly
   forward, no equipment, no treadmill. Side view.
9. Stationary bike — riding a stationary exercise bike, seated. Side view.
10. Rowing machine — seated on a rowing machine at the finish position, legs
   straight, handle pulled to the lower chest. Side view.
```

### 연결 (에이전트용 — 칸 → 카탈로그 이름)

| 시트 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 인클라인 벤치프레스 | 덤벨 플라이 | 체스트프레스 머신 | 푸시업 | 와이드 푸시업 | 타이슨 푸시업 | 인치웜 푸시업 | 파이크 푸시업 | 덤벨 레터럴 레이즈 · 사이드 레터럴 레이즈 | 덤벨 숄더 프레스 |
| B | 숄더프레스 | 풀업 | 매달리기 | 바벨 로우 | 덤벨 로우 | DY 로우 머신 | 슈퍼맨 로우 | 인버티드 로우 | 덤벨 컬 | 바벨 컬 |
| C | 케이블 트라이셉 익스텐션 | 케이블 푸시다운 | 덤벨 해머 컬 | 벤치 딥스 | 맨몸 스쿼트 | 점프 스쿼트 | 런지 | 리버스 런지 | 사이드 런지 | 레그프레스 |
| D | 레그 익스텐션 | 레그 컬 | 루마니안 데드리프트 | 힙 쓰러스트 | 카프 레이즈 | 플랭크 | 크런치 | 싯업 | 레그 레이즈 | 데드버그 |
| E | 버드독 | 바이시클 크런치 | 러시안 트위스트 | 마운틴 클라이머 | 점핑잭 | 하이 니 | 걷기 | 러닝 | 사이클 | 로잉 |

---

## 3. 자주 나오는 실패와 재지시 문구

| 증상 | 다시 보낼 문구 |
|---|---|
| 기구·발이 칸 밖으로 잘렸다 | `Shrink everything so each figure and its equipment stays fully inside its cell with empty space on all sides.` |
| 칸이 10개가 아니다 | `Exactly 10 cells: 2 rows of 5. Keep the thin grid lines.` |
| 그림에 글자·숫자가 생겼다 | `Remove all text and numbers.` |
| 화풍이 첨부와 다르다(배경색·근육색) | `Match the attached image exactly: light grey figure, bright blue target muscles, dark navy background.` |
| 한 칸만 동작이 틀렸다 | 그 운동 한 줄만 1칸짜리로 다시 받는다 |
