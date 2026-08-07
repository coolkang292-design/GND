import type { ReactNode } from "react";

export const ALL_GOLD_ICON_NAMES = [
  "target",
  "body",
  "search",
  "history",
  "routine",
  "flame",
  "beginner",
  "help",
  "home",
  "clock",
  "heart",
] as const;

export type GoldIconName = (typeof ALL_GOLD_ICON_NAMES)[number];

const PATHS: Record<GoldIconName, ReactNode> = {
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="m14 10 6-6m0 0v4m0-4h-4" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M8 9c1.5-1 2.5-1.5 4-1.5S14.5 8 16 9M9 9l-2 5m8-5 2 5m-7-2v7m4-7v7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 5 5" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" />
      <path d="M4 4v4.5h4.5M12 8v4l3 2" />
    </>
  ),
  routine: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  flame: (
    <path d="M13 3c1 4-2 5-1 8 1.5-1 2-2 2-4 3 2 5 5 4 8a6 6 0 0 1-12 0c0-3 2-5 5-8 0 2 .5 3 2 4" />
  ),
  beginner: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M6 10c2-1.5 4-2 6-2s4 .5 6 2M8 11l-2 5m10-5 2 5m-6-7v10m-4 2 4-2 4 2" />
    </>
  ),
  help: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17h.01" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M10 20v-6h4v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  heart: (
    <path d="M20 8c0 5-8 11-8 11S4 13 4 8a4 4 0 0 1 7-2.6L12 6.5l1-1.1A4 4 0 0 1 20 8Z" />
  ),
};

export function GoldLineIcon({
  name,
  className = "h-6 w-6",
}: {
  name: GoldIconName;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex text-accent ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[name]}
      </svg>
    </span>
  );
}
