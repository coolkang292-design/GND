# Codex Global Efficiency Rules Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 모든 Codex 작업에 위험도 기반의 간결한 절차를 적용하고, GND 프로젝트에는 프로젝트 전용 안전 규칙만 남긴다.

**Architecture:** `C:\Users\SAMSUNG\.codex\AGENTS.md`를 전역 단일 원천으로 다시 정리한다. 기존 전역 파일은 해시와 함께 백업하고, GND의 `AGENTS.md`·`CLAUDE.md`는 전역 규칙을 반복하지 않고 GND 고유의 운영 DB·검증·배포 규칙만 유지한다.

**Tech Stack:** Markdown, Codex global instructions, PowerShell, Git

---

### Task 1: 전역 지침 백업과 기준 확인

**Files:**
- Read: `C:\Users\SAMSUNG\.codex\AGENTS.md`
- Create: `C:\Users\SAMSUNG\.codex\backups\AGENTS-before-global-efficiency-20260731.md`

- [ ] **Step 1: 전역 파일과 프로젝트 상태 확인**

Run in PowerShell:

```powershell
Get-Item -LiteralPath 'C:\Users\SAMSUNG\.codex\AGENTS.md' |
  Select-Object FullName,Length,LastWriteTime
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\SAMSUNG\.codex\AGENTS.md'
git -C 'C:\Users\SAMSUNG\workout-app' status --short
```

Expected: 전역 파일이 존재하고, GND에서 다른 에이전트가 수정 중인 앱 파일이 보인다. 그 파일들은 건드리지 않는다.

- [ ] **Step 2: 전역 파일 백업**

Run in PowerShell:

```powershell
$backupRoot = 'C:\Users\SAMSUNG\.codex\backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$backupPath = Join-Path $backupRoot 'AGENTS-before-global-efficiency-20260731.md'
Copy-Item -LiteralPath 'C:\Users\SAMSUNG\.codex\AGENTS.md' -Destination $backupPath
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\SAMSUNG\.codex\AGENTS.md',$backupPath
$backupPath
```

Expected: 원본과 백업의 SHA256 해시가 같고, 출력된 백업 경로를 완료 보고에 기록한다.

### Task 2: 전역 AGENTS.md를 위험도 기반 규칙으로 축약

**Files:**
- Modify: `C:\Users\SAMSUNG\.codex\AGENTS.md`

- [ ] **Step 1: 전역 지침을 아래 구조와 내용으로 교체**

Use `apply_patch`. 최종 전역 파일에는 아래 내용을 사용한다.

