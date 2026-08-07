# GND UI 아이콘 이미지 제작 가이드 (2026-08-07)

`public/ui-icons/*.webp` — 허브 카드·부위/상황 카드·탭바·챌린지 화면에 쓰는 작은 아이콘 43장.

> **붙여넣기용 프롬프트는 `docs/ui-icon-prompts.md`에 있다.** 이 문서는 사람이 읽는
> 규격서다 — **이미지 모델에 통째로 넣지 마라.** 지시로 안 읽힌다.
>
> 규격 참고: `docs/badge-asset-prompts.md`(배지 512px) · `docs/avatar-item-asset-guide.md`(아바타)
> 자르는 스크립트: `scripts/slice-ui-icons.py` · 검사 스크립트: `scripts/check-ui-icons.py`

**이 문서는 1차 시안(2026-08-07)이 화면에서 뭉갠 원인을 측정해서 쓴 것이다.**
`check-ui-icons.py` 기준으로 **43장 중 34장이 미달**이다. §2의 세 수치를
만족하지 않으면 다시 만들어도 같은 결과가 나온다.

---

## 0. 1차 시안이 왜 실패했는가 — 측정값

시안 시트에서 자른 자산을 카드 색 `--surface-2` `#211f18` 위에 얹어 쟀다.

| 자산 | 획/몸통 | 불투명(α≥240) | 몸통 대비 | 판정 |
|---|---:|---:|---:|---|
| hub-part 가슴 | **3.8%** | 46% | 11.5:1 | 획·불투명 ❌ |
| hub-situation 과녁 | 5.6% | 51% | 11.4:1 | 획·불투명 ❌ |
| friends 사람 둘 | 5.8% | 55% | 11.1:1 | 획·불투명 ❌ |
| part-chest 가슴 | 51.1% | 95% | **1.0:1** | 대비 ❌ |
| tab-record 기록 | 86.0% | 94% | **1.1:1** | 대비 ❌ |
| trash 휴지통 | 74.1% | 95% | **1.0:1** | 대비 ❌ |
| **situ-home 집** | **11.4%** | **77%** | **9.7:1** | ✅ |
| **part-arms 팔** | **25.4%** | **90%** | **14.9:1** | ✅ |
| **tab-home-active** | **70.1%** | **95%** | **6.1:1** | ✅ |
| 목표 | **≥8%** | **≥70%** | **≥3:1** | |

**망가지는 방식이 두 가지다.**

**① 선화군 — 너무 가늘고 절반이 반투명.** 획이 몸통의 3.8~6.7%다. 40px 카드에
얹으면 획이 **1.5~2.7px**로 내려앉고, 상자의 5~8%에만 잉크가 남는다. 게다가
획 자체가 반투명이라(α≥240인 픽셀이 절반뿐) 그 1px마저 배경과 섞인다.
색 대비는 9~11:1로 멀쩡하다 — **색이 아니라 굵기와 불투명도가 문제다.**

**② 검은채움군 — 몸통이 카드와 같은 어둠.** 검게 채운 실루엣에 금색 테두리를
두른 화풍이다. 몸통 대비가 **1.0~1.7:1** — 그래픽 최소 기준 3:1의 3분의 1이다.
원본에서 이게 보이는 건 뒤에 깔린 발광이 분리해 주기 때문인데,
`slice-ui-icons.py`의 `ALPHA_CUT`이 그 발광을 잘라 낸다(안 자르면 갈색 얼룩이
생겨서 넣은 장치다). **글로우를 살리면 얼룩, 자르면 검은 덩어리** — 이 화풍은
어두운 카드에서 어느 쪽으로도 성립하지 않는다.

**③ 통과한 9장이 답을 말해 준다.** `situ-home`(획 두꺼운 집)·`part-arms`(밝은
골드로 채운 팔)·`tab-*-active`(골드 채움)는 세 수치를 다 넘겼다.
**같은 시트 안에서도 되는 게 있다 — 불가능한 요구가 아니다.**

### 투명 배경은 문제가 아니었다

시트 알파를 찍어 보니 배경은 **이미 알파 0**이다(상황 시트 91.4%, 부위 시트
89.2%). 뷰어가 알파를 무시하고 RGB만 보여줘서 어두운 배경처럼 보였을 뿐이다.
**"투명 배경으로 달라"는 이미 지켜졌으니 거기에 힘을 쓰지 마라.** 고쳐야 하는
것은 **글로우 · 획 굵기 · 채움 색** 셋이다.

---

## 1. 실제 노출 크기 — 모든 수치의 출발점

