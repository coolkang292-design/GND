# GND 프로젝트 작업 규칙

Codex 공통 효율·소통·승인 규칙은 `C:\Users\SAMSUNG\.codex\AGENTS.md`를 따른다. 이 파일은 GND에만 필요한 추가 규칙이다.

## 시작 순서

1. `git rev-parse --show-toplevel`, `git status --short`, `git log -1 --oneline`으로 실제 저장소와 현재 변경을 확인한다.
2. `CLAUDE.md` → `PROGRESS.md` → 최신 관련 `HANDOFF-*.md` → 진행 중인 설계·계획 문서 순서로 읽는다.
3. 문서만 믿지 말고 실제 코드·테스트·필요하면 `docs/db-current-schema.sql`을 확인한다.

## GND 데이터 안전

- `.env.local`과 `scripts/*.mjs`는 운영 Supabase에 연결된다. 테스트도 실제 데이터에 영향을 줄 수 있다.
- 테스트 계정 삭제는 반드시 `scripts/_safe-delete.mjs`의 보호 장치를 거친다.
- 이미 적용된 마이그레이션(데이터베이스 변경 기록)은 수정하지 말고 새 번호 파일을 만든다.
- SQL 적용은 사용자가 Supabase SQL Editor에서 직접 실행한다.

## GND 배포 필수 순서

1. 개발 서버에서 실제 사용자 흐름 확인
2. 관련 검사와 전체 검사 통과
3. 검증한 코드를 로컬 `main`에 반영
4. 사용자에게 운영 배포 승인 요청
5. Git 기록이 없는 로컬 `main` 복사본에서 Vercel CLI로 배포
6. Vercel `Ready`, `gnd-one.vercel.app` 연결, 주요 주소 응답, 변경 코드 포함 여부 확인

- GitHub Actions·GitHub 연동·GitHub 웹 화면으로 배포하지 않는다.
- `git push` 성공을 배포 성공으로 보고하지 않는다.
- 업데이트 공지는 사용자가 지시했을 때만 보낸다.

## 종료 기록

- 작업 마지막에만 `PROGRESS.md`와 최신 인수인계서를 한 번 갱신한다.
- 코드 커밋, 실제 검사 수치, DB 적용 여부, 배포 여부, 사용자 기기 미확인 사항, 다음 할 일 1개를 남긴다.
- 검증한 파일만 정확히 지정해 스테이징한다. `git add .`를 사용하지 않는다.
