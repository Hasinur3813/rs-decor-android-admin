export function slugify(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "heic", "heif", "jfif", "bmp", "tif", "tiff", "svg", "ico"];

export function fileExt(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

/**
 * True for anything we should let through to the queue.
 * Admins upload from phones, cameras and scanners with unpredictable MIME
 * types (notably empty ones), so we only reject files that are DEFINITELY
 * not photos (video/audio/documents). Anything uncertain goes through —
 * Cloudinary performs the final content validation at upload time with a
 * clear error, which beats a confusing "no images found" at selection time.
 */
export function isImageFile(f: File): boolean {
  const type = (f.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = f.name || "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return true; // extensionless (some phone transfers strip it) — server decides
  const ext = name.slice(dot + 1).toLowerCase();
  // Declared non-image type OR unknown type: trust only photo extensions.
  return IMAGE_EXTS.includes(ext);
}

/** Accept attribute covering real image types + extension fallbacks. */
export const IMAGE_ACCEPT = "image/*,.heic,.heif";

export function slugifyAscii(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const ROOM_DEFAULTS = [
  { slug: "all", name: "সব রুম", nameEn: "All Rooms" },
  { slug: "bedroom", name: "বেডরুম", nameEn: "Bedroom" },
  { slug: "living_room", name: "লিভিং রুম", nameEn: "Living Room" },
  { slug: "kids_room", name: "কিডস রুম", nameEn: "Kids Room" },
  { slug: "office", name: "অফিস", nameEn: "Office" },
  { slug: "kitchen", name: "কিচেন", nameEn: "Kitchen" },
  { slug: "dining_room", name: "ডাইনিং রুম", nameEn: "Dining Room" }
];