| 자산군 | 파일 | 쓰는 곳 | 표시 크기 |
|---|---|---|---:|
| 허브 | `hub-*` | `exercise-picker.tsx` `HubCard` | **40px** |
| 부위·상황 | `part-*` `situ-*` | `recommended-picker.tsx` | **40px** |
| 탭바 | `tab-*` | `tab-bar.tsx` | **28px** |
| 챌린지 등 | `UiIcon` | `ui-icon.tsx` (기본 18px) | **13~40px** |

> ⚠️ **18px 미만 자리에는 래스터 일러스트를 쓰지 않는다.** 챌린지 화면의
> `lock` 13px·`thumbsup` 14px 같은 자리는 어떤 그림을 넣어도 형태가 안 남는다.
> 그 크기는 **이모지나 SVG**의 몫이다.

---

## 2. 통과해야 하는 세 수치

셋 다 `scripts/check-ui-icons.py`가 잰다(§7). **눈으로 판단하지 않는다.**

### ① 획 굵기 ≥ 아이콘 몸통의 8%

화면에서 획이 **2px 아래로 내려가면 안 된다.** 가장 작은 사용처가 탭바 28px이므로
2 ÷ 28 = 7.1%, 여유를 둬서 **8%**로 잡는다.

| 시트 규격 | 아이콘 몸통 | 필요한 획 |
|---|---:|---:|
| 1024×1024, 3열 | 약 260px | **21px 이상** |
| 1536×1024, 5열 | 약 230px | **19px 이상** |

1차 시안은 이 자리에서 **6px 남짓**이었다. 3배 넘게 굵어져야 한다.

### ② 불투명 ≥ 70% (몸통 픽셀 중 알파 240 이상)

획과 채움은 **단단한 면**이어야 한다. 발광 렌더로 그리면 획 전체가 반투명한
소프트 브러시가 되고, 축소할 때 배경에 녹는다. 반투명은 **바깥 1~2px
안티에일리어싱에만** 허용된다.

### ③ 몸통 대비 ≥ 3:1 (카드 `#211f18` 기준)

WCAG 비텍스트 최소 기준이다. 상대휘도 **0.1411** 이상이어야 넘는다.

| 색 | 상대휘도 | 대비 | |
|---|---:|---:|---|
| `#ffffff` 흰 | 1.0000 | 16.5:1 | ✅ |
| `#e8b84b` **accent — 기준색** | 0.5194 | 8.9:1 | ✅ |
| `#c9a227` | 0.3840 | 6.8:1 | ✅ |
| `#8a6f2a` | 0.1694 | 3.4:1 | ✅ **하한** |
| `#6b5520` | 0.0973 | 2.3:1 | ❌ |
| `#000000` 검 | 0.0000 | 1.3:1 | ❌ |

**`#8a6f2a`보다 어두운 색으로 몸통을 채우지 마라.** 기준은 `#e8b84b`다.

> 골드 채움은 골드 카드에서도 괜찮다. `상황별 추천`만 `bg-accent`(골드 바탕)라
> `HubCard`가 `brightness-0`으로 아이콘을 검게 눕히는데, 그러면 골드 배경 위
> 검은 그림이라 11.6:1이 나온다. **양쪽 다 골드 채움 한 벌로 해결된다** —
> 자산을 두 벌 만들지 마라.

---

## 3. 필요한 이미지 전체 목록 — 43장

### 요약

| 시트 | 규격 | 장수 | 미달 | 우선순위 |
|---|---|---:|---:|---|
| **A** 허브 | 1024×1024 · 3열 2행 | 6 | **6** | 높음 — 운동 추가 첫 화면 |
| **B** 부위 | 1024×1024 · 3열 2행 | 6 | **5** | 높음 |
| **C** 상황 | 1024×1024 · 3열 2행 | 6 | **4** | 높음 |
| **D** 탭바 | 1536×1024 · 5열 2행 | 10 | **7** | 중간 — 모든 화면에 보임 |
| **E** 챌린지 | 1536×1024 · 4열 2행 | 8 | **8** | 낮음 — §1대로면 이모지가 맞다 |
| **F** 스트릭·친구 | 1024×1024 · 2열 2행 | 4 | 3 | 보류 — 현재 미사용 |
| 재사용 | (다른 시트에서 복제) | 3 | 1 | — |
| | | **43** | **34** | |

> ⚠️ **재제작은 장 단위가 아니라 시트 단위다.** 통과한 9장도 같이 다시 만든다 —
> 한 시트 안에서 획 굵기가 갈리면 카드에 나란히 놓였을 때 그것 자체가 오류로 보인다.

