/**
 * 운동 완료 고무도장 (달력 셀·범례 공용).
 *
 * 깔끔한 SVG 배지가 아니라 "종이에 찍은 도장" 느낌을 낸다 — 테두리·글자에
 * feTurbulence로 잉크가 빠진 자리를 낸다. 색은 테마 토큰(`--accent`)만 쓴다.
 *
 * 회전각은 날짜 키로 정해진다(렌더마다 바뀌지 않는다 — Math.random 금지).
 */
const ANGLES = [-5, 3, -2, 5, -3, 4, -4, 2];

/** "YYYY-MM-DD" → 항상 같은 회전각 */
export function stampRotation(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ANGLES[h % ANGLES.length];
}

export function WorkoutCompleteStamp({
  seed,
  className = "",
}: {
  /** 회전각을 정하는 값 (날짜 키). 범례는 고정 문자열을 넘긴다 */
  seed: string;
  className?: string;
}) {
  const rotate = stampRotation(seed);
  // 같은 화면에 도장이 여러 개여도 필터 id가 겹치지 않게 (겹쳐도 동일 정의라 무해하지만 안전하게)
  const filterId = `gnd-ink-${seed.replace(/[^0-9a-z]/gi, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none text-accent ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, opacity: 0.92 }}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed={Math.abs(rotate) + 1}
            result="noise"
          />
          {/* 노이즈가 높은 자리만 잉크가 빠진다 */}
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.9"
            result="mask"
          />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
      <g
        filter={`url(#${filterId})`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="50" cy="50" r="45" strokeWidth="5" />
        <circle cx="50" cy="50" r="37" strokeWidth="1.6" />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize="17"
          fontWeight="900"
          letterSpacing="0.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          WORKOUT
        </text>
        <path d="M33 62 L45 73 L68 52" strokeWidth="6.5" />
      </g>
    </svg>
  );
}
