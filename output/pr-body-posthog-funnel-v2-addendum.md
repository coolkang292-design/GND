## 추가 (2026-10-12) — `d071089`

### `/`에서 `?gnd_internal=1`이 사라지던 문제 수정
- `/`는 서버 리다이렉트라 utm만 실어 보내고 내부(QA) 표시를 버렸다 → QA가 공유 링크로 들어오면 실사용자로 섞였다
- 이제 `gnd_internal`의 값 `0`·`1`만 `/record`로 실어 보낸다. 그 밖의 값과 남의 파라미터는 여전히 버린다(`src/app/page.test.tsx`)
- `/?gnd_internal=1`, `/onboarding?gnd_internal=1`, `/login?gnd_internal=1` 어느 주소든 된다
- 운영 빌드에서 확인: `/?gnd_internal=1&utm_source=ig` → `/record?utm_source=ig&gnd_internal=1`, 표시 켜짐 · `=0` 꺼짐 · `=yes` 안 넘김

### `traffic_type` 기준 — **사람 기준 신규가 아니다**
- `new` = 이 브라우저가 GND를 **처음 연 지 30분 안의 탭**(근거: localStorage `gnd-acquisition.capturedAt`, 기존 첫 접촉 기록)
- `returning` = 30분이 넘었다
- 한 번 정하면 **그 탭을 닫을 때까지 고정**(OAuth 왕복·새로고침에도 그대로). 탭을 새로 열면 다시 판정
- 동의한 뒤에만 계산하고, 철회하면 지운다. 첫 접촉 기록이 없으면 속성 없음
- 저장소를 지우거나 다른 기기·시크릿·인앱 브라우저에서 처음 열면 기존 사용자도 `new`. 사람 기준 신규의 원본은 `profiles.created_at`
- 이벤트마다 그때의 값이라, 같은 사람도 첫날은 `new`, 다음 날은 `returning`
- **퍼널에서 신규만 볼 때는 1단계(`landing_opened`)에만 `traffic_type = new`를 건다.** 전체 필터로 걸면 다음 날 완료한 사람이 빠진다
- PostHog 대시보드 설명란 문구: `docs/analytics/posthog-funnel-v2.md` §6-3

### 검증 (Node 22.23.3)
typecheck 0 · lint 0 errors(기존 경고 4) · test **4296 passed** / 1 skipped · build 성공

⚠️ Preview `https://gnd-j63bpwjgl-gnd4.vercel.app`는 `dfd635a` 기준이다. 이 수정은 아직 Preview에 없다.