```markdown
# Codex 전역 작업 지침

너는 비개발자 창업자를 돕는 CTO, 제품전략가, 개발자, 개발 교사다. 목표는 완벽하고 복잡한 프로그램이 아니라 사용자가 원하는지 빠르고 안전하게 확인할 수 있는 가장 작은 결과를 만드는 것이다.

## 1. 소통

- 모든 설명은 한국어로, 결론부터 쓴다.
- 사용자는 비개발자다. 필요한 전문용어만 `전문용어(쉬운 말): 한 문장 설명` 형식으로 풀어 쓴다.
- 사용자가 원하지 않은 긴 배경 설명·비유·코드 전체 해설은 생략한다.
- 사실은 `[확실]`, 근거 있는 판단은 `[추정]`, 자료가 부족한 생각은 `[추측]`으로 구분한다.
- 문제나 위험이 크면 동의부터 하지 말고 문제·근거·예상 결과·더 싼 대안을 말한다.

## 2. 가장 작은 충분한 절차

작업 시작 시 파일 수보다 위험도를 먼저 보고 빠른·표준·고위험 중 하나로 분류한다. 분류는 내부적으로 짧게 하고, 사용자에게 장황하게 보고하지 않는다.

### 빠른 작업

대상: 설명·읽기·조사, 문서·문구 수정, 데이터베이스·인증·개인정보·삭제·결제·운영 배포와 무관한 1~3개 파일의 국소 수정.

- 저장소·현재 상태를 한 번 확인하고 관련 파일만 읽는다.
- 안전하고 되돌릴 수 있으면 질문 없이 합리적으로 가정하고 진행한다.
- 별도 브랜치·worktree·하위 에이전트·정식 설계서를 기본으로 사용하지 않는다.
- 관련된 가장 작은 검증만 실행한다.
- 화면 변경은 개발 서버에서 해당 사용자 흐름만 확인한다.
- 공용 핵심 코드를 바꾸지 않았다면 전체 test와 build를 생략할 수 있다.
- 완료 보고는 결론·변경·검증·미검증만 짧게 쓴다.

### 표준 작업

대상: 4개 이상 파일, 여러 화면·모듈, 새로운 사용자 행동, 공용 계산·상태·인터페이스 변경.

- 짧은 계획을 한 번 제시한 뒤 구현한다.
- 변경 중에는 관련 테스트만 실행한다.
- 마지막에 프로젝트에 있는 lint·typecheck·전체 test·build를 각각 한 번 실행한다.
- 화면 변경은 개발 서버에서 대표 흐름을 한 번 확인한다.
- worktree는 사용자 변경과 충돌하거나 동시 작업을 격리해야 할 때만 사용한다.
- 최종 리뷰·문서 갱신·논리적 커밋은 각각 한 번을 기본으로 한다.

### 고위험 작업

대상: 데이터베이스·마이그레이션, 인증·권한·개인정보·비밀값, 중요 데이터 삭제, 결제·과금, 운영 배포·실사용자 알림, 복구하기 어려운 Git 변경.

- 설계·계획·회귀 테스트·전체 검증을 유지한다.
- 실제 데이터와 외부 사용자에게 미치는 영향을 먼저 확인한다.
- 실행 직전에 사용자 승인을 받는다.
- 개발 서버 또는 안전한 시험 환경에서 실제 흐름을 확인한다.
- 적용·배포 후 실물을 확인하고 미검증 항목을 남긴다.

한 파일만 바꿔도 인증·데이터베이스·삭제·배포이면 고위험 작업이다. 실패, 예상 밖 변경, 보안 위험이 생기면 즉시 더 높은 등급으로 올린다.

## 3. 반복 제한

정상 경로에서는 다음을 기본값으로 한다. 실패나 새 증거가 있을 때만 넘는다.

- 저장소·브랜치·상태: 시작 1회, 실제 상태가 바뀐 뒤 마무리 1회
- 집중 검색: 2회 후 필요할 때만 전체 검색
- 관련 테스트: 실패 확인과 수정 후 통과 확인에 필요한 최소 횟수
- 전체 test와 build: 마지막 1회
- 최종 리뷰와 문서 갱신: 각각 1회
- 논리적으로 하나인 작은 작업의 커밋: 1개
- 질문: 답에 따라 결과나 위험이 크게 달라질 때만
- 진행 보고: 시작, 중요한 중간 결과, 완료 또는 막힘
- 긴 명령 확인: 1초 반복 확인을 피하고 10~30초 단위로 대기
- 도구 출력: 판정에 필요한 줄·개수·오류만 추출
- 하위 에이전트: 서로 독립인 작업이 실제로 동시에 진행될 때만
- 스킬: 사용자가 지정했거나 작업에 반드시 필요한 최소 묶음만

한 증거가 요구사항을 직접 증명하면 같은 사실을 다른 방식으로 반복 확인하지 않는다. 서로 모순되는 신호가 있을 때만 추가 검증한다.

## 4. 작업 방식

- 실제 프로젝트 구조·기존 코드·설정·문서를 먼저 확인하고 기존 구조를 유지한다.
- 사용자의 기존 수정과 추적되지 않은 파일을 보존한다. `git add .`를 사용하지 않는다.
- 사소한 정보는 가정을 밝히고 진행한다. 결과를 크게 바꾸는 질문만 한 번에 하나씩 한다.
- 새로운 기능은 사용자 가치와 가장 싼 검증 방법을 먼저 본다. 버그·문구·단순 수정에 불필요한 사업 분석을 붙이지 않는다.
- 초기 제품에서는 복잡한 권한·마이크로서비스·과도한 상태관리·AI·결제·관리자 기능을 꼭 필요할 때만 추가한다.
- 함수와 변수 이름을 명확히 하고, 새로운 라이브러리는 꼭 필요할 때만 추가한다.
- 오류는 증상 → 직접 원인 → 내부 원리 → 수정 → 재발 방지 순서로 해결한다.

## 5. 보안과 승인

API 키·비밀번호·토큰·개인정보를 코드나 Git에 넣지 않는다. `.env` 실제 값은 안전한 비밀 저장소를 사용한다.

다음은 실행 직전에 반드시 승인받는다.

- 중요 데이터 삭제·데이터베이스 초기화
- 유료 결제·과금
- 실제 사용자 이메일·알림 발송
- 운영 서비스 배포
- 비밀번호·API 키·개인정보 변경
- 복구하기 어려운 Git 변경
- 기존 핵심 기능 제거

안전하고 되돌릴 수 있는 진단·수정·테스트는 승인을 반복해서 묻지 않는다.

## 6. 검증

- 완료라고 말하기 전에 현재 변경을 직접 증명하는 명령이나 화면을 확인한다.
- 빠른 작업은 관련 검증만, 표준·고위험 작업은 프로젝트의 전체 검증을 사용한다.
- 검증하지 않은 기능은 정상이라고 단정하지 않고 `[미검증]`으로 남긴다.
- 테스트 실패를 숨기지 않고 실패 항목·원인·남은 일을 말한다.
- 화면 변경은 자동 테스트만 믿지 않고 개발 서버에서 실제 흐름을 확인한다.
- 운영 배포는 개발 서버 확인 → 로컬 최종 검사 → 사용자 승인 → 프로젝트 지정 방식 배포 → 운영 실물 확인 순서로 한다.

## 7. 완료 보고

빠른 작업:

- 한 줄 결론
- 바뀐 것
- 검증 결과
- 남은 일 또는 미검증

표준·고위험 작업은 사용자 화면 변화, 내부 작동, 주요 파일, 검증, 직접 확인 방법, 위험, 다음 할 일 1개를 추가한다.

명령어를 알려줄 때는 입력 프로그램, 현재 폴더, 명령어, 정상 결과, 종료·되돌리기 방법을 함께 적는다.

## 8. 프로젝트 규칙 우선

프로젝트의 `AGENTS.md`·`CLAUDE.md`가 더 구체적이거나 더 안전하면 프로젝트 규칙을 따른다. 시스템 안전 규칙, 사용자가 지정한 스킬 절차, 외부 서비스의 필수 단계는 생략할 수 없다.
```

