import { metricHelpFor, type MetricHelpKey } from "@/lib/domain/metric-help";

/**
 * `**강조**`를 `<b>`로 바꾼다.
 *
 * ⚠️ 설명 글을 그냥 넣었더니 화면에 별표가 그대로 찍혔다(2026-08-17 개발 서버에서
 * 확인). 마크다운 파서를 넣을 일은 아니고, `dangerouslySetInnerHTML`은 더더욱
 * 아니다 — 홀수 번째 조각만 굵게 하면 끝난다. 문자열은 우리가 쓴 정적 상수뿐이고
 * React가 알아서 이스케이프하므로 주입 위험도 없다.
 */
function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/**
 * 패널 아래에 붙는 "이 지표 어떻게 측정하나요?" 접이식 설명 (2026-08-17 사용자 지시).
 *
 * ⚠️ **자바스크립트를 쓰지 않는다.** `<details>`/`<summary>`는 브라우저가 직접 접고
 * 펴고 키보드로도 열린다. `/admin`은 전부 서버 컴포넌트라, 여기서 상태를 쓰려면
 * 이 패널만 클라이언트 컴포넌트가 돼야 한다 — 설명 글 하나 때문에 그럴 이유가 없다.
 *
 * 바깥 접기 안에 지표별 접기를 둔다. 바깥이 없으면 패널마다 설명 목록이 길게
 * 붙어 대시보드를 읽기 어려워지고, 안쪽이 없으면 "각 지표를 눌러 본다"가 안 된다.
 */
export function MetricHelp({ keys }: { keys: readonly MetricHelpKey[] }) {
  const items = metricHelpFor(keys);
  if (items.length === 0) return null;

  return (
    <details className="metric-help">
      <summary>이 패널의 지표는 어떻게 측정하나요? ({items.length}개)</summary>
      <div className="metric-help-body">
        {items.map((m) => (
          <details className="metric-item" key={m.key}>
            <summary>{m.label}</summary>
            <p>
              <b>뜻</b>
              <span>
                <Emphasized text={m.meaning} />
              </span>
            </p>
            <p>
              <b>계산</b>
              <span>
                <Emphasized text={m.howMeasured} />
              </span>
            </p>
            {m.caveat ? (
              <p className="metric-caveat">
                <b>주의</b>
                <span>
                  <Emphasized text={m.caveat} />
                </span>
              </p>
            ) : null}
          </details>
        ))}
      </div>
    </details>
  );
}
