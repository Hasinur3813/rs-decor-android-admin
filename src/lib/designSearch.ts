const MIN_PREFIX_LENGTH = 2;
const MAX_TOKENS = 512;

export function buildDesignSearchTokens(...values: unknown[]): string[] {
  const words = values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^A-Za-z0-9\u0980-\u09FF]+/)
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const word of words) {
    for (let length = MIN_PREFIX_LENGTH; length <= word.length; length++) {
      tokens.add(word.slice(0, length));
      if (tokens.size >= MAX_TOKENS) return Array.from(tokens);
    }
  }
  return Array.from(tokens);
}