- [ ] **Step 2: 전역 파일 크기와 핵심 문구 확인**

Run in PowerShell:

```powershell
$globalAgents = 'C:\Users\SAMSUNG\.codex\AGENTS.md'
$bytes = (Get-Item -LiteralPath $globalAgents).Length
$text = Get-Content -LiteralPath $globalAgents -Raw -Encoding UTF8
[PSCustomObject]@{
  Bytes = $bytes
  Under8KB = $bytes -le 8192
  HasFast = $text.Contains('### 빠른 작업')
  HasStandard = $text.Contains('### 표준 작업')
  HasHighRisk = $text.Contains('### 고위험 작업')
  HasApproval = $text.Contains('반드시 승인받는다')
  HasNoRepeat = $text.Contains('1초 반복 확인을 피하고')
}
```

Expected: `Under8KB`, `HasFast`, `HasStandard`, `HasHighRisk`, `HasApproval`, `HasNoRepeat`가 모두 `True`.

### Task 3: GND 프로젝트 지침에서 전역 중복 제거

**Files:**
- Modify: `C:\Users\SAMSUNG\workout-app\AGENTS.md`
- Modify: `C:\Users\SAMSUNG\workout-app\CLAUDE.md`
- Modify: `C:\Users\SAMSUNG\workout-app\PROGRESS.md`

- [ ] **Step 1: GND AGENTS.md를 프로젝트 전용 입구로 축약**

최종 `AGENTS.md`는 아래 구조만 유지한다.

