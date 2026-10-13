const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const ENCODING_TIERS = [
  { maxDimension: 2048, quality: 0.82 },
  { maxDimension: 1536, quality: 0.72 },
  { maxDimension: 1280, quality: 0.64 },
  { maxDimension: 1024, quality: 0.56 },
  { maxDimension: 768, quality: 0.48 }
];

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the image for AI analysis."));
    }, "image/jpeg", quality);
  });
}

/** Creates a compact AI-only copy; the original File remains unchanged for Cloudinary. */
export async function imagePrepForGemini(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot prepare images for AI analysis. Try a recent browser or use a JPG.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser could not read the image for AI analysis. Try saving it as JPG or PNG.");
  }

  try {
    const canvas = document.createElement("canvas");
    for (const tier of ENCODING_TIERS) {
      const scale = Math.min(1, tier.maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this image for AI analysis.");

      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      const prepared = await encodeJpeg(canvas, tier.quality);
      if (prepared.size <= MAX_OUTPUT_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "design";
        return new File([prepared], `${baseName}-ai.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified
        });
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error("The image could not be reduced enough for AI analysis. You can still upload the original.");
}