아래 표의 **`그릴 것`은 프롬프트에 그대로 넣는 문장**이다. §6의 공통 접두 뒤에
`ICONS (left to right, top to bottom):` 로 붙인다.
**순서가 곧 `slice-ui-icons.py`의 `ASSETS` 매핑이다** — 바꾸면 스크립트도 고쳐야 한다.

---

### 시트 A · 허브 6장 — 40px

`운동 추가` 시트의 진입 카드. 앱에서 가장 먼저 눌리는 자리다.

| # | 파일 | 뜻 · 쓰는 곳 | 1차 | 그릴 것 |
|---|---|---|---|---|
| 1 | `hub-situation` | 상황별 추천 | ❌ 획 5.6% | A target with a dart stuck in the bullseye |
| 2 | `hub-part` | 부위별 추천 | ❌ 획 3.8% | A muscular torso seen from the front, chest and abs visible |
| 3 | `hub-search` | 운동 이름 검색 | ❌ 획 6.5% | A magnifying glass tilted 45 degrees, thick handle |
| 4 | `hub-past` | 지난 운동 불러오기 | ❌ 대비 1.2:1 | A clock face with a circular arrow curving backwards around it |
| 5 | `hub-routine` | 내 루틴 | ❌ 획 5.1% | A clipboard with three checked list lines |
| 6 | `hub-tabata` | 타바타로 바로 시작 | ❌ 획 6.0% | A stopwatch with a flame rising from its crown button |

---

### 시트 B · 부위 6장 — 40px

`부위별 추천`의 6개 카드. `PART_META`가 참조한다.

| # | 파일 | 뜻 | 1차 | 그릴 것 |
|---|---|---|---|---|
| 1 | `part-chest` | 가슴 | ❌ 대비 1.0:1 | Pectoral muscles, front view of a torso |
| 2 | `part-back` | 등 | ❌ 대비 1.0:1 | Back muscles seen from behind, lats spread wide |
| 3 | `part-legs` | 하체 | ❌ 대비 1.1:1 | A pair of muscular legs, front view |
| 4 | `part-shoulders` | 어깨 | ❌ 대비 1.0:1 | Deltoid muscles, front view of shoulders and upper chest |
| 5 | `part-arms` | 팔 | ✅ | A flexed arm showing the biceps |
| 6 | `part-core` | 코어 | ❌ 획 3.9% | Abdominal muscles, a six-pack midsection |

> ⚠️ **이 시트가 1차에서 가장 크게 망가졌다.** 근육 실루엣은 검정으로 그리기
> 쉬워서 6장 중 4장이 대비 1.0:1로 나왔다. 프롬프트에 한 줄 더 박는다:
>
> ```
> The muscle silhouettes must be GOLD-FILLED, not dark-filled. Muscle definition
> lines are drawn in a darker gold ON TOP of the gold body — never the reverse.
> ```
>
> `part-arms`(✅ 14.9:1)가 정확히 그렇게 나온 유일한 장이다. **그 장을 참조로 첨부한다.**

---

### 시트 C · 상황 6장 — 40px

`상황별 추천`의 6개 카드. `SITUATIONS`가 참조한다.

| # | 파일 | 뜻 (화면 문구) | 1차 | 그릴 것 |
|---|---|---|---|---|
| 1 | `situ-beginner` | 처음 운동해요 | ✅ | A standing human figure, front view, simple bold silhouette |
| 2 | `situ-challenge` | 챌린지 목표에 맞게 | ❌ 획 5.2% | A target with an arrow in the bullseye |
| 3 | `situ-no-machines` | 기구를 잘 몰라요 | ❌ 획 6.5% | A question mark beside a dumbbell |
| 4 | `situ-home` | 집에서 할래요 | ✅ | A simple house with a door and one window |
| 5 | `situ-short` | 30분만 운동할래요 | ❌ 획 6.7% | A stopwatch whose hand points at the halfway mark |
| 6 | `situ-cardio` | 유산소만 할래요 | ❌ 획 5.3% | A heart with a pulse/ECG line running through it |

> ⚠️ **`situ-short`에 `30` 숫자를 넣지 마라.** 1차 시안은 문자판에 `30`을 썼다.
> 숫자·글자는 금지다(§5) — 40px에서 읽히지도 않는다. **바늘 위치로 말한다.**
>
> ⚠️ `situ-beginner`는 부위 시트의 전신 실루엣을 빌려 쓰고 있다(`part-r2c1`).
> 상황 시트에 '처음 운동해요'에 맞는 그림이 없었기 때문이다. **이번엔 상황
> 시트에 직접 넣는다** — 시트를 건너 참조하면 부위 시트를 고칠 때 같이 바뀐다.

---

### 시트 D · 탭바 10장 — 28px

5종 × 비활성/활성. **모든 화면 아래에 항상 떠 있다.**

