# Vercel Deployment Storage 최적화 — 현황 측정과 구현 계획

- 이슈: [coolkang292-design/GND#22](https://github.com/coolkang292-design/GND/issues/22) (open, 댓글 0, 2026-10-21 등록)
- 작성: 2026-10-23. 이 문서는 **읽기 전용 조사 결과 + 계획**이다. 코드·설정·배포는 하나도 바꾸지 않았다.
- 측정 원본: Vercel REST API(`/v6/deployments` 전 페이지, `/v9/projects/...`), `ffprobe`, `public/` 파일 크기, 코드 참조 검색

### 확정된 결정 (사용자, 2026-10-23)
1. **운영 배포는 CLI 수동 배포만 쓴다.** `main` 푸시·병합으로 운영 배포가 나가는 경로는 쓰지 않는다 (`CLAUDE.md §배포` 유지).
   운영 배포는 개발 서버 검증 → 테스트 통과 → 사용자 승인 → `vercel --prod` 순서다.
   배포할 때 **Git 커밋 SHA와 Vercel 배포 ID를 함께 기록**한다 (재현·롤백용).
2. 이 계획서는 `docs/issue-22-vercel-storage-plan` 브랜치의 Draft PR로 관리하고, 별도 승인 전에는 merge하지 않는다.
3. 이번 범위는 **계획서 등록과 이슈 업데이트까지**다. 음원 압축·파일 제외·보존 기간 변경·배포 삭제·운영 배포·Supabase 변경은 하지 않는다.

---

## 1. 이슈 계획 대비 현황

| 이슈 단계 | 상태 | 이번에 확인한 것 |
|---|---|---|
| Phase 0 Baseline | **일부 완료** | 배포 124건 전량 수집, 팀 프로젝트 1개 확인, 보존 정책 확인. Usage 화면(Deployment vs Functions Storage 분리)과 배포 **Resources** 뷰는 대시보드 로그인이 필요해 **[미확인]** |
| Phase 1 의존성 조사 | **일부 완료** | 큰 정적 파일 참조 추적(아래 §3). 런타임 접근 로그·번들 분석은 **[미수행]** |
| Phase 2 최적화 PR | 미착수 | — |
| Phase 3 배포 삭제 | 미착수 | **이 계획은 Phase 3을 하지 말 것을 권한다** (§5) |

## 2. 측정 결과 (2026-10-23)

### 2-1. 7.5GB는 전부 GND다
- 팀 `gnd4`의 프로젝트는 **`gnd` 하나뿐**이다 (`/v9/projects`). 이슈의 "팀 전체 지표라 GND 단독이 아닐 수 있다"는 가설은 기각.

### 2-2. 보존 정책은 30일 롤링 창이다
```
expirationDays: 30 (Preview) / expirationDaysProduction: 30
expirationDaysCanceled: 30 / expirationDaysErrored: 30 / deploymentsToKeep: 10
```
Vercel 공지(2026-09-16): Hobby는 30일이 지나면 최근 production 3개·최근 배포 3개만 남긴다.
현재 운영·alias·활성 브랜치 배포는 보호된다. **10GB를 넘으면 예외가 아닌 배포를 즉시 지운다.**

### 2-3. 보존 중인 배포 124건 — READY 102건
| 구분 | 건수 |
|---|---|
| production READY | 54 (CLI 43 · GitHub 연동 8 · 기타·재배포 3 — §2-6) |
| preview READY | 48 (GitHub 연동 45 · CLI 3) |
| CANCELED / ERROR / BLOCKED | 22 |

- 일자별 READY: 10/05 **23건**, 10/19 **23건**, 10/13 11건, 10/20 11건 …
- 브랜치 하나에서 Preview가 많이 생겼다: `feat/random-workout-stamps-p1` 10, `feat/profile-achievement-summary` 9, `fix/member-profile-achievements-calendar` 8

### 2-4. 배포 1건의 크기는 약 73MB로 추정된다 [추정]
- `public/` = **72MB / 415개 파일**. 그중 `public/audio/` = **54MB (75%)**
- 7.5GB ÷ READY 102건 ≈ **73.5MB/건** — `public/` 크기와 거의 같다
- ⇒ **배포마다 같은 54MB 음원이 통째로 다시 저장된다**는 해석과 맞는다. 정확한 값은 대시보드 Resources 뷰로 확정해야 한다 [미확인]

### 2-5. 큰 정적 파일과 참조
| 파일 | 크기 | 참조 | 판정 |
|---|---|---|---|
| `audio/tabata-16min-total-body-v2.mp3` | 30.5MiB | `src/lib/domain/tabata.ts:59` | (A) 현용 |
| `audio/tabata-8min-total-body-v2.mp3` | 15.3MiB | `tabata.ts:53` | (A) 현용 |
| `audio/tabata-4min-total-body.mp3` | 7.8MiB | `tabata.ts:47` | (A) 현용 |
| `splash/gnd-launch-motivation-v4.png`·`v5.png` | 5.2MB | `src`에 없음 (현행은 `-v8.webp`) | (B) 불명 — 문서·과거 번들 확인 필요 |
| `avatar-mock/` | 0.86MB | `src`에 없음 | (B) 불명 |
| `exercise-image-local-trial/` | 1.2MB | 개발 모드 + 플래그에서만 (`exercise-image-local-trial.ts:14`) | (C) 개발 전용 |

음원은 **MP3 256kbps · 48kHz · 스테레오**다. 8·16분은 4분 원본을 이어붙인 파일이다.

### 2-6. `main`이 운영으로 자동 배포된 원인 — 읽기 전용 확인 ⚠️
**설정 (조회만 함):**
- Vercel Git 연동: `coolkang292-design/GND`, 운영 브랜치 `main`, `createDeployments: enabled`, 연결 시각 2026-10-11 21:06Z, deploy hook 0개, Ignored Build Step 없음, Root Directory 없음
- `vercel.json`의 `git.deploymentEnabled.main: false`는 `c8286fa`(2026-10-12)부터 들어 있다. 아래 표의 **자동 배포된 커밋 6개 모두** 이 줄을 갖고 있다 (`git show <sha>:vercel.json`으로 확인)
- GitHub Actions(`ci.yml`·`db-regression.yml`)는 배포하지 않는다 (`vercel` 호출 없음)

**`main` 커밋과 배포 대조 (연동 이후, first-parent):**

| 커밋 | 들어간 방식 (committer) | Vercel 배포 |
|---|---|---|
| `9d96194` #21 · `af3b713` #20 · `11226bf` #18 | GitHub 웹 PR 병합 (`GitHub`) | **production READY** (`githubDeployment: 1`) |
| `7cd8ac7` · `9eca34f` · `4fea838` | GitHub 웹 PR 병합 (`GitHub`) | **production READY** |
| `a63720f` #17 | GitHub 웹 PR 병합, 5분 뒤 #18이 이어 병합 | 기록 없음 (뒤 커밋에 흡수된 것으로 보임) |
| `b122ef5` · `c3c2e91` · `ddf630a` · `eb43f9f` · `86a4674` · `60f817c` 외 | 로컬에서 `git push` (`MK Kang`) | **배포 안 됨** — 차단이 동작함 |

**결론:**
- 로컬에서 `main`에 푸시하면 `deploymentEnabled.main: false`가 **막는다**.
- **GitHub 웹에서 PR을 병합한 커밋 6개는 모두 운영 배포가 됐다.** 지금 운영 중인 `dpl_EWmusZ1x3ohDUEWBbDjjCt3BEHB4`(`9d96194`, #21)도 PR 병합으로 자동 배포된 것이고, CLI 배포가 아니다.
- 왜 병합만 차단을 통과하는지는 Vercel 문서에 나와 있지 않다. 문서는 "브랜치 푸시마다, 그리고 운영 브랜치에 병합될 때" 배포한다고만 쓴다. **원인 메커니즘은 [미확인]**이고, 관측된 패턴은 확실하다.
- 결과: 같은 날 CLI 운영 배포와 병합 자동 배포가 함께 쌓인다 (예: 10/19 CLI 09:40Z + 병합 00:30Z·19:50Z·23:12Z).

**차단 방법 후보 (이번에는 실행 안 함 — 설정 변경은 별도 승인):**
1. 프로젝트 **Ignored Build Step**: `VERCEL_ENV=production`이면 빌드를 건너뛴다. 병합 배포는 CANCELED로 남고 용량은 거의 쓰지 않는다. CLI `--prod` 배포는 막지 않는지 Preview로 먼저 확인해야 한다 [미검증]
2. GitHub에서 웹 병합을 쓰지 않고 로컬에서 병합해 푸시한다 (운영 절차만 바꾸므로 설정 변경 없음, 사람 실수에 약함)
3. `git.deploymentEnabled: false`로 Git 자동 배포를 전부 끈다 — 2026-10-12에 정한 "Preview는 자동" 방침과 충돌한다

## 3. 제1원칙 분석

**핵심 문제:** 보존 중인 배포 용량 = **(30일간 READY 배포 수) × (배포 1건 크기)**. 두 인수 중 하나라도 줄이면 된다.

| 가정 | 검토 | 판정 |
|---|---|---|
| 오래된 배포를 지워야 줄어든다 | 30일 롤링 창이라 **가만히 둬도 만료된다** (10/26부터 순차, 11/04에 23건, 11/18에 23건). 수동 삭제는 되돌릴 수 없고 롤백 후보만 잃는다 | **폐기** |
| 음원은 꼭 256kbps여야 한다 | 운동 배경음 + 구령. 16분 한 번 재생에 **사용자 데이터 32MB**가 든다 — 사용자에게도 손해 | **수정** — 128kbps 재인코딩 |
| 음원은 배포 안에 있어야 한다 | 바뀌지 않는 미디어를 배포마다 다시 저장하는 건 낭비다. 다만 외부 저장소는 egress 한도·CORS·iOS Range 요청이라는 새 실패점을 만든다 | **보류** — 재인코딩 효과를 본 뒤 판단 |
| 8·16분 파일을 없애고 4분을 반복 재생한다 | 2026-08-13에 이음매 4.98초 누락으로 카운트다운이 음악보다 앞서 간 전력이 있다. HTML Audio `loop`은 iOS에서 틈이 생긴다 | **폐기** — 46MB가 아까워도 동기화 위험이 더 크다 |
| Preview는 브랜치 푸시마다 필요하다 | 이 저장소의 검증은 로컬 `pnpm dev`가 기준이다. Preview가 실제로 쓰이는 건 폰 QA 일부 | **사용자 확인 필요** |

**확정된 사실:** 팀 프로젝트 1개 · 보존 30일 · READY 102건 · `public/` 72MB 중 음원 54MB · 음원 3개는 모두 현용.

## 4. 구현 계획

예상 효과는 "READY 102건 유지"를 가정한 [추정]이다. 각 단계 뒤에 Usage를 다시 잰다.

### 단계 0 — 기준선 확정 (읽기 전용, 사용자 5분)
- [ ] Vercel Usage → Deployment Storage / Functions Storage 수치와 시각(KST) 캡처 (https://vercel.com/gnd4/~/usage)
- [ ] 최신 운영 배포 → **Resources** → Static Assets·Functions 상위 10개 크기 기록
- [x] 운영 배포 경로 결정 → **CLI 수동 배포만** (2026-10-23 확정)
- [ ] §2-6 차단 방법 후보 중 하나를 골라 별도 승인

### 단계 1 — 음원 재인코딩 (PR, 효과 가장 큼, 위험 낮음)
- 대상: 음원 3개 → **128kbps MP3** (48kHz 스테레오 유지)
- 파일명은 **`-v3`로 올린다** — `tabata.ts`의 경고대로 같은 이름으로 덮으면 브라우저·CDN이 옛 파일을 쓴다
- 기대 절감: 54MB → 약 27MB, **배포 1건당 −27MB (≈ −37%)**, 102건 기준 약 **−2.7GB**
- 검증:
  - [ ] `ffprobe`로 새 파일 길이가 원본과 **±50ms 이내**인지 (250.02 / 500.02 / 1000.04초)
  - [ ] `pnpm dev`에서 4·8·16분 타바타 각각 재생 → 화면 카운트다운과 음원 구령이 **이음매(4:10, 8:20, 12:30)에서 맞는지** 직접 확인
  - [ ] 일시정지·재개, 지난 타바타 불러오기
  - [ ] 음질 청취 비교 (사용자 확인)
- 위험: 배포 직전에 앱을 열어 둔 사용자가 옛 번들로 `-v2`를 요청하면 404 → 새로고침으로 해결. 무시 가능한 수준으로 판단 [미검증]

### 단계 2 — 쓰지 않는 정적 파일 정리 (PR, 효과 작음)
- `exercise-image-local-trial/`(1.2MB): 파일은 로컬에 두고 **`.vercelignore`로 업로드만 제외** (개발 QA 유지)
- `splash/*-v4.png`·`v5.png`(5.2MB), `avatar-mock/`(0.86MB): `src`·문서·`release-notes`·OG 메타를 다시 확인한 뒤 같은 방식으로 제외. 하나라도 걸리면 보존
- 기대 절감: 배포 1건당 약 −7MB

### 단계 3 — 배포 수 줄이기 (설정 변경, 사용자 승인 필수)
선택지 (하나 또는 조합):
1. **Preview 보존 기간 30일 → 7일** (프로젝트 Settings → Security → Deployment Retention). Preview 48건 → 약 15건. 7일 지난 Preview URL은 사라진다. Hobby에서 선택 가능한 값은 [미검증]
2. **Preview 자동 생성 범위 축소**: `vercel.json`의 `git.deploymentEnabled`로 PR 대상 브랜치만 켜거나 끈다
3. **PR 병합 자동 운영 배포 차단** (§2-6 후보 중 택1) — CLI 배포와 겹치는 운영 배포 제거. 연동 이후 6건이 이 경로였다

### 단계 4 — 하지 않는 것
- **배포 수동 삭제(이슈 Phase 3) 안 함.** 30일이면 자동 만료되고, 수동 삭제는 되돌릴 수 없으며 이득은 며칠 앞당기는 것뿐이다
- 음원을 외부 저장소(Supabase Storage·Vercel Blob)로 옮기는 것은 단계 1~3 후에도 한도에 가까울 때만 별도 이슈로. 그때는 egress 한도와 iOS Safari Range 재생을 먼저 잰다

### 예상 추이 [추정]
| 시점 | 건수 × 크기 | 용량 |
|---|---|---|
| 지금 | 102 × 73MB | ≈ 7.4GB |
| 단계 1+2 이후 새 배포로 교체 완료 | 102 × 39MB | ≈ 4.0GB |
| + 단계 3-1 (Preview 7일) | ~70 × 39MB | ≈ 2.7GB |

⚠️ 단계 1·2는 **새 배포부터** 작아진다. 기존 배포가 만료돼야(최대 30일) Usage에 다 반영된다.

## 5. 중단 조건
- 재인코딩 음원이 원본과 50ms 이상 길이가 다르거나, 이음매에서 카운트다운이 어긋남
- `public/` 제외 후 로컬 `next build` 결과물에서 참조 파일이 404
- Usage 재측정이 추정과 크게 다름(±30% 이상) → 추가 변경 멈추고 Resources 뷰로 원인 재조사

## 6. 남은 확인 [미확인]
- 배포 1건의 실제 Static Assets / Functions 크기 (대시보드 Resources)
- Usage의 Functions Storage 비중
- 10GB 초과 시 새 배포가 막히는지 (공지는 "즉시 삭제"만 언급)
- 타바타 음원의 월간 재생 횟수 (외부 저장소 이전 판단용)
- GitHub 웹 PR 병합이 `deploymentEnabled.main: false`를 통과하는 이유 (§2-6, 관측 패턴만 확인)
- Ignored Build Step을 넣었을 때 CLI `--prod` 배포가 영향을 받지 않는지
