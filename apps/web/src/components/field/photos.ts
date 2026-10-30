// Photos are shrunk on the device before they are queued (docs/stack.md,
// "Photos"): a phone photo of 4–8 MB becomes ~200–400 KB, which matters on
// slow, expensive mobile data. EXIF orientation is applied; other metadata,
// including the camera's own GPS tag, is dropped with the re-encode.

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export type PreparedPhoto = {
  id: string;
  blob: Blob;
  contentType: "image/jpeg";
  width: number;
  height: number;
  takenAt: string;
  /** Object URL for the preview; revoke when the photo is removed. */
  preview: string;
};

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device can't process photos.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't read this photo."))),
      "image/jpeg",
      QUALITY,
    ),
  );
  return {
    id: crypto.randomUUID(),
    blob,
    contentType: "image/jpeg",
    width,
    height,
    takenAt: new Date(file.lastModified || Date.now()).toISOString(),
    preview: URL.createObjectURL(blob),
  };
}
