import { formatRatio, MIN_RATIO_SAMPLE, type Ratio } from "@/lib/domain/analytics";

/**
 * 도넛 하나. `.ring`의 `--p`(각도)만 채우고 나머지는 admin.css가 그린다.
 *
 * ⚠️ **모수가 작으면 링을 채우지 않는다.** 1/1을 꽉 찬 100% 링으로 그리면 숫자는
 * 정직해도 그림이 거짓 인상을 준다. 리텐션·열람권이 같은 규칙을 써야 해서
 * 컴포넌트로 뺐다(2026-08-17) — 한쪽만 고치면 같은 화면에서 기준이 갈린다.
 */
export function Ring({ label, r }: { label: string; r: Ratio }) {
  const showRing = r.denominator >= MIN_RATIO_SAMPLE;
  const deg = showRing ? (r.numerator / r.denominator) * 360 : 0;

  return (
    <div className="ring" style={{ ["--p" as string]: `${deg}deg` }}>
      <div>
        <b style={{ fontSize: 12 }}>{formatRatio(r)}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}
