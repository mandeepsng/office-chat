import { config } from "./config";
import { auth } from "./stores/auth.svelte";

/** Longest edge we keep; larger pastes (screenshots) are downscaled first. */
const MAX_DIMENSION = 1280;
/** Skip re-encoding images already smaller than this. */
const SKIP_RESIZE_BYTES = 512 * 1024;

/**
 * Downscale/re-encode a pasted image to keep uploads small and fast. GIFs pass
 * through untouched so animation is preserved.
 */
async function prepare(blob: Blob): Promise<Blob> {
  if (blob.type === "image/gif") return blob;

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.size < SKIP_RESIZE_BYTES) {
    bitmap.close();
    return blob;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.85,
    );
  });
}

/**
 * Upload an image blob to the server and return the absolute URL to embed in an
 * image message. Auth is the caller's registered user id (matches the app's
 * lightweight office-code security model).
 */
export async function uploadImage(blob: Blob): Promise<string> {
  const prepared = await prepare(blob);
  const userId = auth.identity?.userId;
  if (!userId) throw new Error("Not authenticated");

  const res = await fetch(`${config.httpUrl}/upload`, {
    method: "POST",
    headers: { "content-type": prepared.type, "x-user-id": userId },
    body: prepared,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);

  const { url } = (await res.json()) as { url: string };
  return `${config.httpUrl}${url}`;
}

/**
 * Upload a recorded voice clip and return the absolute URL to embed in a
 * voice message. No re-encoding — sent as recorded by MediaRecorder.
 */
export async function uploadVoice(blob: Blob): Promise<string> {
  const userId = auth.identity?.userId;
  if (!userId) throw new Error("Not authenticated");

  const res = await fetch(`${config.httpUrl}/upload`, {
    method: "POST",
    headers: { "content-type": blob.type, "x-user-id": userId },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);

  const { url } = (await res.json()) as { url: string };
  return `${config.httpUrl}${url}`;
}