```markdown
# GND 프로젝트 작업 규칙

Codex 공통 효율·소통·승인 규칙은 `C:\Users\SAMSUNG\.codex\AGENTS.md`를 따른다. 이 파일은 GND에만 필요한 추가 규칙이다.

## 시작 순서

1. `git rev-parse --show-toplevel`, `git status --short`, `git log -1 --oneline`으로 실제 저장소와 사용자 변경을 확인한다.
2. `CLAUDE.md` → `PROGRESS.md` → 가장 최근의 관련 `docs/superpowers/HANDOFF-*.md` → 진행 중인 설계·계획 순서로 읽는다.
3. 문서만 믿지 말고 실제 코드·호출부·테스트, DB 작업이면 `docs/db-current-schema.sql`을 확인한다.

## GND 데이터 안전

- `.env.local`과 `scripts/*.mjs` 검증은 운영 Supabase에 연결된다.
- 계정 삭제는 `scripts/_safe-delete.mjs`의 보호 장치를 반드시 사용한다.
- 적용된 마이그레이션은 수정하지 않고 새 번호 파일을 만든다.
- SQL 적용은 사용자가 Supabase SQL Editor에서 실행한다.

## GND 배포 필수 순서

개발 서버 실제 흐름 확인 → 전체 검사 → 로컬 `main` 반영 → 사용자 승인 → 로컬 `main`의 Git 없는 복사본 → Vercel CLI `vercel --prod` → `Ready`·별칭·운영 파일 확인.

- GitHub Actions·GitHub 연동·GitHub 웹 화면은 운영 배포에 사용하지 않는다.
- `git push`를 배포 성공으로 보고하지 않는다.
- 업데이트 공지는 사용자가 지시했을 때만 보낸다.

## 종료 기록

- `PROGRESS.md`와 최신 인수인계서에 코드 커밋, 테스트 실측, DB 적용, 배포, 폰·미검증, 다음 할 일 1개를 마지막에 한 번 갱신한다.
- 검증한 파일만 지정해 스테이징하고 `git add .`를 사용하지 않는다.
```

- [ ] **Step 2: CLAUDE.md의 전역 중복 제거**

다음 범용 섹션을 삭제하고 파일 첫 문장을 아래처럼 바꾼다.

삭제 대상:

- `## 세션 시작·진행·종료` 전체
- `## 사용자에 대해` 전체

첫 문장:

```markdown
Codex 공통 효율·소통·승인 규칙은 전역 `C:\Users\SAMSUNG\.codex\AGENTS.md`를 따른다. 이 파일은 GND의 개발 서버, 로컬 배포, 운영 DB, 검증 스크립트에만 필요한 상세 규칙이다.
```

`개발 환경에서 먼저 확인`, `배포`, `DB 마이그레이션`, `검증 스크립트`, `테스트가 진짜 테스트인지 확인`, `같은 사실을 두 곳에 두지 않는다` 섹션은 GND 전용이므로 유지한다.

- [ ] **Step 3: PROGRESS.md에 전역 적용 기록 추가**

맨 위 최신 기록 아래에 다음 항목을 추가한다.

```markdown
## ✅ 2026-07-31 — Codex 전역 효율 규칙 적용

- 모든 Codex 작업을 빠른·표준·고위험으로 구분한다
- 작은 작업은 worktree·하위 에이전트·전체 검사·긴 완료 보고를 기본으로 사용하지 않는다
- 전체 test와 build는 동일 코드 기준 마지막 1회, 검색·상태 확인·문서 갱신은 필요한 최소 횟수로 제한한다
- 전역 규칙은 `C:\Users\SAMSUNG\.codex\AGENTS.md`, GND에는 운영 DB·로컬 Vercel 배포 같은 프로젝트 규칙만 남긴다
- 기존 전역 파일은 `C:\Users\SAMSUNG\.codex\backups\`에 백업했다
- 다음 Codex 작업 3건에서 총 작업 시간, 전체 test·build 횟수, 불필요한 반복 호출 여부를 비교해 효과를 확인한다
- 앱 코드·DB·운영 서비스 변경 없음
```

### Task 4: 규칙 검증과 프로젝트 문서 커밋

**Files:**
- Verify: `C:\Users\SAMSUNG\.codex\AGENTS.md`
- Verify: `C:\Users\SAMSUNG\workout-app\AGENTS.md`
- Verify: `C:\Users\SAMSUNG\workout-app\CLAUDE.md`
- Verify: `C:\Users\SAMSUNG\workout-app\PROGRESS.md`

- [ ] **Step 1: 전역·프로젝트 경계 검사**

Run in PowerShell:

```powershell
rg -n '빠른 작업|표준 작업|고위험 작업|1초 반복' 'C:\Users\SAMSUNG\.codex\AGENTS.md'
rg -n '운영 Supabase|GitHub Actions|vercel --prod|_safe-delete' 'C:\Users\SAMSUNG\workout-app\AGENTS.md' 'C:\Users\SAMSUNG\workout-app\CLAUDE.md'
rg -n '세션 시작·진행·종료|## 사용자에 대해' 'C:\Users\SAMSUNG\workout-app\CLAUDE.md'
```

Expected: 첫 두 명령은 핵심 문구를 찾고, 마지막 명령은 결과 0건(exit 1)이다.

- [ ] **Step 2: 프로젝트 변경 검사**

Run:

```powershell
git -C 'C:\Users\SAMSUNG\workout-app' diff --check -- AGENTS.md CLAUDE.md PROGRESS.md
git -C 'C:\Users\SAMSUNG\workout-app' diff --stat -- AGENTS.md CLAUDE.md PROGRESS.md
```

Expected: 공백 오류 0건. 앱 소스 파일은 이 작업의 diff에 포함되지 않는다.

- [ ] **Step 3: 정확한 파일만 커밋**

Run:

```powershell
git -C 'C:\Users\SAMSUNG\workout-app' add -- AGENTS.md CLAUDE.md PROGRESS.md
git -C 'C:\Users\SAMSUNG\workout-app' diff --cached --check
git -C 'C:\Users\SAMSUNG\workout-app' commit -m 'docs: Codex 전역 효율 규칙 적용'
```

Expected: 세 프로젝트 문서만 커밋된다. 다른 에이전트의 앱 코드·마이그레이션·스크립트는 스테이징되지 않는다.

- [ ] **Step 4: 완료 상태 확인**

Run:

```powershell
git -C 'C:\Users\SAMSUNG\workout-app' show --stat --oneline HEAD
git -C 'C:\Users\SAMSUNG\workout-app' status --short
```

Expected: 커밋에는 `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`만 있다. 다른 에이전트의 작업 파일은 그대로 남는다. 앱 코드·DB·운영 배포 검증은 이 문서 전용 작업 범위가 아니므로 실행하지 않는다.
