import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GND — 친구 운동 챌린지",
    short_name: "GND",
    description: "소규모 크루의 운동 출석 챌린지. 오늘도 GND 탈출하자.",
    id: "/",
    start_url: "/home",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F8F7",
    theme_color: "#0D9488",
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
