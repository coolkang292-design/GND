# 승인 없는 Production 자동 배포 차단 — 원인 조사와 검증 계획

- 관련: [GND#22](https://github.com/coolkang292-design/GND/issues/22), [GND#23](https://github.com/coolkang292-design/GND/pull/23)(Draft, 병합 금지)
- 작성: 2026-10-23 조사·계획, 2026-10-24 격리 실험(§5)과 **GND 적용(§6, 사용자 승인)**. PR 병합·운영 배포는 하지 않았다.
- 현재 상태: GND에 Ignored Build Step **적용됨**(2026-10-24 02:31Z). 실제 개발 흐름에서의 검증 3건은 대기 중(§6-2).
- 목표 세 가지:
  1. 작업 브랜치 푸시 → Preview가 자동으로 생긴다
  2. GitHub 병합(웹 포함) → Production 배포가 **나가지 않는다**
  3. 승인 후 CLI `vercel --prod` → Production 배포가 정상으로 나간다

---

## 1. 원인

### 1-1. 설정 상태 (조회만 함)
| 항목 | 값 | 근거 |
|---|---|---|
| Git 연동 | `coolkang292-design/GND` (public), 운영 브랜치 `main`, `createDeployments: enabled` | `/v9/projects` |
| 연동 시각 | 2026-10-11 21:06Z | `link.createdAt` |
| deploy hook | 0개 | `link.deployHooks` |
| Ignored Build Step | 없음 (`commandForIgnoringBuildStep: null`) | `/v9/projects` |
| 시스템 환경변수 노출 | `autoExposeSystemEnvs: true` | `/v9/projects` |
| `vercel.json` | `git.deploymentEnabled.main: false` — `c8286fa`(10/12)부터. **자동 배포된 커밋 6개 모두 이 줄을 가짐** | `git show <sha>:vercel.json` |
| GitHub Actions | `ci.yml`·`db-regression.yml` 둘 다 배포 안 함 | 파일 확인 |

### 1-2. `main`에 들어간 방식과 배포 결과 (연동 이후 전수)
| 들어간 방식 | 건수 | Production 배포 | 예 |
|---|---|---|---|
| 로컬 `git push` (일반 커밋·로컬 병합 커밋, 부모 2개 포함) | 커밋 23개 (푸시 횟수는 더 적음) | **0건** — 확인한 4개는 Vercel 커밋 상태도 없음 | `b122ef5`, `c3c2e91`, `ddf630a`(PR #15 로컬 병합), `86a4674` |
| GitHub 웹 **squash 병합** (committer `GitHub`, 부모 1개) | 8건 | **7건** | #12 `4fea838`, #13 `9eca34f`, #14 `7cd8ac7`, #18 `11226bf`, #20 `af3b713`, #21 `9d96194`, #24 `2aae24b`(10/23, §5) |
| ↳ 예외 | 1건 | 0건 | #17 `a63720f` — 병합 4분 26초 뒤 #18이 이어 병합됨. Vercel 상태 없음 |

- 7건 모두 Vercel GitHub 앱이 만들었다: `meta.githubDeployment: "1"`, 빌드 로그 `Cloning github.com/coolkang292-design/GND (Branch: main, Commit: …)`, GitHub Deployments `environment: Production`, `creator: vercel[bot]`
- 병합부터 배포 시작까지 대개 1분 이내였다(#18은 20초). #21만 3분 19초 걸렸다

### 1-3. 결론
- **확정:** 차단 설정은 로컬 푸시를 매번 막았지만, GitHub 웹 squash 병합은 8건 중 7건을 통과시켰다. GitHub 쪽 다른 경로(Actions·deploy hook)는 없다.
- **[미확인] Vercel 내부에서 왜 그런지.** Vercel 문서에 병합 예외가 없고, 밖에서 볼 수 있는 기록(API·빌드 로그·GitHub 상태)으로는 판정 근거가 남지 않는다. 남은 가설은 둘이다:
  - **가설 A — 병합을 PR의 head 브랜치 기준으로 판정한다.** 우리 저장소는 `main`만 막고 작업 브랜치는 허용한다. `"*": false`까지 둔 다른 저장소(flytally-logbook #347)에서는 squash 병합이 배포되지 않았다는 보고와 맞는다. **#17이 반례**다.
  - **가설 B — GitHub가 서버에서 만든 커밋은 웹훅 시점에 `vercel.json`을 못 읽으면 기본값(배포)으로 간다.** #17 같은 예외(가끔은 읽힘)와 맞지만 직접 증거는 없다.
- 두 가설 어느 쪽이든 결론은 같다: **`git.deploymentEnabled`만으로는 Production 차단을 보장할 수 없다.** 커밋 내용에 기대지 않는 차단막이 하나 더 필요하다.
- 확정하려면 §3-2 격리 실험의 T0(재현)이나 Vercel 지원 문의가 필요하다.

## 2. 권장 해결책

### 2-1. 비교
| 안 | 내용 | Preview 유지 | Git Production 차단 | CLI 운영 배포 | 판단 |
|---|---|---|---|---|---|
| **A. Ignored Build Step + 명시적 허가 플래그** | 프로젝트 설정에 명령을 넣는다. Production인데 `GND_MANUAL_PROD=1`이 없으면 빌드를 취소한다. CLI는 `--build-env GND_MANUAL_PROD=1`을 붙인다 | ✅ | ✅ (CANCELED로 남음) | ✅ 플래그가 빌드 명령까지 전달된다면 [미검증] | **권장** |
| B. "Only build preview" 프리셋 + CLI `--prebuilt` | Git·CLI 구분 없이 production 빌드를 막고, CLI는 로컬에서 빌드한 결과물을 올린다 | ✅ | ✅ | `--prebuilt`가 ignore 단계를 건너뛰는지 [미검증] | A가 실패할 때의 대안 |
| C. 운영 브랜치를 쓰지 않는 이름으로 변경 | `main` 병합이 Preview로 바뀐다 | ✅ | ✅ | ✅ | Preview가 병합마다 생겨 #22(용량)에 역행. 비권장 |
| D. Production 도메인 자동 연결 끄기 (staged) | 병합 배포가 운영 주소에 붙지 않는다 | ✅ | 빌드·저장은 됨 | `vercel promote` 단계 추가 | 용량 낭비, 절차 변경. 비권장 |
| E. Git 자동 배포 전부 끄기 (`deploymentEnabled: false`) | — | ❌ | ✅ | ✅ | 목표 1 위반 |
| F. 웹 병합 금지 (로컬 병합만) | 운영 규칙만 바꾼다 | ✅ | 사람에 의존 | ✅ | A와 함께 쓰는 보조 규칙 |

### 2-2. 권장안 A의 구체 내용 (아직 적용 안 함)
> ⚠️ **2026-10-24 격리 실험으로 바뀐 점 (§5):** CLI 배포에는 Ignored Build Step이 **아예 실행되지 않는다.**
> 그래서 `GND_MANUAL_PROD` 플래그는 CLI 배포에 필요 없다. 명령의 플래그 분기는 Git 배포에서 쓰이지 않는다.
> GND에 적용할 최종 명령과 절차는 §6을 따른다.

**대시보드** Settings → Build and Deployment → Ignored Build Step → Custom:
```bash
if [ "$VERCEL_ENV" != "production" ]; then exit 1; fi; if [ "$GND_MANUAL_PROD" = "1" ]; then exit 1; fi; exit 0
```
- exit 1 = 빌드 진행, exit 0 = 빌드 취소(CANCELED)
- `vercel.json`의 `ignoreCommand`가 아니라 **대시보드에 둔다.** 커밋 내용과 무관하게 적용되므로, 가설 B(`vercel.json`을 못 읽는 경우)와 "PR이 스크립트를 고쳐서 스스로 통과하는" 경우를 둘 다 막는다
- `git.deploymentEnabled.main: false`는 **그대로 둔다** (로컬 푸시는 아예 배포를 만들지 않아 할당량·기록이 깨끗하다)

**CLI 운영 배포 명령** (CLAUDE.md §배포 절차의 마지막 줄을 바꾼다):
```bash
SHA=$(git -C <검증한 로컬 main> rev-parse HEAD)
npx vercel@latest --prod --yes --scope gnd4 \
  --build-env GND_MANUAL_PROD=1 \
  --meta gndCommitSha=$SHA
```
- `--meta gndCommitSha`로 **커밋 SHA가 Vercel 배포 기록에 남는다.** 지금 CLI 배포에는 SHA가 없다(git 메타 없이 올라가서). 배포 ID와 SHA를 한 곳에서 대조할 수 있다
- 두 옵션 모두 CLI 65.2.0 `vercel deploy --help`에 있다 (확인함)

### 2-3. 로컬 로직 검증 (완료, 셸에서 환경변수 조합만 바꿔 실행)
| 경우 | 기대 exit | 결과 |
|---|---|---|
| 브랜치 푸시 → Preview | 1 (빌드) | ✅ |
| GitHub 웹 병합 → main production | 0 (취소) | ✅ |
| CLI `--prod` + 플래그, git 메타 없음 | 1 | ✅ |
| CLI `--prod` + 플래그, `.git` 있는 워크트리 | 1 | ✅ |
| CLI `--prod` 플래그 없음 (음성 대조) | 0 | ✅ |
| `VERCEL_ENV` 비어 있음 | 1 | ✅ (Preview 쪽으로 판정 — §4 위험 참고) |
| 플래그 오타 `GND_MANUAL_PROD=true` | 0 | ✅ |

⚠️ 이건 **셸 로직**만 검증한 것이다. Vercel이 이 명령을 언제·어떤 환경변수로 실행하는지는 §3에서 확인해야 한다.

## 3. 검증 계획

### 3-1. 실제 Vercel 동작 중 아직 모르는 것
1. CLI `vercel --prod` 배포에서도 Ignored Build Step이 실행되는가
2. `--build-env` 값이 Ignored Build Step 명령에 보이는가 (문서는 "빌드 시점 시스템 환경변수"만 언급)
3. `--prebuilt` 배포는 Ignored Build Step을 건너뛰는가 (안 B용)
4. GitHub 웹 squash 병합이 `deploymentEnabled.main: false`를 통과하는 현상이 **GND 밖에서도 재현되는가** (원인 확정용)
5. CANCELED 배포가 Deployment Storage를 얼마나 쓰는가

### 3-2. 격리 실험 — **실행 전 승인 필요** (GND 프로젝트·팀 `gnd4`는 건드리지 않는다)
**준비** (만드는 것: 아래 두 개. 끝나면 지운다 — 삭제도 승인 대상)
- GitHub 비공개 저장소 `gnd-deploy-guard-lab`: 정적 HTML 1장 + `vercel.json`(`git.deploymentEnabled.main: false`)
- Vercel **개인 Hobby 스코프** 프로젝트 `gnd-deploy-guard-lab`: 위 저장소 연결, 운영 브랜치 `main`
- 배포 1건이 수 KB라 용량·할당량 영향은 사실상 없다

**실험 순서**
| # | 조작 | 기대 | 확인 방법 |
|---|---|---|---|
| T0 | (Ignored Build Step 없이) 브랜치 → PR → **웹 squash 병합**, 3회 반복 | 재현되면 원인이 Vercel 동작으로 확정. 가설 A 검증: 한 번은 브랜치명을 `deploymentEnabled`에서 `false`로 둔 뒤 병합 | 배포 목록 `target`·`meta.githubDeployment` |
| T1 | 대시보드에 §2-2 명령 설정 | — | 설정 화면, `/v9/projects`의 `commandForIgnoringBuildStep` |
| T2 | 작업 브랜치 푸시 | **Preview READY** | 배포 상태, Preview URL 열기 |
| T3 | PR 웹 squash 병합 | **Production CANCELED 또는 없음**, 운영 별칭 그대로 | 배포 상태, 별칭이 가리키는 배포 ID |
| T4 | 로컬 `git push origin main` | 배포 없음 | 배포 목록 |
| T5 | `git archive` 복사본에서 `vercel --prod --build-env GND_MANUAL_PROD=1 --meta gndCommitSha=…` | **Production READY**, 별칭 이동, meta에 SHA | 배포 상세, 운영 주소 `curl`로 새 내용 확인 |
| T6 | 같은 복사본에서 플래그 **없이** `vercel --prod` | **CANCELED** (차단막이 진짜인지 확인하는 음성 대조) | 배포 상태 |
| T7 | `.git`이 있는 워크트리에서 플래그 붙여 `vercel --prod` | READY | 배포 상태 |
| T8 | (안 B) 프리셋 "Only build preview" + `vercel build --prod` → `vercel deploy --prebuilt --prod` | READY | 배포 상태 |
| T9 | T3·T6의 CANCELED 배포 크기 | 0에 가까움 | 대시보드 Resources / Usage |

**판정**
- T2·T3·T5·T6이 모두 기대대로면 안 A를 채택한다
- T5가 CANCELED면 (플래그가 안 보이면) 안 B(T8)로 간다
- T0이 재현되지 않으면 GND 고유 문제일 수 있다 → Vercel 지원 문의, 안 A는 그래도 유효하다

### 3-3. GND 적용 (격리 실험 통과 + 별도 승인 후)
1. GND 프로젝트 대시보드에 §2-2 명령 설정 (되돌리기: Automatic으로 변경)
2. 바로 `/v9/projects`로 `commandForIgnoringBuildStep`을 다시 읽어 적용됐는지 확인
3. **조건 1:** 문서만 바꾼 브랜치를 푸시 → Preview READY
4. **조건 2:** 다음 실제 PR을 웹에서 병합 → Production CANCELED, `gnd-one.vercel.app`가 가리키는 배포 ID가 그대로인지 확인
5. **조건 3:** 다음 승인된 운영 배포를 플래그와 meta를 붙여 CLI로 → READY, 별칭 이동, 운영 번들에서 새 문구 확인, SHA·배포 ID 기록
6. CLAUDE.md §배포 절차의 명령과 "Preview는 자동, main은 차단" 설명을 실제 동작에 맞게 고친다

## 4. 위험 요소
| 위험 | 영향 | 대응 |
|---|---|---|
| 플래그가 Vercel 빌드 명령까지 안 전달됨 | 승인된 CLI 운영 배포가 CANCELED (안전한 쪽으로 실패) | 격리 T5에서 먼저 확인, 안 B로 전환 |
| 명령 오타·문법 오류 | exit 코드가 0·1이 아니면 동작 불명 [미검증] | 격리 T2·T3·T6으로 확인한 문자열을 그대로 옮긴다 |
| `VERCEL_ENV`가 비면 빌드 진행 | Production을 Preview로 오판해 통과 | `autoExposeSystemEnvs: true` 확인함. 격리 실험에서 값 출력으로 재확인 |
| 웹 병합이 CANCELED 기록을 남김 | 하루 배포 할당량(Hobby 100건)과 목록에 잡힘. 용량은 미미할 것 [미검증] | 보조 규칙 F(로컬 병합)로 건수 자체를 줄인다 |
| GitHub가 Vercel 상태를 "canceled"로 표시 | 브랜치 보호 규칙이 Vercel 성공을 요구하면 병합이 막힐 수 있음 | 현재 보호 규칙은 **[미확인]**(API에 인증 필요). 적용 전 저장소 Settings → Branches 확인 |
| 누군가 대시보드 설정을 바꿈 | 차단막이 사라짐 | 설정 변경은 배포 절차 체크리스트에 포함, 정기 조회(`commandForIgnoringBuildStep`) |
| 원인 미확정 | 다른 경로(예: GitHub 웹 편집으로 `main`에 직접 커밋)도 같은 식으로 통과할 수 있음 | 안 A는 트리거 경로와 무관하게 Production 빌드를 막으므로 함께 막힌다 |
| 현재 운영(`9d96194`)이 승인 없이 나간 배포 | 화면 확인 기록이 없을 수 있음 | 이번 범위 밖. 별도 확인 필요 |
| CLAUDE.md 절차 불일치 | 본문은 "`.git` 없는 `git archive` 복사본", 예시 명령은 `git worktree add` | 안 A는 둘 다 통과(T5·T7). 3-3의 6번에서 하나로 정리 |

---

## 5. 격리 실험 결과 (2026-10-24, 사용자 승인)

**환경:** GitHub 비공개 저장소 `coolkang292-design/gnd-deploy-guard-lab` + Vercel `gnd4` 팀 안 별도 프로젝트 `gnd-deploy-guard-lab`(`prj_diRyWTFZNUYfU9F23nD867WviAGM`).
계정에 개인 스코프가 없어(`northstar`) `gnd4` 안에 만들었다(사용자 선택). GND 프로젝트(`prj_JwhGK…`)는 실험 전후 `commandForIgnoringBuildStep: null` 그대로다.
Git 설정은 GND와 맞췄다(`gitProviderOptions.createDeployments: enabled`, 운영 브랜치 `main`, `deploymentEnabled.main: false`, `autoExposeSystemEnvs: true`). 저장소 공개 여부만 다르다(GND 공개, 실험 비공개).
빌드 스크립트가 `VERCEL_ENV`·`GND_MANUAL_PROD`·`VERCEL_GIT_*` 값을 로그와 화면에 찍게 해서 판정 근거를 남겼다.

| # | 조작 | 기대 | 결과 | 배포 ID |
|---|---|---|---|---|
| (사전) | 새 프로젝트 첫 브랜치 푸시 `t0-a` | Preview | **production READY** — 새 프로젝트의 첫 배포는 운영이 된다(Vercel 동작). 두 번째 브랜치 `t0-b`부터 Preview | `dpl_DDHFn…`, `dpl_AqNWK…` |
| T0 | 차단 규칙 없이 웹 squash 병합 2회 (#1 `f7d740a`, #2 `d6595e0`, committer `GitHub`) | GND처럼 운영 배포되면 재현 | **재현 안 됨** — 둘 다 3분 넘게 배포 없음. `deploymentEnabled.main: false`가 막았다 | — |
| T1 | 실험 프로젝트에만 §2-2 명령(로그용 `echo` 추가) 설정 | — | ✅ API 재조회로 적용 확인 | — |
| T2 | 작업 브랜치 `t2` 푸시 | Preview READY | ✅ READY. 로그 `IGN VERCEL_ENV=preview` → 빌드 진행 | `dpl_4XR3N…` |
| T4 | 로컬 `git push origin main` (`bda6732`) | 배포 없음 | ✅ 없음 | — |
| T3 | **누수 재현**: `main: false`를 지우는 PR #3을 웹 squash 병합 (`184cb21`) | Production CANCELED, 운영 별칭 그대로 | ✅ CANCELED. 로그 `IGN VERCEL_ENV=production … REF=main` → "Ignored Build Step command returned exit code 0". `aliasAssigned: false`, 운영 별칭은 직전 배포 유지 | `dpl_7U1nY…` |
| T5 | `git archive` 복사본(`.git` 없음)에서 `vercel --prod --build-env GND_MANUAL_PROD=1 --meta gndCommitSha=…` | Production READY | ✅ READY, 운영 별칭 이동, 화면 `marker=t5-cli`, meta에 SHA 기록. **로그에 Ignored Build Step 실행 줄이 없다** | `dpl_8cCVB…` |
| T6 | 같은 복사본에서 플래그 **없이** `vercel --prod` | (계획) CANCELED | ⚠️ **READY** — 기대와 다름. CLI 배포는 Ignored Build Step을 거치지 않는다 | `dpl_HLRJ9…` |
| T7b | `.git` 있는 폴더(Git 메타 `main`·SHA가 붙음)에서 플래그 없이 | — | **READY**, Ignored Build Step 실행 안 됨 | `dpl_5JPNe…` |
| T7a | `.git` 있는 폴더에서 플래그·meta 붙여 | READY | ✅ READY, meta SHA 기록 | `dpl_53YCo…` |
| T8 | 안 B(`--prebuilt`) | — | **생략** — 안 A가 통과했고, CLI는 이미 규칙을 거치지 않으므로 B를 검증할 이유가 없다 | — |
| T9 | CANCELED 배포 크기 | 0에 가까움 | **[미확인]** — 파일 트리 API 404. `aliasAssigned: false`. 단 **브랜치 별칭 `…-git-main-…`은 취소된 배포를 가리키게 됐다** | `dpl_7U1nY…` |

### 결론
- **세 조건 모두 통과:** ① Preview 자동 생성(T2) ② Git발 운영 배포 차단(T3) ③ CLI 운영 배포 정상(T5·T6·T7)
- **새로 알게 된 사실:** Ignored Build Step은 **Git 연동이 시작한 배포에만** 실행된다. CLI 배포는 `.git` 유무·플래그와 상관없이 실행하지 않는다. 그래서 "플래그 없는 CLI 배포는 막힌다"(T6 음성 대조)는 성립하지 않는다. CLI 배포를 하는 것 자체가 사람이 승인한 행위라는 전제는 그대로다
- **원인은 여전히 [미확인]:** 비공개 실험 저장소에서는 웹 squash 병합이 2/2 막혔다. GND와 남은 차이는 **저장소 공개 여부**다(climaa/acceptance-gate #552도 공개 저장소에서만 새었다고 보고). 확정하려면 실험 저장소를 공개로 바꿔 T0을 다시 하거나 Vercel 지원에 문의해야 한다
- **10/23 7번째 사례:** PR #24(`2aae24b`)가 웹 squash 병합(09:41:55Z)된 지 38초 뒤 GND 운영으로 자동 배포됐다(`dpl_8PbT5Q1YWaZYj7PvqCVsR15X7xFC`, 현재 `gnd-one.vercel.app`)

## 6. GND 적용 — **2026-10-24 적용됨 (사용자 승인)**

### 6-0. 적용 기록
| 항목 | 값 |
|---|---|
| 사전 확인 — 브랜치 보호 | `GET /repos/…/branches/main`: `protected: false`, 필수 상태 체크 `enforcement_level: off`, `contexts: []`. `GET /repos/…/rules/branches/main`: 규칙 0건. `GET /repos/…/rulesets`: 0건. → **Vercel 성공을 요구하는 규칙 없음** (상세 보호 API는 관리자 인증이 필요해 401, 공개 정보로 판정) |
| 사전 확인 — 차단 해제 변수 | GND 환경변수 14개 중 `GND_MANUAL_PROD` 없음 (이름만 조회) |
| 적용 전 값 | `commandForIgnoringBuildStep: null` (프로젝트 `updatedAt` 2026-10-23T09:43:46Z). 전체 설정 스냅샷을 로컬에 저장 |
| 적용 | 2026-10-24T02:31:49Z, `PATCH /v9/projects/prj_JwhGK3yIwL93CafyJXGnzsnALMdk` — 바꾼 필드는 `commandForIgnoringBuildStep` 하나 |
| 적용 후 확인 | 다시 읽은 값이 실험 프로젝트에서 검증한 문자열과 **정확히 일치**. 적용 전 스냅샷과 비교해 **바뀐 필드는 이것 하나**(`updatedAt` 같은 변동 필드 제외). 운영 브랜치 `main`, `createDeployments: enabled`, `autoExposeSystemEnvs: true` 그대로 |
| 운영 영향 | 설정 변경은 재배포를 일으키지 않는다. `gnd-one.vercel.app` → `dpl_8PbT5Q1YWaZYj7PvqCVsR15X7xFC`(PR #24, `2aae24b`) 그대로, `/` → 307 `/record` → 200 |
| 되돌리기 | `{"commandForIgnoringBuildStep": null}`을 같은 API로 PATCH (또는 대시보드 Ignored Build Step을 Automatic으로) |

### 6-1. 넣을 명령 (격리 실험에서 검증한 문자열 그대로)
```bash
echo "IGN VERCEL_ENV=$VERCEL_ENV GND_MANUAL_PROD=$GND_MANUAL_PROD REF=$VERCEL_GIT_COMMIT_REF"; if [ "$VERCEL_ENV" != "production" ]; then exit 1; fi; if [ "$GND_MANUAL_PROD" = "1" ]; then exit 1; fi; exit 0
```
- 검증한 문자열을 바꾸지 않고 그대로 쓴다. 플래그 분기는 Git 배포에서 쓰이지 않는 비상 해제 장치다. 프로젝트 환경변수에 `GND_MANUAL_PROD=1`을 넣으면 차단이 풀리므로, **그 변수를 프로젝트 환경변수로 만들지 않는다**
- 넣는 곳: GND 프로젝트 `commandForIgnoringBuildStep` (대시보드 Settings → Build and Deployment → Ignored Build Step과 같은 값). `vercel.json`이 아니다
- `vercel.json`의 `git.deploymentEnabled.main: false`는 그대로 둔다

### 6-2. 순서
| # | 할 일 | 확인 | 되돌리기 |
|---|---|---|---|
| 0 | ✅ 브랜치 보호·Ruleset 확인 — 충돌 없음 (6-0) | — | — |
| 1 | ✅ GND 프로젝트에 6-1 명령 적용 (6-0) | ✅ 다시 읽어 일치 확인 | `commandForIgnoringBuildStep: null`로 PATCH |
| 2 | **조건 ①** 다음 작업 브랜치 푸시 | Preview READY, 빌드 로그 `IGN VERCEL_ENV=preview` | 1의 되돌리기 |
| 3 | **조건 ②** 다음 실제 PR을 웹에서 병합 (일부러 병합을 만들지 않는다) | Production **CANCELED**, 로그 `exit code 0`, `gnd-one.vercel.app`이 직전 배포 ID 그대로 | 1의 되돌리기 |
| 4 | **조건 ③** 다음 승인된 운영 배포를 CLI로: `npx vercel@latest --prod --yes --scope gnd4 --meta gndCommitSha=$(git rev-parse HEAD)` | READY, `gnd-one.vercel.app` 이동, 운영 번들에서 새 문구, meta SHA·배포 ID 기록 | 이전 배포로 Instant Rollback |
| 5 | ✅ CLAUDE.md §배포 고침 (이 문서와 같은 브랜치): 두 겹 차단막, 웹 병합 → CANCELED, `--meta gndCommitSha`, `GND_MANUAL_PROD` 금지 | 문서 diff | — |

- 3과 4는 순서가 바뀌어도 된다. 둘 다 **실제로 일어날 때** 확인한다(가짜 병합·가짜 배포를 만들지 않는다)
- 3이 확인될 때까지는 **웹 병합을 하지 않는 운영 규칙**(안 F)을 유지한다

### 6-3. 위험 요소 (실험 반영)
| 위험 | 근거 | 대응 |
|---|---|---|
| `gnd-git-main-gnd4.vercel.app`이 취소된 배포를 가리킴 | T9 | 사용자가 쓰는 주소가 아니다. 운영 주소(`gnd-one`)는 영향 없음(T3) |
| 대시보드 **Redeploy**로 Git 배포를 다시 올리면 취소될 수 있음 | 문서: Redeploy 창에 "Use project's Ignore Build Step" 체크박스 [미검증] | 운영 재배포는 CLI로 하거나, Redeploy 시 체크 해제 |
| CANCELED도 하루 배포 한도(Hobby 100건)에 들어감 | Vercel 문서 | 웹 병합 수 자체를 줄인다(안 F) |
| CANCELED 배포의 저장 용량 | T9 [미확인] | 적용 뒤 Usage에서 확인 |
| 원인 미확정 | T0 미재현 | 차단은 트리거와 무관하게 Git발 운영 빌드를 막으므로 원인과 상관없이 유효(T3) |
| 누군가 프로젝트 환경변수에 `GND_MANUAL_PROD=1` 추가 | 6-1 | 금지 사항으로 CLAUDE.md에 적는다 |
| 현재 운영(`2aae24b`, PR #24)이 승인 없이 나간 배포 | §5 | 이번 범위 밖. 화면 확인 여부를 따로 점검 |

### 6-4. 실험 자원 — **유지** (사용자 지시 2026-10-24, 삭제하지 않는다)
원인 확정용 추가 실험(저장소 공개 전환 후 T0 재시도)에 쓸 수 있다. 나중에 정리할 때 대상:
- GitHub `coolkang292-design/gnd-deploy-guard-lab` 저장소 삭제
- Vercel 프로젝트 `gnd-deploy-guard-lab` 삭제 (배포 10건 포함)
- GitHub Vercel 앱의 저장소 접근 목록에서 실험 저장소 제거 (저장소를 지우면 자동으로 빠진다 [미검증])
