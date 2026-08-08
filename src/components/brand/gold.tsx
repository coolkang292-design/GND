/**
 * 첫 화면(온보딩·로그인)의 금색 조각들.
 *
 * ⚠️ 이 화면들의 금색은 앱 공용 `--accent`(#e8b84b)가 **아니다.**
 *
 * 2026-08-08 사용자 지적: *"글자색도 너무 노란색이 아니라 고급진 골드색이잖아.
 * 뭔가 초기 화면에 뭔가 고급지고 신비로운 느낌이 나야 함."* 그래서 시안 원본
 * (`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)에서 **화소를 직접
 * 떠서** 맞췄다. 눈으로 고른 값이 아니다.
 *
 * | 자리 | 시안 실측 | 공용 accent |
 * |---|---|---|
 * | 글자 | `#d8ab74` | `#e8b84b` (더 노랗다) |
 * | CTA | `#c9965b`→`#7a5329` 앤티크 골드 | 밝은 노랑 |
 *
 * ⚠️ 공용 `--accent`를 이 값으로 바꾸지 마라. 앱 전체(버튼·배지·차트)가 그걸
 * 쓰고 있어서 이 화면 하나 때문에 나머지가 전부 어두워진다.
 */
export const GOLD_TEXT = "#d8ab74";

/** 금색 작은 글줄. `big`이면 첫 화면의 주 문구 크기가 된다. */
export function GoldLine({
  children,
  big,
}: {
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <p
      className={
        big ? "mt-4 text-[19px] leading-[1.45] font-bold" : "mt-3 text-[12.5px]"
      }
      style={{ color: GOLD_TEXT }}
    >
      {children}
    </p>
  );
}

/**
 * 시안의 금색 CTA — 오른쪽에 원형 화살표가 붙는다.
 *
 * 세로 그라데이션만으로는 평평해 보여서 좌우 가장자리를 어둡게 하는 층을 겹친다.
 * 시안 버튼이 가운데가 밝고 가장자리가 어두운 금속이라서다.
 */
export function GoldCta({
  children,
  onClick,
  type = "button",
  busy,
  variant = "solid",
  flush,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  busy?: boolean;
  variant?: "solid" | "outline";
  flush?: boolean;
}) {
  const solidStyle: React.CSSProperties = {
    backgroundImage:
      "linear-gradient(90deg, rgba(0,0,0,0.28), transparent 22%, transparent 78%, rgba(0,0,0,0.28))," +
      "linear-gradient(180deg, #d0a066 0%, #c08a4d 45%, #7a5329 100%)",
    color: "#241703",
    borderColor: "#e0bb85",
  };
  const outlineStyle: React.CSSProperties = {
    color: GOLD_TEXT,
    borderColor: "rgba(201,150,91,0.55)",
    backgroundColor: "rgba(201,150,91,0.06)",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      style={variant === "solid" ? solidStyle : outlineStyle}
      className={`relative h-[54px] w-full rounded-full border text-[16px] font-extrabold disabled:opacity-60 ${
        flush ? "" : "mt-5"
      }`}
    >
      {busy ? "처리 중…" : children}
      <span
        aria-hidden
        className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[17px]"
        style={{
          backgroundColor:
            variant === "solid" ? "rgba(0,0,0,0.18)" : "rgba(201,150,91,0.12)",
        }}
      >
        →
      </span>
    </button>
  );
}
