// Generates ADMIN_PASSWORD_HASH for .env:  node scripts/gen-password.mjs "YourStrongPassword"
// Prints "saltHex:hashHex" (scrypt) — paste the whole line as ADMIN_PASSWORD_HASH.
import { scryptSync, randomBytes } from "crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: node scripts/gen-password.mjs "YourStrongPassword (min 12 chars)"');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`${salt.toString("hex")}:${hash.toString("hex")}`);