| # | 파일 | 탭 | 1차 | 그릴 것 |
|---|---|---|---|---|
| 1 | `tab-home` | 홈 (비활성) | ❌ 대비 1.1:1 | A house — **outline only, hollow interior** |
| 2 | `tab-feed` | 피드 (비활성) | ❌ 대비 1.1:1 | A stack of two list cards — outline only |
| 3 | `tab-record` | 기록 (비활성) | ❌ 대비 1.1:1 | A plus sign inside a circle — outline only |
| 4 | `tab-challenge` | 챌린지 (비활성) | ❌ 대비 1.0:1 | A trophy cup — outline only |
| 5 | `tab-profile` | 내 정보 (비활성) | ❌ 대비 1.1:1 | A person bust — outline only |
| 6 | `tab-home-active` | 홈 (활성) | ✅ | The same house, **solid gold filled** |
| 7 | `tab-feed-active` | 피드 (활성) | ❌ 대비 1.1:1 | The same cards, solid gold filled |
| 8 | `tab-record-active` | 기록 (활성) | ❌ 대비 1.1:1 | The same plus-circle, solid gold filled |
| 9 | `tab-challenge-active` | 챌린지 (활성) | ✅ | The same trophy, solid gold filled |
| 10 | `tab-profile-active` | 내 정보 (활성) | ✅ | The same person bust, solid gold filled |

> ⚠️ **비활성은 "골드 외곽선 + 속이 빈" 것이지 "검게 채운" 것이 아니다.**
> 1차는 비활성 5장을 전부 검게 채워서 대비 1.0~1.1:1로 전멸했다. 속은
> **투명**이어야 한다 — 카드 색이 그대로 비쳐야 비활성으로 읽힌다.
>
> ⚠️ **활성은 비활성과 같은 형태에 채움만 다르다.** 다른 그림이 나오면 탭을
> 누를 때 아이콘이 바뀌어 보인다. `tab-*-active` 3장(✅)을 참조로 첨부한다.

---

### 시트 E · 챌린지 8장 — 13~22px

챌린지 탭에서 `UiIcon`으로 쓴다.

| # | 파일 | 뜻 | 표시 | 1차 | 그릴 것 |
|---|---|---|---:|---|---|
| 1 | `lock` | 비공개·잠김 | 13~22px | ❌ 1.3:1 | A closed padlock |
| 2 | `finish` | 챌린지 시작 | 18px | ❌ 1.7:1 | A checkered flag on a pole |
| 3 | `thumbsup` | 동의 | 14~18px | ❌ 1.4:1 | A thumbs-up hand |
| 4 | `trash` | 취소·삭제 | 18px | ❌ 1.0:1 | A trash can with a lid |
| 5 | `handshake` | 크루 | 18px | ❌ 1.1:1 | Two hands shaking |
| 6 | `warning` | 경고 | 18px | ❌ 1.1:1 | A triangle with an exclamation mark |
| 7 | `camera` | 사진 인증 | 18px | ❌ 1.5:1 | A camera body with a round lens |
| 8 | `crown` | 1등 | 20px | ❌ 1.3:1 | A crown with three points |

> ⚠️ **이 시트는 다시 만들기 전에 한 번 생각한다.** 8장 전부 검은 채움이라
> 전멸했는데, 그보다 근본적으로 **표시 크기가 13~22px다.** §1대로면 18px 미만
> 자리에는 래스터를 쓰지 않는 게 맞다. 세 갈래다:
>
> 1. **이모지로 되돌린다** — 가장 싸고, OS가 그 크기에 맞게 그려 준다
> 2. **SVG로 만든다** — 크기와 무관하게 선명하고, 색을 CSS로 바꾼다
> 3. 굳이 이미지로 간다면 **표시 크기를 24px 이상으로 올리고** 다시 받는다
>
> 원래 설계 문서(`specs/2026-08-07-exercise-picker-image-assets-design.md` §5)도
> "단순 아이콘은 AI 이미지가 아니라 코드 기반 SVG로 만든다"고 적어 뒀다.

---

### 시트 F · 스트릭·친구 4장 — 현재 **미사용**

2026-08-07 사용자 지시로 화면은 이모지(`🔥`/`🪵`/`👥`)로 되돌렸다.
파일은 `public/ui-icons/`에 남아 있다.

| # | 파일 | 뜻 | 1차 | 그릴 것 |
|---|---|---|---|---|
| 1 | `streak-on` | 연속 있음 | ✅ | A burning flame, filled with warm orange-gold |
| 2 | `streak-off` | 연속 없음 | ❌ 획 5.3% | The same flame shape, **outline only, hollow** |
| 3 | `friends` | 친구 목록 헤딩 | ❌ 획 5.8% | Two person busts side by side, the front one larger |
| 4 | `friends-add` | 친구 부르기 | ❌ 획 5.7% | Two person busts with a small plus sign beside them |

