/**
 * 인증사진 브라우저 압축 (§11).
 * 긴 변 1280px 이하 JPEG로 변환해 비공개 업로드한다 — 서버 처리 없음.
 */

export const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

export async function compressImage(
  file: File,
  maxDimension = MAX_IMAGE_DIMENSION,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("image_encode_failed");
    return blob;
  } finally {
    bitmap.close();
  }
}
