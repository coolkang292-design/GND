# GND 프로그램 카드 이미지 2종 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하체 프로그램에는 강력한 남성 바벨 스쿼트 이미지를, 체지방 관리 프로그램에는 탄력 있는 여성 케틀벨 스윙 이미지를 GND의 검정·금빛·땀·수증기 스타일로 만든다.

**Architecture:** built-in `image_gen`으로 서로 다른 이미지 두 장을 별도 호출해 생성한다. 각 결과는 눈으로 인체·운동기구·얼굴 비노출을 검수하고 프로젝트 보존 폴더에 복사한 뒤, 로컬 비교 화면에서 프로그램 카드의 가로형 크롭을 확인한다. 앱 자산 교체와 배포는 이 계획의 범위가 아니다.

**Tech Stack:** OpenAI built-in ImageGen, Windows PowerShell, Codex visual companion

---

### Task 1: 남성 하체 프로그램 이미지 생성

**Files:**
- Create: `C:\Users\SAMSUNG\workout-app\어플 UI 이미지\새 이미지\GND-프로그램-하체-남성-바벨스쿼트-수증기.png`
- Reference: `docs/superpowers/specs/2026-08-13-program-card-image-refresh-design.md`

- [ ] **Step 1: 아래 프롬프트로 새 이미지를 생성한다**

```text
Use case: ads-marketing
Asset type: GND mobile fitness program card cover, square source for a wide card crop
Primary request: Create a photorealistic premium sports advertising image that instantly communicates powerful lower-body strength.
Scene/backdrop: dark black gym studio with a subtly reflective floor and restrained warm gold atmospheric accents
Subject: one muscular adult man performing a heavy barbell back squat at the bottom-to-drive transition, pushing upward with controlled explosive force; thick powerful thighs, glutes and calves visibly engaged; both feet planted and knees naturally aligned
Style/medium: cinematic high-end sports photography, realistic anatomy, realistic pores, wet skin and damp black training clothes
Composition/framing: full body and the full barbell visible, low three-quarter side angle, subject centered so the torso, thighs, barbell plates and feet remain readable after a wide horizontal card crop
Lighting/mood: black-and-gold rim lighting, intense controlled energy; sweat beads and natural warm steam rising from the body as after a hard workout; face turned down and hidden in shadow
Color palette: deep black, charcoal and restrained warm gold
Constraints: one adult only; no text, logo or watermark; correct hands, joints, barbell and weight plates; the exercise must read clearly as a heavy back squat
Avoid: empty bar, casual stretching, front-facing recognizable face, distorted limbs, extra fingers, impossible barbell geometry, excessive fantasy light trails, sexualized styling
```

- [ ] **Step 2: 생성 결과를 눈으로 검수한다**

정상 조건: 남성 한 명, 바벨 백 스쿼트, 하체 근육과 바닥을 미는 힘, 실제 같은 땀·수증기, 얼굴 비노출, 자연스러운 손·관절·바벨이 모두 확인된다.

- [ ] **Step 3: 정상 결과를 보존 폴더에 복사하고 원본과 해시를 비교한다**

ImageGen 완료 직후 PowerShell에서 가장 최근 생성된 PNG를 선택해 실행한다.

```powershell
$generatedPath = (Get-ChildItem -LiteralPath 'C:\Users\SAMSUNG\.codex\generated_images' -Recurse -Filter '*.png' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$savedPath = 'C:\Users\SAMSUNG\workout-app\어플 UI 이미지\새 이미지\GND-프로그램-하체-남성-바벨스쿼트-수증기.png'
if (-not $generatedPath) { throw '새로 생성된 PNG를 찾지 못했습니다.' }
if (Test-Path -LiteralPath $savedPath) { throw "기존 파일을 덮어쓸 수 없습니다: $savedPath" }
Copy-Item -LiteralPath $generatedPath -Destination $savedPath
(Get-FileHash -LiteralPath $generatedPath).Hash -eq (Get-FileHash -LiteralPath $savedPath).Hash
```

Expected: `True`

### Task 2: 여성 체지방 관리 프로그램 이미지 생성

**Files:**
- Create: `C:\Users\SAMSUNG\workout-app\어플 UI 이미지\새 이미지\GND-프로그램-체지방관리-여성-케틀벨스윙-수증기.png`
- Reference: `docs/superpowers/specs/2026-08-13-program-card-image-refresh-design.md`

