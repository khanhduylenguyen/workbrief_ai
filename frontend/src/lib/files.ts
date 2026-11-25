import type { FilePayload } from "./types";

/**
 * Vercel rejects request bodies over 4.5 MB and base64 adds ~33%, so files sent to the API
 * must stay under ~3 MB after processing. Images are downscaled in the browser first.
 */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;

export const ACCEPT_TASK_FILES = "image/png,image/jpeg,image/webp,application/pdf,audio/*,.m4a,.mp3,.wav,.ogg,.webm";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được file"));
    reader.readAsDataURL(blob);
  });
}

/** Re-encode an image as JPEG with the longest side ≤ MAX_IMAGE_SIDE. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // e.g. HEIC on browsers that can't decode it — send as is
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm", pdf: "application/pdf" };
  return (ext && map[ext]) || "application/octet-stream";
}

/** Prepare a File / recorded Blob for the API. Throws with a Vietnamese message if it is too large. */
export async function toFilePayload(file: File | Blob, filename?: string): Promise<FilePayload> {
  const name = filename ?? (file instanceof File ? file.name : undefined);
  let blob: Blob = file;
  let mimeType = file instanceof File ? guessMime(file) : file.type || "application/octet-stream";
  if (mimeType.startsWith("image/") && file instanceof File) {
    blob = await shrinkImage(file);
    if (blob !== file) mimeType = "image/jpeg";
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    const mb = (blob.size / 1024 / 1024).toFixed(1);
    throw new Error(
      mimeType.startsWith("audio/")
        ? `File ghi âm ${mb} MB vượt giới hạn 3 MB (~12 phút). Hãy cắt ngắn hoặc chia thành nhiều đoạn.`
        : `File ${mb} MB vượt giới hạn 3 MB.`,
    );
  }
  return { mimeType: mimeType.split(";")[0]!, data: await blobToBase64(blob), filename: name };
}

export function fileKindLabel(mime: string): string {
  if (mime.startsWith("image/")) return "ảnh";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("audio/")) return "ghi âm";
  return "file";
}
