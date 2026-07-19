import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type PushStatus =
  | "unsupported"
  | "denied"
  | "subscribed"
  | "not-subscribed";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  try {
    if (!isPushSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "subscribed" : "not-subscribed";
  } catch {
    return "unsupported";
  }
}

/**
 * 사용자 버튼 제스처 안에서만 호출할 것 (iOS 권한 팝업 요건).
 * 성공 시 구독을 push_subscriptions에 저장하고 최종 상태를 반환한다.
 */
export async function enablePush(): Promise<PushStatus> {
  try {
    if (!isPushSupported()) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "not-subscribed";

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return "unsupported";

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return "not-subscribed";
    }

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) return "not-subscribed";

    return "subscribed";
  } catch {
    return "not-subscribed";
  }
}

export async function disablePush(): Promise<PushStatus> {
  try {
    if (!isPushSupported()) return "unsupported";

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return "not-subscribed";

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const supabase = getSupabaseBrowserClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    return "not-subscribed";
  } catch {
    return "not-subscribed";
  }
}
