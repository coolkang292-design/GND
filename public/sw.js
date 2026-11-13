// GND 서비스워커 — 설치 가능성(installability) + 웹 푸시 수신.
// 오프라인 캐싱 전략은 P1에서 고도화.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 네트워크 passthrough (기본 동작)
});

self.addEventListener("push", (event) => {
  let payload = { title: "GND", body: "", url: "/home" };
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      payload = {
        title: data.title || "GND",
        body: data.body || "",
        url: data.url || "/home",
      };
    }
  } catch {
    // 파싱 실패 시 기본 페이로드로 표시
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/gnd-monogram-192.png",
      badge: "/icons/gnd-monogram-badge-96.png",
      data: { url: payload.url },
    }),
  );
});

// 같은 출처 경로만 허용한다. 페이로드가 이상하면 /home.
function resolveTarget(raw) {
  try {
    const u = new URL(raw || "/home", self.location.origin);
    if (u.origin !== self.location.origin) return "/home";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/home";
  }
}

// ⚠️ 옛 구현은 `focus()`만 기다리고 `navigate()`는 결과를 안 봤다. 이미 열린 창이
//    서비스워커가 제어하지 않는 창이거나(iOS 홈 화면 앱 등) navigate가 거부되면
//    앱이 직전 화면 그대로 앞으로 올라오기만 했다. 이제 단계별로 확인한다:
//    ① focus → navigate 성공 ② 실패 시 창에 메시지를 보내 앱이 router로 이동
//    ③ 열린 창이 없으면 openWindow.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = resolveTarget(
    event.notification.data && event.notification.data.url,
  );

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          if ("focus" in client) await client.focus();
        } catch {
          // focus 거부여도 이동은 시도한다
        }
        try {
          if ("navigate" in client) {
            const navigated = await client.navigate(target);
            if (navigated) return;
          }
        } catch {
          // 아래 메시지 경로로 넘어간다
        }
        try {
          client.postMessage({ type: "gnd:navigate", url: target });
          return;
        } catch {
          // 다음 창을 시도한다
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
