import Image from "next/image";

/**
 * 배지 획득 연출 자리(구조). 지금은 정적. 향후 확대·반짝임·+P·진동을
 * 여기 한 곳에서 붙인다(CSS transition/keyframe + navigator.vibrate).
 */
export function BadgeEarnAnimation({
  badgeKey,
  name,
  points,
}: {
  badgeKey: string;
  name: string;
  points: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center" data-earn-anim>
      <Image src={`/badges/${badgeKey}.png`} alt="" width={96} height={96} sizes="96px" />
      <p className="text-base font-extrabold">{name}</p>
      <p className="text-sm font-extrabold text-accent">+{points} P</p>
    </div>
  );
}
