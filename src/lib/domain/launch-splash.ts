export const LAUNCH_SPLASH_STORAGE_KEY = "gnd:launch-splash:shown";

export type LaunchSplashStorage = Pick<Storage, "getItem" | "setItem">;

export function createLaunchSplashGate() {
  let claimedInMemory = false;

  return {
    claim(storage: LaunchSplashStorage | null): boolean {
      if (claimedInMemory) return false;

      if (storage) {
        try {
          if (storage.getItem(LAUNCH_SPLASH_STORAGE_KEY) === "1") {
            return false;
          }
          storage.setItem(LAUNCH_SPLASH_STORAGE_KEY, "1");
        } catch {
          // 저장소가 차단돼도 현재 자바스크립트 실행에서는 메모리로 중복을 막는다.
        }
      }

      claimedInMemory = true;
      return true;
    },
  };
}

export const launchSplashGate = createLaunchSplashGate();
