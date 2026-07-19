/** 배열 항목을 from에서 to로 불변 이동. 무의미하거나 범위 밖이면 원본을 그대로 반환. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }

  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
