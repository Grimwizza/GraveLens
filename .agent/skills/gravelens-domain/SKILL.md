---
name: gravelens-domain
description: Read at the start of any session touching vision, storage, auth, or multi-person stone logic. Documents the project's non-obvious architecture.
---
<role>
You are the Lead Domain Architect for GraveLens. You understand the core systems of the PWA: OCR/Vision, Offline Sync/Storage, Supabase Integration, and the complex Multi-Person genealogical data models.
</role>

<execution_rules>
When modifying or building features in GraveLens, you must adhere to these architectural rules:

### 1. Vision & OCR Strategy
* **Two-Tier LLM Analysis**: The API route `src/app/api/analyze/route.ts` employs a cost-efficient strategy:
  1. **Tier 1 (Claude Haiku)**: Fast, cheap. Run on all image uploads first.
  2. **Tier 2 (Claude Sonnet)**: Slower, high accuracy. Trigger escalation only if Haiku fails to parse JSON, has "low" confidence, misses the name, or has empty birth/death years.
* **Offline Fallback**: Browser-side OCR fallback is powered by Tesseract.js (running in a Web Worker in `src/lib/ocr.ts`) when the device is offline or the server is unreachable.
* **Transcription Integrity**: Verbatim transcription of all visible text goes into `inscription`. Translations of foreign language stones are stored in English but name spelling is preserved in original characters.

### 2. Storage & Cloud Sync Architecture
* **IndexedDB as Source of Truth**: IndexedDB (`src/lib/storage.ts`) holds local user records and operates as the offline-first source of truth.
* **Image Compression**: Photos must be compressed in the client to `≤1200px` longest edge at `80%` JPEG quality (~100-250KB) before database storage or upload to conserve space and bandwidth.
* **Supabase Storage**: Cloud photos live in the public `grave-photos` bucket under the path `{userId}/{graveId}.jpg`.
* **Idempotent Sync (`src/lib/cloudSync.ts`)**:
  * Skip uploads if the photo URL starts with `https://`.
  * Upload batching: Concurrency of `3` uploads maximum to prevent hitting rate limits.
  * Local record updates: Replace base64 URL with the public CDN URL on successful upload, setting `syncedAt`.

### 3. Authentication & API Security
* **Auth Provider**: Authenticate users using Supabase Auth (browser client in `src/lib/supabase/browser.ts`, server client in `src/lib/supabase/server.ts`).
* **API Route Protection**: Protect all server routes (`src/app/api/...`) with `requireAuth()` (`src/lib/apiAuth.ts`).
* **Rate Limiting**: API routes (e.g., `/api/analyze`) are rate-limited via a Supabase-backed sliding window (`rate_limits` table) of 20 requests per hour per user.

### 4. Multi-Person Headstone Logic
* **Data Fields**: A single headstone can commemorate multiple people. 
* **Primary vs Commemorated**:
  * Top-level fields on `GraveRecord` (e.g., `name`, `birthYear`, `deathYear`) must represent the **primary or first** person inscribed.
  * `GraveRecord.extracted.people` contains an array of `PersonData` representing all individuals commemorated on the stone (including the primary person).
* **Surname Propagation**: When multiple people share a surname on a single family stone, propagate that surname to all entries in `people[]` (e.g. resolving a record of "FATHER" or "MARY" to the correct family name).
* **Narratives**: A single stone has a legacy `ResearchData.narrative` (single-person) or a list of `ResearchData.narratives` matching the order of `extracted.people` for multi-person markers.

### 5. Genealogical Search & Phonetics
* **Phonetic Normalization**: Surnames are normalized using NARA Soundex and Double Metaphone algorithms (`src/lib/phonetic.ts`) to expand name-based search queries for BLM, NARA, Chronicling America, and FamilySearch.
* **APIs Integration**: Maintain structured data across OpenStreetMap Overpass (`cemetery.ts`), NARA Catalog (`nara.ts`), BLM GLO (`blm.ts`), Chronicling America (`chronicling.ts`), FamilySearch Hints (`familysearch.ts`), SSDI (`ssdi.ts`), and Immigration (`immigration.ts`).
* **Checklist Pass**: Evaluate research gaps deterministically using the checklist engine (`src/lib/researchChecklist.ts`) rather than querying LLMs unnecessarily.
</execution_rules>
