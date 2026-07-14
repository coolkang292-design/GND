// GND 최소 서비스워커 — 설치 가능성(installability) 확보용.
// 오프라인 캐싱 전략은 P1(웹푸시와 함께)에서 고도화.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 네트워크 passthrough (기본 동작)
});
