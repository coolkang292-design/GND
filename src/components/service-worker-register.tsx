"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseSwNavigateMessage } from "@/lib/domain/sw-navigate";

export function ServiceWorkerRegister() {
  const router = useRouter();

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("서비스워커 등록 실패:", err);
      });
    }
  }, []);

  // 알림 클릭 때 서비스워커가 `client.navigate()`로 못 옮긴 경우의 대체 경로.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const url = parseSwNavigateMessage(e.data);
      if (url) router.push(url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