> 다시 쓰려면 **새 자산이 세 수치를 통과한 뒤에** 화면을 바꾼다. `streak-on`은
> 이미 통과했으니(7.9:1) 짝인 `streak-off`만 같은 화풍으로 다시 받으면 된다.

---

### 재사용 3장 — 따로 그리지 않는다

`slice-ui-icons.py`가 **다른 시트의 같은 칸을 복제**해 만든다.

| 파일 | 원본 칸 | 왜 파일을 나누는가 |
|---|---|---|
| `goal` | 시트 C `situ-challenge` | 챌린지 화면의 과녁이 `situ-*` 이름을 참조하면, 나중에 상황 카드 그림만 바꾸려다 챌린지 화면까지 같이 바뀐다 |
| `trophy` | 시트 D `tab-challenge-active` | 같은 이유 — 탭바 그림만 바꾸고 싶을 때가 온다 |
| `person` | 시트 D `tab-profile-active` | 같은 이유 |

**뜻이 다르면 파일도 나눈다.** 그림이 같은 것과 이름을 공유하는 것은 다르다.

---

## 4. 시트 규격

```
캔버스     1024 × 1024 px (3열) 또는 1536 × 1024 px (4~5열), PNG, 알파 채널
배경       완전 투명 — 발광·후광·비네트·바닥 그림자 전부 없음
칸         격자선 없이 균등 배치, 가로·세로 모두 넉넉히 띄움
아이콘 몸통  칸 너비의 약 75% (1024/3열 기준 약 260px)
획          몸통의 8% 이상 (약 21px), 시트 안 모든 아이콘이 같은 굵기
채움·획 색   #e8b84b 기준 골드, #8a6f2a보다 어둡게 가지 않음
화풍        한 벌로 통일 — 선화면 전부 선화, 채움이면 전부 골드 채움
글자        없음
```

> ⚠️ **세로 간격을 가로만큼 띄운다.** 배지 시트에서 세로 31px·가로 137px로
> 나와서 위아래 배지가 딸려 들어온 적이 있다(`badge-asset-prompts.md` §4 함정 ①).
>
> ⚠️ **좌우대칭 아이콘(가슴·어깨)은 가운데가 비면 열 경계로 오인된다.**
> `slice-ui-icons.py`가 `merge_to()`로 되붙이지만, 애초에 몸통이 가로로
> 이어지게 그리는 편이 안전하다.

---

## 5. 절대 넣지 말 것

1차에서 실제로 걸린 것들이다.

- **발광·글로우·후광·라이트 블룸** — 원인 ①의 정체다. 획이 반투명해지고, 잘라 내면
  아이콘이 쪼그라들며(§8), 안 잘라 내면 어두운 카드에 갈색 얼룩이 남는다
- **검정·짙은 갈색 채움** — 원인 ②. 어두운 카드 위에서 사라진다
- **반투명 브러시 획** — 단단한 면으로 그린다
- **그라데이션 남발** — 40px에서 한 덩어리로 뭉개진다. 단색에 가깝게
- **얇은 격자 구분선** — 시트에 칸 선을 긋지 않는다
- **글자·숫자** — 이미지 모델은 한글을 못 쓴다. `30초`도 앱이 렌더한다
- **바닥 그림자·반사** — 잘라 낼 때 얼룩으로 남는다
- **아이콘마다 다른 화풍** — 한 카드 안에 선화와 채움이 섞이면 그 자체가 오류로 보인다

---

## 6. 생성 프롬프트

> **실제로 붙여넣을 완성 프롬프트는 `docs/ui-icon-prompts.md`에 있다.**
> 아래는 그 프롬프트가 왜 그렇게 생겼는지의 근거다. 작업할 때는 그쪽을 연다.
>
> 시트 하나 = 대화 한 번 = 이미지 한 장이다. **43장을 한 번에 받을 수 없다.**

### 작업 순서 — 배지 때 통한 방식 그대로

```
① 공통 프롬프트로 시트 A 1장 생성          ← 화풍 기준점
② check-ui-icons.py로 세 수치 확인          ← 떨어지면 ①로 되돌아간다
③ 확정된 ①을 참조로 첨부해 B~E 생성         ← 획 굵기·색이 자동으로 맞는다
```

**③에서 참조 첨부는 선택이 아니라 필수다.** 텍스트만으로는 시트마다 획 굵기가
달라져서, 허브 카드와 탭바 아이콘이 나란히 놓였을 때 다른 세트로 보인다.

