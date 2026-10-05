import Image from "next/image";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * 문장 앞·버튼 안의 작은 아이콘.
 *
 * 2026-10-05 Performance Social — **이름이 같으면 그림이 바뀐다.** 예전엔
 * `public/ui-icons/<name>.webp`(금색 입체 비트맵, 2026-08-07 시안)를 그렸는데, 새 디자인
 * 톤(무채색 + 라임)과 맞지 않아 사용자가 화면마다 짚었다("표시된 아이콘도 톤앤매너에
 * 맞게"). 기획안 17-A가 기능 아이콘에 비트맵을 금지하므로, 대응하는 SVG가 있는 이름은
 * `Icon`(단색 윤곽선, `currentColor`)으로 그린다. 호출부 35곳을 고치지 않고 여기 한 곳에서
 * 바꾼다 — 대응표는 적용 지침 §기존 UiIcon 연결 참고를 따랐다.
 *
 * 색은 기본 **라임**(옛 금색 아이콘의 자리). 부모 글자색을 따르게 하려면
 * `className="text-current"`처럼 색 클래스를 넘긴다.
 *
 * 표에 없는 이름(`part-*`·`situ-*` 같은 부위·상황 **그림**)은 예전처럼 비트맵이다 —
 * 그건 기능 아이콘이 아니라 작은 일러스트다.
 *
 * ⚠️ **`alt`를 언제 채우는지가 규칙의 전부다.**
 *  - 바로 옆에 같은 뜻의 글자가 있으면 `alt=""`(기본) — 안 그러면 스크린리더가 두 번 읽는다.
 *  - 아이콘이 **값 자체**일 때는(예: 남의 진행률 자리에 놓인 자물쇠) 반드시 채운다.
 */
const SVG_FOR: Record<string, IconName> = {
  camera: "camera",
  lock: "lock",
  trophy: "trophy",
  crown: "crown",
  person: "person",
  trash: "trash",
  handshake: "handshake",
  thumbsup: "thumbsup",
  warning: "warning",
  goal: "target",
  finish: "flag",
  friends: "users",
  "friends-add": "users",
  "streak-on": "flame",
  "streak-off": "flame",
  "shield-check": "shield",
  "hub-search": "search",
  "hub-tabata": "interval",
  "hub-part": "body",
  "hub-routine": "book",
  "hub-past": "calendar",
  "hub-situation": "target",
};

/** 꺼진 상태를 뜻하는 이름 — 라임이 아니라 회색으로 그린다 */
const MUTED = new Set(["streak-off"]);

/** `UiIcon`이 SVG로 그리는 이름인가 (테스트·자산 점검용) */
export function uiIconIsSvg(name: string): boolean {
  return name in SVG_FOR;
}

export function UiIcon({
  name,
  size = 18,
  alt = "",
  className = "",
}: {
  /** `public/ui-icons/<name>.webp`의 이름 — 대응 SVG가 있으면 SVG로 그린다 */
  name: string;
  size?: number;
  /** 옆에 같은 뜻의 글자가 없을 때만 채운다 — 위 주석 참조 */
  alt?: string;
  className?: string;
}) {
  const svg = SVG_FOR[name];
  if (svg) {
    // 호출부가 색을 넘기지 않았으면 기본색을 준다
    const hasColor =
      /(^|\s)text-(accent|muted|faint|text|gold|good|warn|danger|white|black|current|silver|bronze|inherit)/.test(
        className,
      );
    const color = hasColor ? "" : MUTED.has(name) ? "text-faint" : "text-accent";
    return (
      <Icon
        name={svg}
        size={size}
        label={alt || undefined}
        // 글줄 안에 섞일 때 밑선이 글자와 맞도록 살짝 내린다(옛 비트맵과 같은 정렬)
        className={`align-[-0.18em] ${color} ${className}`}
      />
    );
  }
  return (
    <Image
      src={`/ui-icons/${name}.webp`}
      alt={alt}
      width={size}
      height={size}
      // 글줄 안에 섞일 때 밑선이 글자와 맞도록 살짝 내린다
      className={`inline-block flex-none align-[-0.18em] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
