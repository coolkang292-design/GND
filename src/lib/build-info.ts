/**
 * 이 번들이 언제 빌드됐는가. 신고에 함께 실려 **폰이 어느 배포본을 돌고 있었는지**를
 * 알려준다.
 *
 * 왜 커밋 해시가 아닌가: 이 프로젝트는 `.git` 없는 임시 복사본에서 `vercel --prod`를
 * 실행한다(Vercel이 커밋 이메일을 계정에 매칭 못 해 Blocked되는 것을 피하려고).
 * 그래서 배포 시점에 git 정보가 아예 없다. 빌드 시각은 항상 있다.
 *
 * 왜 필요한가: 2026-07-29~30에 `git push`만 하고 배포를 안 해 **이틀간 사용자 폰에
 * 옛날 코드가 돌았다.** 서버 DB는 정상이라 원인을 찾는 데 오래 걸렸다. 신고에
 * 빌드 시각이 박혀 있으면 "이 폰은 3일 묵은 번들"이 한눈에 보인다.
 *
 * 값은 next.config.ts가 빌드 타임에 주입한다.
 */
export const BUILD_TIME: string = process.env.NEXT_PUBLIC_BUILD_TIME ?? "unknown";

/**
 * 이 번들이 어느 커밋에서 빌드됐는가 (2026-11-25).
 *
 * 위의 "커밋 해시가 아닌 이유"는 이제 풀렸다. `git archive`는 `.git`을 빼지만
 * `.gitattributes`의 export-subst로 `src/lib/build-commit.txt`의 `$Format:%H$`을
 * 실제 해시로 바꿔 넣는다. 그래서 `.git` 없는 배포 복사본에서도 해시가 남는다.
 * 순서·대체 경로는 next.config.ts의 resolveCommit().
 *
 * 왜 필요한가: 2026-11-25에 Vercel 기록의 브랜치 이름을 내용으로 오해해 "운영은 옛 코드"라고
 * 틀리게 보고했다. 운영이 `/api/version`으로 자기 커밋을 말하면 추측할 일이 없다.
 * `scripts/session-truth.mjs`가 세션 시작 때 이 값을 `origin/main`과 대조한다.
 */
export const BUILD_COMMIT: string = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
/** 해시를 어디서 얻었는가: archive · git · vercel · none */
export const BUILD_COMMIT_SOURCE: string = process.env.NEXT_PUBLIC_BUILD_COMMIT_SOURCE ?? "none";
