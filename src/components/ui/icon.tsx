/**
 * GND 기능 아이콘 — Performance Social 디자인 시스템 (2026-10-05).
 *
 * 24×24 viewBox · 1.8px 둥근 윤곽선 · 단색. **색은 CSS(currentColor)가 정한다** —
 * 활성/비활성을 그림 두 벌로 갈라 두지 않는다. 부모의 `text-accent`·`text-muted`가
 * 그대로 아이콘 색이 된다.
 *
 * 경로는 `어플 UI 이미지/Performance-Social-2026-10-05/icons/*-neutral.svg`(Codex 제작)에서
 * 그대로 옮겼다. 예외:
 *  - `heart`·`eye`는 원본 경로가 viewBox 밖으로 나가(x=-2) 작은 크기에서 잘려 보여 다시 그렸다
 *  - 아래 `EXTRA`는 패키지에 없어 새로 그린 것이다 (사용자 결정 2026-10-05: 부족 자산은 SVG로 직접 제작)
 *
 * ⚠️ 비트맵(PNG/WebP)을 기능 아이콘으로 쓰지 않는다(기획안 17-A). 감정 엠블럼(불꽃·왕관·월계수)은
 *    `public/gnd/decorations`의 입체 그림이 따로 있다 — 그건 장식이지 기능 아이콘이 아니다.
 */
const PACKAGE = {
  award: "M17 8A5 5 0 1 1 7 8A5 5 0 1 1 17 8 M8 12L5 22L12 18L19 22L16 12",
  back: "M15 4L7 12L15 20",
  bell: "M5 17H19L17 14V9Q17 4 12 4Q7 4 7 9V14Z M10 20Q12 22 14 20 M12 2V4",
  body: "M15 4A3 3 0 1 1 9 4A3 3 0 1 1 15 4 M5 11L9 8H15L19 11 M9 8V16L7 22 M15 8V16L17 22",
  book: "M12 6Q6 2 3 4V20Q7 18 12 22Q17 18 21 20V4Q18 2 12 6Z M12 6V22",
  bookmark: "M6 3H18V22L12 17L6 22Z",
  calendar: "M3 5H21V21H3Z M7 2V8 M17 2V8 M3 10H21 M7 14H10 M14 14H17",
  camera: "M3 7H7L9 4H15L17 7H21V20H3Z M16 13A4 4 0 1 1 8 13A4 4 0 1 1 16 13",
  check: "M5 12L10 17L20 6",
  chevron: "M9 5L16 12L9 19",
  clock: "M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12 M12 6V12L16 14",
  close: "M5 5L19 19 M19 5L5 19",
  comment: "M21 11Q21 3 12 3Q3 3 3 11Q3 17 8 18L5 22L12 19Q21 19 21 11Z",
  crown: "M3 6L7 10L12 3L17 10L21 6L19 19H5Z M6 22H18",
  dumbbell: "M3 9V15 M6 6V18 M18 6V18 M21 9V15 M6 12H18",
  eye: "M2 12Q7 5 12 5T22 12Q17 19 12 19T2 12Z M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12",
  feed: "M5 3H19V21H5Z M8 7H16 M8 11H16 M8 15H14",
  flag: "M5 22V3 M5 3H13L16 6H21V16H13L10 13H5",
  flame: "M12 2C14 8 20 8 20 14A8 8 0 0 1 4 14Q4 9 8 6L9 12Q14 10 12 2Z",
  handshake: "M2 8L7 4L12 7L17 4L22 8L18 17L15 20L5 16Z M7 11L12 7L17 12 M10 14L15 18",
  heart: "M12 20S3 14.5 3 8.8A4.6 4.6 0 0 1 12 6.6A4.6 4.6 0 0 1 21 8.8C21 14.5 12 20 12 20Z",
  home: "M3 10 12 3 21 10V21H15V14H9V21H3Z",
  interval: "M12 3A9 9 0 1 1 3 12 M12 7V12L16 15 M3 3V9H9",
  lock: "M7 10V7A5 5 0 0 1 17 7V10 M5 10H19V21H5Z M12 14V17",
  minus: "M5 12H19",
  pause: "M8 4V20 M16 4V20",
  person: "M16 7A4 4 0 1 1 8 7A4 4 0 1 1 16 7 M4 21V19Q4 13 12 13Q20 13 20 19V21Z",
  play: "M7 4L20 12L7 20Z",
  plus: "M12 5V19 M5 12H19",
  record: "M5 20V13 M12 20V4 M19 20V9",
  repeat: "M3 8H18L15 4 M21 16H6L9 20 M18 8L21 11 M6 16L3 13",
  search: "M17 10A7 7 0 1 1 3 10A7 7 0 1 1 17 10 M15 15L21 21",
  settings: "M4 6H20 M4 12H20 M4 18H20 M8 4V8 M16 10V14 M10 16V20",
  shield: "M12 2L21 6V12Q21 19 12 23Q3 19 3 12V6Z M7 12L11 16L17 8",
  shoe: "M5 4L10 5L12 13L21 17V21H3V13L5 4Z M12 13L8 14 M14 15L10 16",
  spark: "M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z",
  target: "M20 12A8 8 0 1 1 12 4 M16 12A4 4 0 1 1 12 8 M12 12L21 3 M16 3H21V8",
  thumbsup: "M8 21H3V11H8 M8 11L12 2Q16 2 14 10H21L19 21H8Z",
  trash: "M4 6H20 M9 6V3H15V6 M6 6L7 21H17L18 6 M10 10V17 M14 10V17",
  trophy: "M8 3H16V9Q16 14 12 14Q8 14 8 9Z M8 5H4V8Q4 11 8 11 M16 5H20V8Q20 11 16 11 M12 14V19 M8 21H16",
  users: "M13 7A3 3 0 1 1 7 7A3 3 0 1 1 13 7 M2 21V19Q2 13 10 13Q18 13 18 19V21Z M17 4Q22 6 18 10 M20 14Q23 16 22 21",
  volume: "M4 8V16 M7 5H12V19H7Z M17 8A4 4 0 1 1 17 16A4 4 0 1 1 17 8 M16 11H18V13H16Z",
  warning: "M12 2L23 22H1Z M12 8V14 M12 18V19",
} as const;

