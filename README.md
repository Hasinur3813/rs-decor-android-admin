# RS Decor Admin Panel (Next.js + Firestore + Cloudinary)

Modern control panel for the **RS Decor Android app**. Manage designs, categories,
room subcategories, contact numbers and the home hero banner — everything goes
live on the app instantly (the app observes Firestore in real time).

## What it controls

| Admin section | Firestore location | Android usage |
|---|---|---|
| Designs | `designs/{id}` — `name, category, categorySlug, subcategory, subcategorySlug, imageUrl` (+ `imagePublicId, isActive`) | `CatalogRepository.observeDesigns()` — unchanged |
| Categories | `categories/{id}` — `name, title, nameEn, slug, imageUrl` (+ extras) | `observeCategories()` — unchanged |
| Rooms | `subcategories/{id}` — `name, nameEn, slug, order` | Currently hardcoded fallback in `DummyCatalogData`; wire to this collection (snippet below) |
| Contact + Hero | `settings/app` — `phoneNumber, phoneDisplay, whatsappNumber, heroTitle, heroSubtitle, heroDescription, heroImageUrl` | Currently hardcoded in `ContactActions` / `HeroShowcaseBanner`; wire to this doc (snippet below) |

Images are uploaded server-side to **Cloudinary** (`/api/upload`) and only the
CDN `secure_url` is stored in Firestore. Deleting/replacing removes the old
Cloudinary asset automatically.

## Setup

1. **Install**
   ```bash
   npm install
   ```
2. **Admin login** — pick a username and a strong password (min 12 chars), then:
   ```bash
   cp .env.example .env
   npm run gen-password -- "YourStrongPassword"
   ```
   Put the username in `ADMIN_USERNAME` and the printed `salt:hash` line in
   `ADMIN_PASSWORD_HASH`. Add a session secret (`openssl rand -base64 32`) as
   `NEXTAUTH_SECRET` and the panel URL as `NEXTAUTH_URL`.
3. **Firebase Admin** — Firebase Console → Project Settings → Service Accounts →
   Generate new private key. Copy into `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   (keep the `\n` escapes). Set `FIREBASE_DATABASE_ID` only if you use a
   non-default database (the Android app reads `R.string.firestore_database_id`).
3. **Cloudinary** — Dashboard → API keys. Fill `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Optional `CLOUDINARY_FOLDER`
   (default `rs-decor`; uploads land in `…/designs|​categories|​hero`).
4. **Admin key** — generate and set:
   ```bash
   openssl rand -hex 32   # → ADMIN_API_KEY
   ```
5. **Run**
   ```bash
   npm run dev      # http://localhost:3000
   ```
   Open the URL and sign in with your administrator account. Auth is
   NextAuth credentials + httpOnly session cookie (12h, rate-limited logins).
   Every API route verifies the server session first and the middleware
   returns 401 JSON for unauthenticated API calls — the UI lock screen is
   cosmetic, enforcement is server-side.

## Performance at 6000+ designs

The browser never loads the catalog. `/api/designs` serves one page at a
time (12/24/48/100 rows) from a server-side index: a single Firestore
collection read cached for 30s (no composite indexes required), with
search (multi-word, debounced), category/room/status filters and sorting
applied on the server. Every panel mutation invalidates the cache, so your
own writes are visible immediately. Bulk publish/unpublish/delete handles
up to 200 ids per call via `POST /api/designs/bulk`.

## Deploy

Any Node host works (VPS, Render, Railway, Vercel). Set the same env vars on the
host, then `npm run build && npm start`. Keep the service-account key and
Cloudinary secret server-side only — nothing under `FIREBASE_*` /
`CLOUDINARY_*` is ever bundled to the browser.

## Harden Firestore rules (recommended)

Today the Android `firestore.rules` allow **public writes**. Since this panel
writes through the Admin SDK (which bypasses rules), lock writes down:

```js
match /categories/{id} { allow read: if true; allow write: if false; }
match /designs/{id}    { allow read: if true; allow write: if false; }
match /subcategories/{id} { allow read: if true; allow write: if false; }
match /settings/{id}   { allow read: if true; allow write: if false; }
```

A ready-to-apply copy is in `firestore.rules` in this folder. Copy it over the
Android project's rules and deploy with `firebase deploy --only firestore:rules`.
The Android app keeps working (reads stay public); all writes now flow only
through this panel.

## Android sync status: ✅ wired

The Android app already observes everything below in real time
(`CatalogRepository.observeSubcategories()` / `observeAppSettings()`,
surfaced via `CatalogViewModel.uiState`). No app update is needed for
day-to-day edits — only for changing this contract.

**1. Rooms** — `CatalogViewModel` collects `observeSubcategories()` and falls
back to the bundled room list when Firestore is empty/unreachable. Invalid
rows (blank slug/name) are filtered by the pure, unit-tested
`CatalogRepository.toRoomItems()` mapper and sorted by the admin `order` field.

**2. Contact + hero** — `CatalogRepository.observeAppSettings()` reads the
`settings/app` doc with per-field fallbacks (`AppSettings.sanitized()`), so a
partially-filled doc never blanks the UI. `ContactActions.callNow()` /
`openWhatsApp()` take the admin numbers as parameters (blank numbers show a
Bangla toast instead of firing a broken intent), and `HeroShowcaseBanner`
renders the Cloudinary image with the bundled drawable as placeholder/error
fallback. First-run seeding (`seedSubcategories()` / `seedAppSettings()`) is
strictly additive — existing admin docs are never overwritten.

## API reference (all require a signed-in admin session cookie)

- `GET/POST /api/designs` (server `?q&categorySlug&subcategorySlug&status&sort&page&limit`) · `PUT/DELETE /api/designs/[id]` · `POST /api/designs/bulk`
- `GET/POST /api/categories` · `PUT/DELETE /api/categories/[id]` (delete blocked while designs reference the slug)
- `GET/POST /api/subcategories` · `PUT/DELETE /api/subcategories/[id]` (rename cascades to designs)
- `GET/PUT /api/settings` (single doc `settings/app`)
- `POST/DELETE /api/upload` (multipart `file`, `kind`, optional `publicId`)
- `GET /api/dashboard` (counts, per-category chart, recent designs)
