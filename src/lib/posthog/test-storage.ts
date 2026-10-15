/**
 * 테스트 전용 메모리 Storage.
 *
 * Node 26에서는 내장 `localStorage` getter가 jsdom의 것을 가려 `window.localStorage`가
 * undefined가 된다(`--localstorage-file` 경고). 이 저장소는 그 영향을 받지 않도록
 * 테스트가 직접 Storage를 꽂는다. 운영 코드에서는 쓰지 않는다.
 */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  [name: string]: unknown;
}

export function installMemoryStorage(): { local: MemoryStorage; session: MemoryStorage } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  for (const target of [window, globalThis] as object[]) {
    Object.defineProperty(target, "localStorage", { value: local, configurable: true, writable: true });
    Object.defineProperty(target, "sessionStorage", { value: session, configurable: true, writable: true });
  }
  return { local, session };
}
