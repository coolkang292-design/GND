import { notFound } from "next/navigation";
import snapshot from "../../../data/exercise-image-catalog-snapshot.json";
import type { CatalogExercise } from "@/lib/types";
import { LocalImagePickerQA } from "./picker-qa";

export default async function Page({ searchParams }: { searchParams: Promise<{ broken?: string; trial?: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA !== "1") notFound();
  const params = await searchParams;
  const names = ["체스트프레스 머신", "덤벨 레터럴 레이즈", "바벨 로우", "사이클"];
  const rows = params.trial === "1" ? snapshot.rows.filter(row => names.includes(row.name)) : snapshot.rows;
  const catalog = rows.map(row => ({ ...row, created_by: null, created_at: "2026-10-05T00:00:00Z" })) as CatalogExercise[];
  return <LocalImagePickerQA catalog={catalog} broken={params.broken === "1"} />;
}
