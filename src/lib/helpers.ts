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