const EXTRA = {
  /** 스톱워치 — 휴식·세트 타이머 */
  timer: "M19 13A7 7 0 1 1 5 13A7 7 0 1 1 19 13 M12 13V9.5 M10 2H14 M12 2V6 M18 6L19.5 4.5",
  /** 겹친 원판 — 세트 수 */
  sets: "M4 8L12 4L20 8L12 12Z M4 12L12 16L20 12 M4 16L12 20L20 16",
  /** 위로 두 겹 화살 — 레벨·XP */
  level: "M6 12L12 6L18 12 M6 18L12 12L18 18",
  /** 시상대 — 순위 */
  ranking: "M9 21V9H15V21 M3 21V13H9 M15 21V15H21V21 M2 21H22",
  /** 기록 갱신(PR) — 바벨 위 상승 화살 */
  pr: "M12 14V3 M8 7L12 3L16 7 M3 17V21 M6 15.5V22.5 M18 15.5V22.5 M21 17V21 M6 19H18",
  /** 완료 — 원 안의 체크 */
  success: "M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12 M8 12.5L11 15.5L16.5 9",
  /** 오른쪽 화살표 — 시작·로그인 버튼 끝 (브랜드 진입 시안, 2026-10-06) */
  arrow: "M4 12H20 M14 6L20 12L14 18",
  /** 봉투 — 이메일 칸 */
  mail: "M3 6H21V18H3Z M3.5 6.5L12 13L20.5 6.5",
  /** 가린 눈 — 비밀번호 숨기기 */
  hide: "M2 12Q7 5 12 5T22 12Q17 19 12 19T2 12Z M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12 M4 4L20 20",
} as const;

const PATHS = { ...PACKAGE, ...EXTRA };

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  filled = false,
  label,
  className = "",
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** 닫힌 도형(하트 등)을 채운다 — 눌린 상태 표시용 */
  filled?: boolean;
  /**
   * 아이콘이 **값 자체**일 때만 채운다. 옆에 같은 뜻의 글자가 있으면 비워 둔다 —
   * 안 그러면 스크린리더가 두 번 읽는다(`UiIcon`과 같은 규칙).
   */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-icon={name}
      className={`inline-block flex-none ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
