import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 500;
const MOVE_SLOP_PX = 10;

/**
 * 약 0.5초 길게 누르면 onTrigger를 1회 호출한다.
 * 10px 이상 움직이면(스크롤 의도) 취소, 조기 해제·이탈·취소 시에도 취소.
 * 반환된 핸들러들을 대상 요소에 그대로 펼쳐 단다.
 */
export function useLongPress(onTrigger: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const onTriggerRef = useRef(onTrigger);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      cancel();
      originRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        originRef.current = null;
        onTriggerRef.current();
      }, HOLD_MS);
    },
    [cancel],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) cancel();
    },
    [cancel],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}
