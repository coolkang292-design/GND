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
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
