import type { MetadataRoute } from "next";
import { APP_LANDING_PATH } from "@/lib/domain/landing";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GND — 친구 운동 챌린지",
    short_name: "GND",
    description:
      "소규모 크루의 운동 출석 챌린지. NO EXCUSES. JUST RESULTS. — 오늘도 GND 탈출하자.",
    id: "/",
    start_url: APP_LANDING_PATH,
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0C",
    theme_color: "#0B0B0C",
    lang: "ko",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