### 공통 접두 (모든 시트 앞에 붙인다)

```
A sheet of flat UI icons for a dark-themed mobile fitness app, arranged in a
clean {ROWS}x{COLS} grid on a FULLY TRANSPARENT background.

STROKE AND FILL — THIS IS THE MOST IMPORTANT REQUIREMENT:
- Every stroke must be THICK AND BOLD: at least 8% of the icon's height.
  On this canvas that means roughly 21 pixels. Err on the side of too thick.
- All strokes and fills must be 100% OPAQUE solid color with hard edges.
  No soft brushes, no semi-transparent strokes, no feathering.
- Uniform stroke weight across every icon in the sheet.
- Rounded line caps and joins.

COLOR:
- Solid warm gold #e8b84b. Flat color, minimal gradient.
- NEVER fill shapes with black, dark brown, or any dark color — these icons sit
  on a near-black card (#211f18) and any dark fill becomes invisible.
- If a shape needs a filled body, fill it with the SAME gold, not with dark.
  Interior detail lines are drawn in a DARKER GOLD on top of the gold body.

STRICTLY FORBIDDEN:
- No glow, no halo, no light bloom, no aura, no vignette, no lens flare
- No background of any kind — the background must be pure alpha zero
- No drop shadows, no ground shadows, no reflections
- No grid lines or dividers drawn between the cells
- No text, no numbers, no letters anywhere
- No 3D bevel, no photorealistic rendering, no metallic reflections

LAYOUT:
- Each icon centered in its own cell, occupying about 75% of the cell width
- Equal generous spacing between cells, horizontally AND vertically
- Every icon drawn at the same visual weight and size

Style: clean flat vector icon set, designed to stay legible when rendered at
28 pixels. Think of a mobile app tab bar icon, not an illustration.

ICONS (left to right, top to bottom):
```

### 시트별 꼬리말

**시트 A · 허브** (`{ROWS}x{COLS}` → `2x3`)

```
1. A target with a dart stuck in the bullseye
2. A muscular torso seen from the front, chest and abs visible
3. A magnifying glass tilted 45 degrees, thick handle
4. A clock face with a circular arrow curving backwards around it
5. A clipboard with three checked list lines
6. A stopwatch with a flame rising from its crown button
```

**시트 B · 부위** (`2x3`) — **아래 문단을 반드시 함께 넣는다**

```
1. Pectoral muscles, front view of a torso
2. Back muscles seen from behind, lats spread wide
3. A pair of muscular legs, front view
4. Deltoid muscles, front view of shoulders and upper chest
5. A flexed arm showing the biceps
6. Abdominal muscles, a six-pack midsection

CRITICAL FOR THIS SHEET: the muscle silhouettes must be GOLD-FILLED, not
dark-filled. Muscle definition lines are drawn in a darker gold ON TOP of the
gold body — never the reverse. A dark-filled muscle disappears on the app's
near-black card.
```

**시트 C · 상황** (`2x3`)

```
1. A standing human figure, front view, simple bold silhouette
2. A target with an arrow in the bullseye
3. A question mark beside a dumbbell
4. A simple house with a door and one window
5. A stopwatch whose hand points at the halfway mark (NO numbers on the dial)
6. A heart with a pulse/ECG line running through it
```

**시트 D · 탭바** (`2x5`) — **아래 문단을 반드시 함께 넣는다**

```
Row 1 (INACTIVE state): house | stack of two list cards | plus sign inside a
circle | trophy cup | person bust
Row 2 (ACTIVE state): the exact same five shapes

CRITICAL FOR THIS SHEET:
- Row 1 icons are OUTLINE ONLY: a thick gold stroke with a HOLLOW, fully
  TRANSPARENT interior. Do not fill the interior with black or any color.
- Row 2 icons are the SAME shapes filled solid with gold.
- Row 1 and Row 2 must be identical in shape, size and position — only the
  fill differs. They are the two states of the same tab.
```

**시트 E · 챌린지** (`2x4`) — §3의 경고를 읽고 결정한 뒤에 만든다

```
1. A closed padlock
2. A checkered flag on a pole
3. A thumbs-up hand
4. A trash can with a lid
5. Two hands shaking
6. A triangle with an exclamation mark
7. A camera body with a round lens
8. A crown with three points
```

**시트 F · 스트릭·친구** (`2x2`) — 현재 미사용

```
1. A burning flame filled with warm orange-gold
2. The same flame shape, OUTLINE ONLY with a hollow transparent interior
3. Two person busts side by side, the front one larger
4. Two person busts with a small plus sign beside them
```

---

