import { describe, expect, it, vi } from "vitest";
import {
  LAUNCH_SPLASH_STORAGE_KEY,
  createLaunchSplashGate,
  type LaunchSplashStorage,
} from "./launch-splash";

function memoryStorage(initial?: Record<string, string>): LaunchSplashStorage {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("launch splash session gate", () => {
  it("새 실행 세션을 한 번만 claim하고 세션 키를 기록한다", () => {
    const storage = memoryStorage();
    const gate = createLaunchSplashGate();

    expect(gate.claim(storage)).toBe(true);
    expect(gate.claim(storage)).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      LAUNCH_SPLASH_STORAGE_KEY,
      "1",
    );
  });

  it("다른 컴포넌트 인스턴스여도 같은 세션 키가 있으면 건너뛴다", () => {
    const storage = memoryStorage({ [LAUNCH_SPLASH_STORAGE_KEY]: "1" });

    expect(createLaunchSplashGate().claim(storage)).toBe(false);
  });

  it("세션 키가 사라진 새 실행에서는 다시 표시한다", () => {
    const firstSession = memoryStorage();
    const secondSession = memoryStorage();

    expect(createLaunchSplashGate().claim(firstSession)).toBe(true);
    expect(createLaunchSplashGate().claim(secondSession)).toBe(true);
  });

  it("저장소가 예외를 내도 현재 실행의 메모리 플래그로 한 번만 표시한다", () => {
    const brokenStorage: LaunchSplashStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(),
    };
    const gate = createLaunchSplashGate();

    expect(gate.claim(brokenStorage)).toBe(true);
    expect(gate.claim(brokenStorage)).toBe(false);
  });

  it("저장소 자체를 얻지 못해도 현재 실행에서는 한 번만 표시한다", () => {
    const gate = createLaunchSplashGate();

    expect(gate.claim(null)).toBe(true);
    expect(gate.claim(null)).toBe(false);
  });
});
