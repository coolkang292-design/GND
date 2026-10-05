"use client";
import { createContext } from "react";
export const LocalTrialFailureContext = createContext(false);
/** Local trial only. Never enabled in production, even with the opt-in flag. */
const TRIAL_IDS: Record<string, string> = {
  "체스트프레스 머신": "486fa05a-f354-45c9-a3c9-934b38f91f9c",
  "덤벨 레터럴 레이즈": "e1c75ef2-12bb-4fce-8435-e617618f1d37",
  "바벨 로우": "d0862f4a-f9f1-4411-ad3c-15e904085afc",
  "사이클": "84acc89a-ee72-40a8-8d64-93fcc410904b",
};

export function localTrialImage(name: string, broken = false): string | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA !== "1") return;
  const id = TRIAL_IDS[name];
  if (!id) return;
  // Failure injection is confined to the local QA page and four trial assets.
  return `/exercise-image-local-trial/${broken ? "missing-" : ""}${id}.png`;
}
