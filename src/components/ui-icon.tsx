import Image from "next/image";

/**
 * `public/ui-icons/*.webp` 한 장 (2026-08-07 사용자 제공 시안).
 *
 * 문장 앞이나 버튼 안에 이모지 대신 놓는다. 같은 마크업을 20곳에 복사하면
 * 정렬(`align`)과 크기가 시간이 지나며 갈리므로 한 곳에 모은다.
 * 자산은 `scripts/slice-ui-icons.py`가 만든다.
 *
 * ⚠️ **`alt`를 언제 채우는지가 규칙의 전부다.**
 *  - 바로 옆에 같은 뜻의 글자가 있으면 `alt=""`(기본) — 안 그러면 스크린리더가
 *    "트로피 최종 순위 발표"처럼 두 번 읽는다.
 *  - 아이콘이 **값 자체**일 때는(예: 남의 진행률 자리에 놓인 자물쇠) 반드시
 *    채운다. 거기엔 대신 읽어 줄 글자가 없어서, 비우면 화면 낭독에서 그 칸이
 *    **통째로 사라진다.**
 */
export function UiIcon({
  name,
  size = 18,
  alt = "",
  className = "",
}: {
  /** `public/ui-icons/<name>.webp` */
  name: string;
  size?: number;
  /** 옆에 같은 뜻의 글자가 없을 때만 채운다 — 위 주석 참조 */
  alt?: string;
  className?: string;
}) {
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