## 7. 받은 뒤 검사 — 눈으로 판단하지 않는다

```bash
python scripts/slice-ui-icons.py              # 자산 생성
python scripts/check-ui-icons.py              # 세 수치 검사 ← 필수
python scripts/check-ui-icons.py --all        # 43장 전부 표로
python scripts/slice-ui-icons.py --preview    # 26·40·96px 대지

# public/에 넣기 전에 임시 폴더에서 먼저 재 본다
UI_ICON_DIR=/tmp/새시안 python scripts/check-ui-icons.py --all
```

`check-ui-icons.py`가 §2의 세 수치를 재서 미달 자산을 이름으로 찍고 종료 코드
1로 끝난다. **하나라도 걸리면 시안을 다시 받는다. 스크립트로 보정해서
통과시키지 마라** — 1차에서 밝기 키잉·감마·단색 칠하기를 차례로 시도했고
전부 원화를 죽였다(`slice-ui-icons.py` 모듈 주석 참조).

> ⚠️ **`--preview`는 실제 표시 크기로 본다.** 1차에서 192px 대지만 보고
> 넘어갔다가 화면의 28px에서 흐린 것을 사용자가 잡았다.
>
> ⚠️ **대지 배경을 카드 색(`#211f18`)으로 둔다.** 흰 배경에서 보면 검은 채움도
> 멀쩡해 보인다 — 원인 ②가 정확히 그렇게 새어 나갔다.

마지막은 언제나 **개발 서버에서 실제 화면**이다(전역 `CLAUDE.md`).
허브 시트를 열어 아이콘 개수를 세고, 탭을 눌러 활성/비활성이 바뀌는지 본다.

---

## 8. 스크립트 쪽에서 같이 고쳐야 하는 것

### 8.1 새 시트를 받으면 `ASSETS` 매핑이 **전부** 깨진다

지금 매핑은 1차 시트의 우연한 배치에 맞춰져 있다 — 허브 아이콘이 상황 시트에서
나오고(`situ-r1c1`), `hub-past`만 부위 시트에서 오고(`part-r1c3`), 탭은 3행짜리
시트의 **2·3행**을 쓴다(1행은 밝은 배경 버전이라 버렸다).

§3처럼 **시트를 뜻대로 나눠 다시 받으면** `slice-ui-icons.py`의 `SHEETS`·`ASSETS`를
아래로 갈아 끼운다. 안 고치면 엉뚱한 칸이 잘려 나온다.

```python
SHEETS = {
    "hub":  ("허브.png", 3),        # 2행 3열 — 시트 A (새로 생긴다)
    "part": ("부위별.png", 3),       # 2행 3열 — 시트 B
    "situ": ("상황별.png", 3),       # 2행 3열 — 시트 C
    "tab":  ("탭바.png", 5),         # 2행 5열 — 시트 D
    "chal": ("챌린지.png", 4),       # 2행 4열 — 시트 E
    "misc": ("스트릭친구.png", 2),    # 2행 2열 — 시트 F
}

ASSETS = {
    # 시트 A — 허브
    "ui-icons/hub-situation": "hub-r1c1",
    "ui-icons/hub-part":      "hub-r1c2",
    "ui-icons/hub-search":    "hub-r1c3",
    "ui-icons/hub-past":      "hub-r2c1",
    "ui-icons/hub-routine":   "hub-r2c2",
    "ui-icons/hub-tabata":    "hub-r2c3",
    # 시트 B — 부위
    "ui-icons/part-chest":     "part-r1c1",
    "ui-icons/part-back":      "part-r1c2",
    "ui-icons/part-legs":      "part-r1c3",
    "ui-icons/part-shoulders": "part-r2c1",
    "ui-icons/part-arms":      "part-r2c2",
    "ui-icons/part-core":      "part-r2c3",
    # 시트 C — 상황
    #
    # ⚠️ `situ-beginner`가 드디어 제 시트에서 온다. 1차에는 상황 시트에
    #    '처음 운동해요'에 맞는 그림이 없어 부위 시트의 전신 실루엣을
    #    빌려 썼다(`part-r2c1`) — 부위 시트를 고치면 같이 바뀌는 상태였다.
    "ui-icons/situ-beginner":    "situ-r1c1",
    "ui-icons/situ-challenge":   "situ-r1c2",
    "ui-icons/situ-no-machines": "situ-r1c3",
    "ui-icons/situ-home":        "situ-r2c1",
    "ui-icons/situ-short":       "situ-r2c2",
    "ui-icons/situ-cardio":      "situ-r2c3",
    # 시트 D — 탭바. 1행=비활성(외곽선) · 2행=활성(채움)
    #
    # ⚠️ 1차 시트는 3행이었고 **2·3행**을 썼다. 2행짜리로 다시 받으면
    #    r2/r3 → r1/r2로 내려간다. 이걸 안 고치면 활성 5장이 통째로 없다.
    "ui-icons/tab-home":            "tab-r1c1",
    "ui-icons/tab-feed":            "tab-r1c2",
    "ui-icons/tab-record":          "tab-r1c3",
    "ui-icons/tab-challenge":       "tab-r1c4",
    "ui-icons/tab-profile":         "tab-r1c5",
    "ui-icons/tab-home-active":     "tab-r2c1",
    "ui-icons/tab-feed-active":     "tab-r2c2",
    "ui-icons/tab-record-active":   "tab-r2c3",
    "ui-icons/tab-challenge-active":"tab-r2c4",
    "ui-icons/tab-profile-active":  "tab-r2c5",
    # 시트 E — 챌린지 (배치는 1차와 같다)
    "ui-icons/lock":      "chal-r1c1",
    "ui-icons/finish":    "chal-r1c2",
    "ui-icons/thumbsup":  "chal-r1c3",
    "ui-icons/trash":     "chal-r1c4",
    "ui-icons/handshake": "chal-r2c1",
    "ui-icons/warning":   "chal-r2c2",
    "ui-icons/camera":    "chal-r2c3",
    "ui-icons/crown":     "chal-r2c4",
    # 시트 F — 스트릭·친구 (현재 화면은 이모지를 쓴다)
    "ui-icons/streak-on":   "misc-r1c1",
    "ui-icons/streak-off":  "misc-r1c2",
    "ui-icons/friends":     "misc-r2c1",
    "ui-icons/friends-add": "misc-r2c2",
    # 재사용 — 그리지 않고 같은 칸을 복제한다 (§3 '재사용 3장')
    "ui-icons/goal":   "situ-r1c2",
    "ui-icons/trophy": "tab-r2c4",
    "ui-icons/person": "tab-r2c5",
}
```