- [ ] **Step 1: 아래 프롬프트로 새 이미지를 생성한다**

```text
Use case: ads-marketing
Asset type: GND mobile fitness program card cover, square source for a wide card crop
Primary request: Create a photorealistic premium sports advertising image that communicates a lighter body, athletic tone and vivid healthy energy.
Scene/backdrop: dark black gym studio with a subtly reflective floor and restrained warm gold atmospheric accents
Subject: one athletic adult woman with a healthy toned full-body silhouette performing a dynamic two-handed kettlebell swing near chest height; core, glutes, legs and shoulders engaged; strong balanced stance and confident motion
Style/medium: cinematic high-end sports photography, realistic healthy anatomy, realistic skin texture, sweat beads and damp black performance clothing
Composition/framing: full body and complete kettlebell visible, three-quarter side angle, subject centered so the kettlebell, torso, hips and feet remain readable after a wide horizontal card crop
Lighting/mood: black-and-gold rim lighting, lively focused energy; natural warm steam rising from the body after an intense workout; face angled down or sideways and mostly hidden by shadow and motion
Color palette: deep black, charcoal and restrained warm gold
Constraints: one adult only; athletic and toned rather than extremely thin; practical non-revealing training clothes; no text, logo or watermark; correct hands, joints and kettlebell handle
Avoid: static fitness pose, sexualized framing, exposed cleavage, front-facing recognizable face, distorted limbs, extra fingers, impossible kettlebell, excessive fantasy light trails
```

- [ ] **Step 2: 생성 결과를 눈으로 검수한다**

정상 조건: 여성 한 명, 케틀벨 스윙, 건강하고 탄력 있는 전신, 실제 같은 땀·수증기, 얼굴 비노출, 자연스러운 손·관절·케틀벨이 모두 확인된다.

- [ ] **Step 3: 정상 결과를 보존 폴더에 복사하고 원본과 해시를 비교한다**

ImageGen 완료 직후 PowerShell에서 가장 최근 생성된 PNG를 선택해 실행한다.

```powershell
$generatedPath = (Get-ChildItem -LiteralPath 'C:\Users\SAMSUNG\.codex\generated_images' -Recurse -Filter '*.png' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$savedPath = 'C:\Users\SAMSUNG\workout-app\어플 UI 이미지\새 이미지\GND-프로그램-체지방관리-여성-케틀벨스윙-수증기.png'
if (-not $generatedPath) { throw '새로 생성된 PNG를 찾지 못했습니다.' }
if (Test-Path -LiteralPath $savedPath) { throw "기존 파일을 덮어쓸 수 없습니다: $savedPath" }
Copy-Item -LiteralPath $generatedPath -Destination $savedPath
(Get-FileHash -LiteralPath $generatedPath).Hash -eq (Get-FileHash -LiteralPath $savedPath).Hash
```

Expected: `True`

### Task 3: 실제 프로그램 카드 크롭 비교

**Files:**
- Create: visual companion 서버가 `server-info`로 반환한 세션의 `content/program-card-images.html`

- [ ] **Step 1: 두 이미지를 카드 비율로 나란히 표시한다**

로컬 비교 화면에서 각 이미지를 현재 프로그램 카드와 같은 가로형 프레임에 `object-fit: cover`로 배치하고 아래 실제 문구를 함께 표시한다.

```text
실루엣을 완성하는 하체
하체의 힘과 균형을 세우는 6주

몸은 가볍게, 인상은 선명하게
근육을 지키는 체지방 관리 6주
```

- [ ] **Step 2: 카드 크롭을 눈으로 검수한다**

정상 조건: 하체 카드에서는 바벨과 허벅지의 힘이, 체지방 관리 카드에서는 케틀벨과 여성의 탄력 있는 전신이 작은 화면에서도 즉시 구분된다. 얼굴은 두 카드 모두 핵심 초점이 아니다.

- [ ] **Step 3: 사용자에게 두 이미지를 보여주고 승인 여부를 받는다**

승인 전에는 `public/program-assets/lower.webp`와 `public/program-assets/lean.webp`를 교체하지 않는다.
