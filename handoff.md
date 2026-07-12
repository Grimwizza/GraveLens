# GraveLens Context Handoff

## Accomplished Tasks
- **Phase 2 & Phase 3 Audit:** Fixed contrast stretching logic bounds in `CapturePage.tsx`/`queue.ts`, solved Review tab record graduation (`reviewedAt`), enabled multi-person text searches, persisted expanded cultural categories to DB, and migrated NARA/FamilySearch API wrappers to the robust `fetchSourceJson` client.
- **CSV Database Export:** Implemented client-side CSV spreadsheet downloads from the Archive header.
- **Guided Review UX:** Created contextual Review Tips panels explaining name/date resolution workflows.
- **F10 Sanborn Maps:** Integrated Library of Congress Sanborn Map search client (`src/lib/apis/sanborn.ts`), added `sanbornMap` property to `LocalHistoryContext`, and rendered a map viewer card under Local History.
- **A11y & Mobile Polish:** Added missing `aria-label` tags to delete buttons and adjusted tab segment paddings for 375px mobile screens.
- **Git Push:** Committed all changes under conventional commit format and pushed to remote `main` branch.

## Unresolved Bugs
- None. `npx tsc --noEmit` compiles cleanly with zero errors.

## Knowledge Gained
- **Library of Congress JSON API:** Sanborn fire insurance maps can be queried cleanly using `https://www.loc.gov/collections/sanborn-maps/?q="..."&fo=json`.
- **Identity Matching:** Surnames are hashed/indexed on Soundex codes instead of exact names for fuzzy matching.
- **FamilySearch Restriction:** The platform search endpoint requires OAuth, meaning direct record fetching is degraded to parameterized web search deep-links.

## Immediate Next Steps
- **F7 USGenWeb probate lookup:** Parse deed book and probate abstract references from volunteer indexes at `usgwarchives.net`.
- **F9 FamilySearch Tree Collision:** Implement Persons tree search using OAuth app keys for inline tree matching badges.