> ⚠️ **한 시트만 새로 받는 것은 위험하다.** 시트를 섞어 쓰면 새 시트의 두꺼운
> 획과 옛 시트의 얇은 획이 같은 화면에 놓인다. 시트 A~D는 **같이** 받는다.

### 8.2 `square()`가 아이콘을 확대하지 않는다

```python
cell.thumbnail((inner, inner), Image.LANCZOS)   # thumbnail은 축소만 한다
```

글로우를 잘라 내고 나면 몸통이 작아지는데 `thumbnail()`은 그것을 그대로 둔다.
그래서 256px 캔버스 안에서 아이콘이 **123~193px**로 제각각이고, 40px 자리에
얹히면 실제로는 **19~30px**로 그려진다. **크기가 아이콘마다 다르다.**

배지 스크립트(`slice-badge-sheets.mjs:108`)는 같은 함정을 겪고 이렇게 풀었다:

```js
const CORE_FRAC = 0.74;                                // 본체가 캔버스에서 차지할 비율
const scale = (SIZE * CORE_FRAC) / Math.max(bw, bh);   // 축소·확대 둘 다
```

`square()`도 **몸통이 캔버스의 일정 비율을 차지하도록 정규화**해야 한다.
확대가 화질을 만들어 주지는 않지만, **모든 아이콘이 같은 크기로 보이는 것**은
그것대로 필요하다.

---

## 9. 체크리스트

- [ ] 시트 A를 기준점으로 확정 (§6 ①②) — `check-ui-icons.py` 통과할 때까지 재생성
- [ ] 기준점을 첨부해 시트 B~E 생성 (§6 ③)
- [ ] 시트 B에 골드 채움 문단, 시트 D에 외곽선/채움 문단을 넣었는지
- [ ] 시트 E는 이모지·SVG·이미지 중 무엇으로 갈지 정했는지 (§3 시트 E 경고)
- [ ] `check-ui-icons.py --all` **43장 전부 ✅**
- [ ] 시트 전체가 한 화풍인지 — 선화와 검은채움이 섞이지 않았는지
- [ ] 글로우·그림자·격자선·글자·숫자가 없는지
- [ ] `--preview`를 **카드 색 배경**에서 **26·40px**로 확인
- [ ] `SHEETS`·`ASSETS` 매핑을 새 시트 배치로 갈아 끼웠는지 (§8.1) — **안 고치면 엉뚱한 칸이 잘린다**
- [ ] `square()` 정규화 반영 (§8.2)
- [ ] 개발 서버에서 허브·탭바·부위·상황 화면을 직접 눌러 확인
- [ ] 파일당 40KB 이하 (`ui-icons.test.ts`가 막는다)
