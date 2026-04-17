# Gather — Build Progress

> Read `Gather-Church-Management-System-Spec.md` alongside this file.
> **Current state: 370 tests passing across 25 test files. Last completed: Session H — PDF.js Rendering, Annotation Canvas, Local QR Codes (2026-04-17).**

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS v3 (NOT v4) |
| Routing | React Router v6 (`createBrowserRouter`) |
| Testing | Vitest 2 + Testing Library + jsdom 24 |
| Backend (prod) | Firebase 10 modular SDK |
| Backend (dev) | Full in-memory stub, no credentials needed |
| Test data | `@faker-js/faker` seeded at 42, generated to `src/test-data/*.json` |

**Run commands:**
```bash
VITE_TEST_MODE=true npm run dev    # full app, no Firebase needed
npx vitest run                     # all 276 tests
npx tsc --noEmit                   # type check
npx vite build                     # production build
node print-server/index.js         # label print server (requires .env)
node scripts/generate-test-data.js # regenerate seed data
```

---

## Architecture Decisions (Critical — Read Before Changing Anything)

### TEST_MODE
`VITE_TEST_MODE=true` (set in `.env.development`) switches the entire `db` export in `src/services/index.ts` from Firebase to an in-memory store seeded from JSON files. The app runs fully without any Google/Firebase credentials.

### Service Layer
`src/services/db-interface.ts` defines `DatabaseService`. `in-memory-db.ts` and `firebase-db.ts` both implement it. `src/services/index.ts` exports `db` — the active implementation.

### Auth / Guards
`src/auth/guards.tsx` holds a module-level `currentUser` variable. Loaders run synchronously relative to `navigate()`, so this variable must be set **synchronously before** calling `navigate()`. See `LoginPage.tsx` and `AdminLayout.tsx`.

`authReady` (from `AuthContext.tsx`) is a promise that resolves immediately in TEST_MODE so loaders never hang.

### Tier-Based Access
Five tiers: `Public(0) < Authenticated(1) < GroupLeader(2) < Staff(3) < Executive(4)` + `isFinanceAdmin` flag.
`src/shared/utils/tierNav.ts` is the single source of truth for which path each tier calls home:
- Public → `/public`
- Authenticated → `/my`
- GroupLeader → `/leader`
- Staff/Executive → `/admin`

### Multi-Tenancy
`src/services/church-context.ts` holds a module-level `_churchId` variable (default `TEST_CHURCH_ID = 'church-test-default'`). Every DB read/write is automatically scoped to the active church. `setChurchId()` is called by `AuthContext` on login and by the setup wizard after church creation. `_churchId` is also persisted to `localStorage` under `gather:church_id` so kiosk tablets survive page refreshes.

### AppConfig & Branding
`src/services/app-config-context.tsx` provides `AppConfigProvider` and `useAppConfig()`. On load and on every update it calls `applyPrimaryColor(hex)`, which converts the hex to HSL and writes 10 CSS custom properties (`--color-primary-50` through `--color-primary-900`) to `document.documentElement`. Tailwind's `bg-primary-*` / `text-primary-*` classes reference these variables, so the entire app recolors at runtime without any component changes.

### Cross-Tab Sync (Kiosk ↔ Staff Dashboard ↔ Display)
Three mechanisms layered:
1. **BroadcastChannel** (`src/services/checkin-event-bus.ts`) — events in Tab A reach Tab B instantly.
2. **localStorage persistence** — sessions, checkins, newly registered people, pickup queue, Church entities, and AppConfig all written to localStorage so any tab can read them.
3. **2-second polling fallback** — display page polls `getActivePickupQueue()` every 2s for cross-device support.

localStorage keys used:
- `gather:church_id` — active church ID (restored on page load)
- `gather_open_session` — current `CheckinSession` object (JSON)
- `gather_checkins_{sessionId}` — `Checkin[]` for that session
- `gather_person_{id}` — individual `Person` objects for cross-tab registered people
- `gather_kiosk_id` — kiosk identity string (e.g. `"kiosk-1"`)
- `gather_pickup_queue` — `PickupQueueEntry[]` for the lobby display
- `gather_church_overrides` — Church entity overrides (name, slug) written by setup wizard / settings
- `gather_app_config_{churchId}` — AppConfig snapshot per church, written by `updateAppConfig`
- `gather_service_plans` — all ServicePlan records (cross-tab for Music Stand)
- `gather_service_plan_items` — all ServicePlanItem records (cross-tab for Music Stand)
- `gather_service_assignments` — all ServiceAssignment records (cross-tab for Music Stand)
- `gather_songs` — all Song records (cross-tab: songs created in admin visible in Music Stand)

**Do not bypass these mechanisms.** Use the cross-tab-aware helpers:
- `getOpenSession()` — reads localStorage first, falls back to `db.getCheckinSessions()`
- `getSessionCheckins(sessionId)` — reads localStorage first
- `getPersonCrossTab(id)` — tries `db.getPerson()`, falls back to localStorage
- `findCheckinInStorage(checkinId)` — scans all `gather_checkins_*` keys
- `getActivePickupQueue()` — reads localStorage, auto-prunes entries older than 2 hours

---

## Phase 1 — Foundation ✅ Complete

**39 tests.** People CRUD, households, tier-based access control, login/guard flows.

Key files: `src/shared/types/index.ts`, `src/services/db-interface.ts`, `src/services/in-memory-db.ts`, `src/auth/`, `src/layouts/`, `src/shared/components/`, `src/features/people/`.

Routes: `/public`, `/login`, `/unauthorized`, `/my`, `/leader`, `/admin`, `/admin/people`, `/admin/people/new`, `/admin/people/:id`, `/admin/people/:id/edit`, `/admin/households/:id`.

---

## Phase 2 — Kids Check-In ✅ Complete

**+16 tests (55 total).** Full kiosk state machine and staff dashboard with cross-tab real-time sync.

Key files: `src/features/checkin/checkin-service.ts`, `src/features/checkin/checkin-hooks.ts`, `src/services/checkin-event-bus.ts`, `src/services/print-service.ts`, `src/features/kiosk/KioskApp.tsx`, `src/features/checkin/CheckinDashboard.tsx`.

Routes: `/kiosk`, `/admin/checkin`.

---

## Phase 3 — Volunteer Scheduling ✅ Complete

**+19 tests (74 total).** Auto-schedule generator, 8 rotation preferences, blackout dates, conflict detection, member self-service confirm/decline.

Key files: `src/features/volunteers/volunteer-service.ts`, `src/features/volunteers/VolunteerDashboard.tsx`, `src/features/volunteers/ScheduleGenerator.tsx`.

Route: `/admin/volunteers`.

---

## Phase 4 — Groups & Events ✅ Complete

**+41 tests (108 total).** Group directory with live capacity, waitlist promotion, public embeds for groups and events.

Key files: `src/features/groups/group-service.ts`, `src/features/events/event-service.ts`, `src/features/groups/GroupBrowser.tsx`, `src/features/events/EventBrowser.tsx`.

Routes: `/admin/groups`, `/admin/events`, `/embed/groups`, `/embed/events`.

---

## Multi-Tenancy Refactor ✅ Complete

**+18 tests (136 total).** All 20 entity interfaces carry `church_id`. Every DB read/write scoped to active church. Setup wizard calls `db.createChurch()` and `setChurchId()`. `AppUser` gains `church_id`. Global church CRUD methods unscoped for super-admin use.

Key files: `src/services/church-context.ts`, `src/shared/types/index.ts` (all interfaces), `src/services/in-memory-db.ts` (`inChurch()` + `stamp()`).

---

## Phase 5 — Visitor Pipeline & Admin Dashboard ✅ Complete

**+21 tests (163 total).** Notification service (email + SMS), visitor follow-up pipeline, admin dashboard with 6 live widgets.

Key files: `src/services/notification-service.ts`, `src/features/visitors/visitor-service.ts`, `src/features/visitors/VisitorPipeline.tsx`, `src/features/dashboard/AdminDashboard.tsx`.

Routes: `/admin`, `/admin/visitors`, `/embed/visitor-form`.

---

## Phase 6 — Church Settings, Setup Wizard & Production Reliability ✅ Complete

**+25 tests (188 total).** Full multi-step setup wizard, comprehensive settings page, allergy auto-alert, notification service production paths, label print server.

### 6A — Setup Wizard (`/setup`) — 10 steps, 9 numbered sections

**Progress indicator:** A segmented bar across the top shows all 9 sections. Each "Next →" saves immediately to the DB — progress is not lost if the admin stops mid-wizard. Once church identity is saved (Section 1), the wizard header shows the church's own name and logo instead of any Gather branding.

| # | Section | What it configures |
|---|---|---|
| 1 | Identity | Church name (required), address, phone, website, logo URL, congregation term |
| 2 | Modules | Feature flag toggles for each major module |
| 3 | Branding | Primary + secondary color with presets, custom picker, live preview |
| 4 | Service Times | Day/time/label, multi-campus toggle, adult attendance tracking toggle |
| 5 | Kids Ministry | Age/grade rooms, label print fields, auto-flag allergy toggle, pickup policy, kiosk count |
| 6 | Groups | Group types, labels, leader-sees-roster toggle, signup-requires-approval toggle |
| 7 | Volunteers | Serving teams list, schedule cadence, scheduling method, notification method |
| 8 | Communications | Primary outreach, follow-up steps, follow-up owner, weekly report toggle |
| 9 | Dashboard | Metric checkboxes, year-over-year comparison toggle |

### 6B — Settings Page (`/admin/settings`)
Sidebar-nav with 8+ independent sections matching the wizard. Each section has its own Save button.

### 6C — AppConfig Type (28 fields)
Full field list in prior sessions — `church_name`, `logo_url`, `primary_color`, `service_times[]`, `kids_rooms[]`, `serving_teams[]`, `modules`, `setup_complete`, and ~20 more.

### 6D — Allergy / Medical Auto-Alert
`MedicalAlertBanner.tsx` — auto-triggers from `child.allergies` or `child.medical_notes`, red banner with Acknowledge button, dismisses per session.

### 6E — Notification Service (Production Paths)
`sendSMS` warns + returns (non-fatal); `sendEmail` calls Resend API with `VITE_RESEND_API_KEY`.

### 6F — Label Print Server (`print-server/`)
Self-contained Node 18+ server. `POST /print` → ZPL → PrintNode API in parallel for child badge + parent tag. Separate printer IDs for dual-printer setups. Configured via `print-server/.env`.

### 6G — Kiosk & Embed Color Fix
`KioskLayout.tsx` and `EmbedLayout.tsx` both apply `applyPrimaryColor()`. Embeds detect `?church=<slug>` and call `db.getChurchBySlug()` → `setChurchId()` → `reloadConfig()` before rendering.

---

## Session B — Foundational Additions + Worship Planning Module ✅ Complete (2026-04-09)

**+40 tests (228 total).** Baseline: 188 tests.

### Foundation additions

| File | What changed |
|---|---|
| `src/shared/types/index.ts` | Added `ModuleConfig` + `DEFAULT_MODULES`; extended `Person` with `baptism_date`, `membership_date`, `salvation_date`, `background_check_date`, `background_check_expiry`, `training_completed`, `is_archived`; extended `Checkin` with director-override fields; added `CommunicationsLogEntry`, `AttendanceEntry`, `PickupAttempt`, `Song`, `ServicePlan`, `ServicePlanItem`, `ServiceAssignment`; added `track_adult_attendance`, `late_pickup_minutes`, `worship_roles`, `modules` to `AppConfig` |
| `src/services/db-interface.ts` | Added method signatures for all new entities |
| `src/services/in-memory-db.ts` | Implemented all new methods; `deletePerson` now sets `is_archived: true` |
| `src/services/firebase-db.ts` | Added `notImplemented` stubs for all new methods |
| `src/services/notification-service.ts` | Added `personId?` to payloads; every send path writes a `CommunicationsLogEntry` |
| `src/features/worship/worship-service.ts` | Full worship service: songs CRUD, service plans/items/assignments, enriched plan helper, run sheet builder |
| `src/features/attendance/attendance-service.ts` | Aggregate attendance CRUD, `sumEntry`, `getWeeklyAttendance` |

### New pages / components

| File | Route / Purpose |
|---|---|
| `src/shared/components/ModuleGuard.tsx` | Wraps routes; shows disabled-module message if module flag is off |
| `src/features/attendance/AttendanceEntry.tsx` | `/admin/attendance` — headcount entry form + recent entries table |
| `src/features/communications/CommunicationsLog.tsx` | `/admin/communications` — filterable log of all sent notifications |
| `src/features/worship/SongForm.tsx` | Create/edit song form |
| `src/features/worship/SongLibrary.tsx` | `/admin/worship/songs` — searchable song library |
| `src/features/worship/ServicePlanList.tsx` | `/admin/worship/services` — plan list + inline create |
| `src/features/worship/ServiceBuilder.tsx` | `/admin/worship/services/:id` — order of service editor + team assignment + email-team |
| `src/features/worship/WorshipDashboard.tsx` | Layout shell for `/admin/worship/*` with tab bar |

### UI wiring + enhancements

| File | What changed |
|---|---|
| `src/features/setup/SetupWizard.tsx` | Module Toggles inserted as step 2 (9 sections total); `track_adult_attendance` radio added to Service Times; progress bar updated |
| `src/features/settings/ChurchSettings.tsx` | Added `modules` SectionId, Modules tab in sidebar, `ModulesSection` component with same toggles |
| `src/features/people/PeopleDirectory.tsx` | Added `archived` FilterStatus; default filter excludes `is_archived`; "Archived" tab shows archived-only records |
| `src/features/people/PersonDetail.tsx` | Life Events card (`baptism_date`, `membership_date`, `salvation_date`); Deactivate → Archive; uses `archivePerson`/`unarchivePerson` |
| `src/features/people/PersonForm.tsx` | Added life event + volunteer fields to form, payload, and round-trip |
| `src/features/people/people-service.ts` | Added `archivePerson` and `unarchivePerson` helpers |
| `src/features/dashboard/AdminDashboard.tsx` | Module-aware: each widget guarded by its module flag |
| `src/features/checkin/CheckinRoster.tsx` | View toggle (All Kids / By Class); Director Override modal (room + required reason, logged to DB); Late Pickup highlight + badge |
| `src/features/checkin/CheckinDashboard.tsx` | Passes `session` prop to `CheckinRoster` for late pickup timing |
| `src/features/checkin/CheckoutPanel.tsx` | Logs every pickup attempt via `db.createPickupAttempt()`; 3-strike alert banner |
| `src/features/volunteers/VolunteerDashboard.tsx` | Added "Background Checks" tab showing expired / expiring-within-30-days volunteers |
| `src/App.tsx` | All new routes wired; module-sensitive routes wrapped in `ModuleGuard` |
| `src/layouts/AdminLayout.tsx` | `moduleKey` field on `NavItem`; Worship, Attendance, Communications nav items; disabled modules hidden from sidebar |

### Tests added (Session B)

| File | Tests | Coverage |
|---|---|---|
| `src/tests/worship-service.test.ts` | 17 | Songs CRUD + search; plans CRUD; item add/update/delete/reorder; enriched plan; run sheet; assignments |
| `src/tests/attendance-service.test.ts` | 8 | Create/update entries; `sumEntry` totals; `getAttendanceEntries` + filter; `getWeeklyAttendance` |
| `src/tests/communications-log.test.ts` | 6 | Create email/SMS entries; failed entry; retrieve; sort order; channel filter |
| `src/tests/module-config.test.ts` | 9 | `DEFAULT_MODULES` all flags; giving disabled; all 9 keys present; `DEFAULT_APP_CONFIG` fields; spread/override/fallback patterns |

---

## Session C — Live Pickup Display ✅ Complete (2026-04-09)

**+7 tests (235 total).** Baseline: 228 tests.

### What was built

| File | What changed |
|---|---|
| `src/shared/types/index.ts` | Added `PickupQueueEntry` interface |
| `src/services/db-interface.ts` | Added `getPickupQueue`, `createPickupQueueEntry`, `clearPickupQueueEntry` |
| `src/services/in-memory-db.ts` | Implemented 3 new pickup queue methods; added Church entity localStorage overrides layer (`gather_church_overrides`); added AppConfig localStorage persistence (`gather_app_config_{churchId}`) so display tab reads admin tab's saved config |
| `src/services/firebase-db.ts` | Added `notImplemented` stubs for 3 new methods |
| `src/services/checkin-event-bus.ts` | Added `'pickup_queue_updated'` to `CheckinEventType` |
| `src/services/print-service.ts` | Added `printCheckoutSlip()` (console.group in TEST_MODE; PrintNode TODO for production) |
| `src/features/display/pickup-queue-service.ts` | `getActivePickupQueue` (with 2-hour auto-expiry + localStorage prune), `addToPickupQueue`, `clearPickupEntry`; console.log at entry of `addToPickupQueue` |
| `src/features/display/PickupDisplay.tsx` | Full-screen `/display` page — two-component pattern (outer resolves `?church=<slug>`, inner mounts after config is fully applied); brand-colored header; queue list with child name/room/time-ago/pickup-code; two-click confirmation Clear button; polls every 2s + subscribes to `checkinBus` for instant updates |
| `src/features/checkin/CheckoutPanel.tsx` | `handleLookup` now calls `addToPickupQueue` immediately after valid code match (child appears on display); `handleConfirmCheckout` calls `clearPickupEntry` after checkout completes (child disappears from display); matched state carries `queueEntryId` |
| `src/features/checkin/checkin-service.ts` | `performCheckout` calls `printCheckoutSlip` only (non-fatal); `addToPickupQueue` removed from this function — it now lives in the UI layer at lookup time |
| `src/App.tsx` | Added lazy import + `/display` route (no auth, no layout) |
| `src/tests/pickup-queue-service.test.ts` | 7 new tests |

### Pickup queue workflow (as-built)

1. Staff enters 4-digit code → clicks **Look Up** → child identified → `addToPickupQueue()` called → **child name appears on lobby TV immediately**
2. Staff clicks **Check Out** → `clearPickupEntry()` called → **child name removed from TV automatically**
3. `/display` is unauthenticated, full-screen, brand-colored — designed to run on a lobby TV or iPad
4. `?church=<slug>` param resolves the church at display time; brand color and church name applied before any content renders
5. Entries auto-expire after 2 hours — pruned from localStorage on every `getActivePickupQueue()` call
6. Staff two-click Clear button on display is a safety valve for stuck entries: first click → "Confirm?" (red), second click → removes from localStorage across all screens

### Tests added (Session C)

| File | Tests | Coverage |
|---|---|---|
| `src/tests/pickup-queue-service.test.ts` | 7 | `createPickupQueueEntry` fields; excludes cleared; sorted oldest-first; `clearPickupEntry` marks cleared; `sessionId` filter; appears after add; DB round-trip |

### Post-session C fixes (same day, 2026-04-09)

These bugs were found during manual testing and fixed in the same session:

| Bug | Root cause | Fix |
|---|---|---|
| Pickup queue empty on display (cross-tab) | `store.pickupQueue` is per-tab; display tab never sees staff tab's in-memory entries | Added localStorage persistence in `pickup-queue-service.ts` (`gather_pickup_queue`) |
| Display showed "Grace Community Church" instead of configured name | `store.appConfigs` is per-tab; display tab loaded seed config; `reloadConfig()` read the wrong store | Added `gather_app_config_{churchId}` localStorage persistence in `in-memory-db.ts`; split `PickupDisplay` into outer (resolver) + inner (content) components so inner mounts after config is applied |
| Church entity slug not found cross-tab | `store.churches` is per-tab; setup wizard updated admin tab but display tab had seed data | Added `gather_church_overrides` localStorage layer to all Church CRUD methods |
| Setup wizard not creating Church entity | `if (!config.setup_complete)` guard prevented execution (seed data has `setup_complete: true`) | Changed to always call `db.getChurch()` and conditionally create or update |
| `addToPickupQueue` appeared not to be called | No console output in the function | Added `console.log('[Gather] addToPickupQueue called', input)` at function entry |
| Stale entry from previous session stuck on display | No expiry mechanism; entry persisted indefinitely in localStorage | Added `QUEUE_EXPIRY_MS = 2 hours` in `getActivePickupQueue`; expired entries pruned from localStorage on every read |
| Staff had no way to manually remove stuck entries | Clear button was removed in workflow redesign | Restored Clear button to display with two-click confirmation pattern |

### Post-session C additions (2026-04-10)

**Logo upload feature** — no new tests; 235 tests still pass.

| File | What changed |
|---|---|
| `src/services/storage-service.ts` | New. `uploadLogo(file)`: validates type (PNG/JPG) and size (≤2 MB); in TEST_MODE converts to base64 data URL via `FileReader` and console.logs; in prod uploads to Firebase Storage and returns the download URL. `validateLogoFile` exported separately for inline form validation. |
| `src/shared/components/LogoUpload.tsx` | New. Upload button (dashed border, `🖼️` icon) when no logo set; 64px preview with "Replace logo" + "Remove" actions when one is. Handles uploading state (spinner, disabled), validation errors, and upload errors inline. |
| `src/features/setup/SetupWizard.tsx` | Step1Identity: URL text input replaced with `LogoUpload`. StepDone: logo thumbnail shown in the confirmation summary above the other config rows when a logo is set. |
| `src/features/settings/ChurchSettings.tsx` | IdentitySection: URL text input + manual preview replaced with `LogoUpload`. |
| `src/features/visitors/VisitorForm.tsx` | Added `useAppConfig()`. Logo rendered above the "Welcome" heading when set; heading text changes to "Welcome to [Church Name]!" when a name is configured. |
| `src/features/kiosk/PhoneEntry.tsx` | Added `useAppConfig()`. Logo replaces the wave emoji `👋` when set; church name replaces the "Welcome!" h1. |
| `src/services/notification-service.ts` | `EmailPayload` gains optional `logoUrl?: string`. When provided, a `html` field is added to the Resend request body with the logo in the email header. `text` is always sent unchanged — existing tests and plain-text clients unaffected. |

**Locations already using `config.logo_url` (no changes needed):**
- `AdminLayout.tsx` — sidebar header (desktop + mobile top bar)
- `PickupDisplay.tsx` — lobby TV brand header and empty-state watermark

---

## Session D — Music Stand ✅ Complete (2026-04-14)

**+41 tests (276 total).** Baseline: 235 tests.

### What was built

Full-screen musician-facing music stand at `/stand`. No admin chrome. Respects `modules.worship` flag — if disabled, shows clean "This feature is not enabled" message.

#### New Types (`src/shared/types/index.ts`)

| Type | Purpose |
|------|---------|
| `MusicStandSession` | Synchronized page-turn session (leader + joined musicians) |
| `MusicStandAnnotation` | Per-user PDF annotations (highlighter, pen, text) |
| `UserPdfPreferences` | Per-user per-PDF zoom level and page reorder |
| `Song.pdf_urls?: string[]` | Additional PDF attachments beyond `chord_chart_url` |

#### New DB Methods (`src/services/db-interface.ts` + implementations)

- `getMusicStandSessions(planId)`, `getMusicStandSession(id)`, `createMusicStandSession`, `updateMusicStandSession`
- `getAnnotations(filter)`, `createAnnotation`, `updateAnnotation`, `deleteAnnotation`
- `getUserPdfPreferences(userId, pdfUrl)`, `saveUserPdfPreferences(prefs)`

#### New Service Files

| File | Purpose |
|------|---------|
| `src/features/stand/music-stand-service.ts` | Plan access (`getMyServicePlans`), songs for plan, PDF attachments, annotations, PDF prefs, offline cache |
| `src/features/stand/session-sync-service.ts` | BroadcastChannel event bus (`standBus`), create/join/leave/end session, `emitPageTurn`, `emitSongChange` |

#### New UI Files

| File | Route / Purpose |
|------|----------------|
| `src/features/stand/StandLayout.tsx` | Layout shell — full-screen dark, module guard |
| `src/features/stand/PlanList.tsx` | `/stand` — upcoming + recent plans, offline sync button |
| `src/features/stand/OrderOfService.tsx` | `/stand/plans/:planId` — song list, session start/join/leave/end |
| `src/features/stand/SongView.tsx` | `/stand/plans/:planId/songs/:songId` — full-screen song view |
| `src/features/stand/PdfViewer.tsx` | PDF display, swipe/tap/keyboard nav, pinch-to-zoom, page reorder, annotation overlay |
| `src/features/stand/AudioPlayer.tsx` | MP3 player with section A–B loop |
| `src/features/stand/Metronome.tsx` | BPM metronome — audio click or visual screen-edge flash |

#### Feature Coverage

| Feature | Status |
|---------|--------|
| Plan list — Staff sees all; Volunteer sees assigned only | ✅ |
| Plans filtered to last 30 days + upcoming | ✅ |
| Order of service with song title, key, BPM | ✅ |
| PDF viewer (iframe in TEST_MODE; real URL support) | ✅ |
| All PDFs per song selectable (`chord_chart_url` + `pdf_urls[]`) | ✅ |
| Page navigation: swipe, tap edges, keyboard arrows | ✅ |
| Foot pedal (Bluetooth, presents as arrow keys) | ✅ (keyboard arrow key handler) |
| Two-page side-by-side in landscape | ✅ |
| Pinch to zoom, zoom saved per PDF per user | ✅ |
| Page reordering, saved per user | ✅ |
| Dark mode toggle | ✅ |
| Audio player with play/pause, scrub, A–B loop | ✅ |
| Audio plays in background while viewing PDF | ✅ (native `<audio>` element) |
| Metronome — audio click and visual flash modes | ✅ |
| BPM auto-updates when advancing to next song | ✅ (Metronome re-renders with new song's BPM) |
| Song navigation drawer + swipe up/down | ✅ |
| Annotations: highlighter, pen, text; color picker | ✅ (UI + DB storage) |
| Annotations per user per PDF per song | ✅ |
| View other member's annotations overlaid | ✅ (PdfViewer `otherUserAnnotations` prop) |
| Sessions: leader starts, musicians join/leave | ✅ |
| Real-time page turn sync via standBus (BroadcastChannel) | ✅ |
| Session state visible (who's leading, count joined) | ✅ |
| Offline cache (last 10 plans in localStorage) | ✅ |
| Sync button downloads plan for offline use | ✅ |
| Cached indicator on plan list | ✅ |
| `modules.worship` guard — disabled shows clean message | ✅ |
| Staff+ can see all plans | ✅ |
| Volunteer sees only assigned plans | ✅ |

#### Tests added (Session D)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/music-stand-service.test.ts` | 20 | Plan access (Staff/Volunteer/date filter/sort), songs for plan, PDF attachments, annotations CRUD + scoping, PDF preferences, offline cache |
| `src/tests/session-sync.test.ts` | 21 | Session lifecycle (create/join/leave/end), active session query, page turn sync, song change sync, bus subscribe/unsubscribe |

#### Bug Fix — Plan List Shows No Plans (resolved 2026-04-15)

**Root cause (confirmed via diagnostic logs):** Music Stand opens in a new browser tab. Each tab has its own JS environment and in-memory store. Plans created in the admin tab existed only in that tab's `store.servicePlans` — the stand tab's store started empty. This is the same cross-tab isolation problem previously solved for check-ins, pickup queue, and app config.

**Fix:** Added localStorage persistence for `servicePlans`, `servicePlanItems`, and `serviceAssignments` in `in-memory-db.ts`, following the identical pattern used for AppConfig and Church overrides:
- On every write (create / update / delete / reorder) → `writeLs(key, storeArray)`
- On every read (get / getBy) → `mergeIntoStore(storeArray, readLs(key))` before filtering
- `mergeIntoStore` adds any persisted record not already present in the store by `id` — idempotent and safe to call on every read

**Previous fix attempts** (rounds 1–4) addressed `church_id` mismatches that were real but secondary — they are still correctly applied. The primary cause was always the separate tab store.

**New localStorage keys:**
- `gather_service_plans` — all ServicePlan records
- `gather_service_plan_items` — all ServicePlanItem records
- `gather_service_assignments` — all ServiceAssignment records

This persistence is implicit TEST_MODE-only: `in-memory-db.ts` is only used when `VITE_TEST_MODE=true`; production uses Firebase which handles cross-tab data automatically.

---

## Session E — Small Group Attendance ✅ Complete (2026-04-15)

**+19 tests (295 total).** Baseline: 276 tests.

### What was built

#### New Types (`src/shared/types/index.ts`)

| Type | Purpose |
|------|---------|
| `GroupMeeting` | One meeting instance per group: `{ id, church_id, group_id, date, notes?, created_at }` |
| `GroupAttendance` | Per-person attendance record for a meeting: `{ id, church_id, meeting_id, person_id, status }` |
| `GroupAttendanceStatus` | `'present' \| 'absent' \| 'excused'` |

#### New DB Methods (`src/services/db-interface.ts` + implementations)

- `getGroupMeetings(groupId)`, `getGroupMeeting(id)`, `createGroupMeeting`, `updateGroupMeeting`, `deleteGroupMeeting`
- `getGroupAttendance(meetingId)`, `upsertGroupAttendance(data)` — upsert is idempotent by (meeting_id, person_id)
- All 7 methods have `notImplemented` stubs in `firebase-db.ts`

#### New Service (`src/features/groups/group-attendance-service.ts`)

| Export | Purpose |
|--------|---------|
| `createMeeting` | Create a GroupMeeting for a group |
| `getMeetings` | List meetings for a group (newest-first) |
| `updateMeeting` | Update meeting date/notes |
| `deleteMeeting` | Delete meeting + all its attendance records |
| `saveAttendance` | Upsert a full set of attendance records for a meeting |
| `getMeetingAttendance` | Raw attendance records for one meeting |
| `getMeetingsWithAttendance` | Enriched list: meeting + presentCount + totalCount |
| `getGroupAttendanceRate` | Overall rate: present / (meetings × members) |
| `getMemberAttendanceRates` | Per-member rates across all meetings, sorted desc |
| `exportGroupAttendanceCsv` | CSV string with Date, Notes, Member Name, Status columns |

#### New UI Files

| File | Route / Purpose |
|------|----------------|
| `src/features/groups/GroupDetail.tsx` | `/admin/groups/:id` — group detail with Members + Attendance tabs |

**Attendance tab features:**
- Summary stat cards: meetings logged, overall attendance %, members tracked
- "+ Log meeting" button → modal with date picker, optional notes, and per-member present/absent toggles (all-present / all-absent shortcuts)
- Meeting history list (newest-first, collapsible) — each row shows date, notes, present/total count
- Inline attendance editor in each history row — re-mark and save without opening a new modal
- Per-member attendance rates table (color-coded: ≥75% green, ≥50% yellow, <50% red)
- "Export CSV" button downloads a CSV file with one row per attendance record
- Delete meeting (with confirmation) removes the meeting and all its records

**Members tab:** full roster with status management, add/remove — lifted from GroupsDirectory expanded row.

#### Integration with GroupsDirectory

`GroupsDirectory.tsx`: added "Attendance →" button to the expanded group row's action bar, linking to `/admin/groups/:id`.

#### Route

`/admin/groups/:id` — requires `GroupLeader` tier (tier ≥ 2), wrapped in `ModuleGuard module="groups"`.

### Tests added (Session E)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/group-attendance-service.test.ts` | 19 | Meeting CRUD; attendance save/upsert; getMeetingsWithAttendance; rate calculations (group + per-member); rate sorting; active-member-only filter; CSV header-only; CSV column order; CSV row order; CSV quote escaping |

---

## Session F — Song Import ✅ Complete (2026-04-15)

**+35 tests (330 total).** Baseline: 295 tests.

### What was built

#### localStorage persistence for songs (`src/services/in-memory-db.ts`)

All four Song DB methods (`getSongs`, `getSong`, `createSong`, `updateSong`, `deleteSong`) now use the same `mergeIntoStore` / `writeLs` pattern as service plans. Songs created in the admin tab (e.g. via the song library or import) are immediately visible in Music Stand tabs opened separately.

New localStorage key: `gather_songs`

#### New Service (`src/features/worship/song-import-service.ts`)

| Export | Purpose |
|--------|---------|
| `parseCsv` | Shared CSV parser — handles quotes, escaped quotes, CRLF, empty rows |
| `SONG_FIELDS` | Canonical list of importable song fields (title required; artist, key, BPM, CCLI, tags, lyrics optional) |
| `isPlanningCenterCsv` | Detects PC export by checking headers against known PC column names |
| `buildPlanningCenterMapping` | Auto-maps PC column names (Title, Author, Author/Artist, BPM, CCLI Number, Themes, etc.) |
| `buildAutoMapping` | Auto-maps generic CSV headers by label/key similarity |
| `buildSongPreview` | Builds preview rows with `ready / duplicate / skipped` status |
| `commitSongImport` | Imports all `ready` rows; returns `{ imported, skipped, duplicates }` |

**Duplicate detection rule:** a song is flagged as a duplicate if an existing active song matches on title (case-insensitive). When both the incoming row and the existing song have a CCLI number, the title+CCLI pair is checked first (stricter), falling back to title-only. This avoids false positives while catching the common case of re-importing the same song.

#### New UI (`src/features/worship/SongImportModal.tsx`)

4-step modal wizard:

| Step | Planning Center | Generic CSV |
|------|----------------|-------------|
| Upload | Drop or browse CSV | Drop or browse CSV |
| Map Fields | **Skipped** — auto-mapped | Manual column → field dropdowns |
| Preview | Traffic-light summary (Ready / Duplicate / Skipped), scrollable row table | Same |
| Done | Imported / duplicate / skipped counts | Same |

- PC import detected automatically from headers — mapping step skipped, "Planning Center import detected" badge shown on preview
- Duplicate rows shown with yellow highlight and tooltip showing which existing song matched
- "Import N songs" button disabled when all rows are duplicates or skipped

#### Integration (`src/features/worship/SongLibrary.tsx`)

Added "Import" button (with download icon) in the header bar next to "Add Song". Clicking opens the `SongImportModal`. After a successful import the song list reloads automatically.

### Tests added (Session F)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/song-import-service.test.ts` | 35 | CSV parser (quotes, CRLF, commas-in-quotes, escaping, empty rows); PC detection (known/unknown headers); PC mapping (all column variants); auto-mapping (key match, case-insensitive, ignore fallback); duplicate detection (exact title, case-insensitive, with/without CCLI, mixed statuses); commit (counts, field mapping, bad BPM, all-duplicate); SONG_FIELDS shape |

---

## Session G — Household Checkout, File Attachments, PC CSV & Music Stand ✅ Complete (2026-04-16)

**+30 tests (360 total).** Baseline: 330 tests.

### What was built

#### 1. Household Grouped Checkout with Authorization Controls

**Types added (`src/shared/types/index.ts`):**
- `HouseholdMember.authorized_children: string[]` — list of child IDs this member is authorized to pick up
- `HouseholdMember.pickup_notes?: string` — free-text notes shown to staff at checkout

**DB methods added:**
- `getHouseholdCheckoutGroup(churchId, householdId)` — returns all checked-in children for a household grouped together, enabling single-scan multi-child checkout

**UI changes:**
- `CheckoutPanel` — redesigned to show all household children in a grouped card; staff sees each child's photo, room, and authorization status in one view
- `AuthorizationForm` in `HouseholdManager` — staff can mark which adults are authorized for each child, and add pickup notes
- `HouseholdSummary` — new badges showing authorization count and pickup notes indicator

**Tests added:** 11 tests in `src/tests/household-checkout.test.ts` covering grouped fetch, authorization filtering, notes display, and edge cases (no children checked in, unauthorized adult, partial authorization).

#### 2. PDF and Audio File Attachments for Songs

**New service functions (`src/services/storage-service.ts`):**

| Export | Purpose |
|--------|---------|
| `validateSongPdf(file)` | Size check (≤ 10 MB), MIME type check |
| `uploadSongPdf(songId, file)` | TEST_MODE: base64 data URL; prod: Firebase Storage upload |
| `validateSongAudio(file)` | Size check (≤ 50 MB), MP3/M4A MIME check |
| `uploadSongAudio(songId, file)` | TEST_MODE: base64 data URL; prod: Firebase Storage upload |

**UI changes (`src/features/worship/SongForm.tsx`):**
- New `SongFileAttachments` component with drag-and-drop zones for PDF and audio
- Files upload immediately on drop/select (not on form save) via `updateSong`
- Shows file list with remove buttons; TEST_MODE notice explains data-URL storage
- Read-only chord chart text preview shown in edit mode when `chord_chart_text` is present

**`mergeIntoStore` fix (`src/services/in-memory-db.ts`):**
- Previously only *added* new records, never replaced existing ones — seed songs edited in localStorage (e.g. `chord_chart_url` set on `song-amazing-grace`) were silently ignored on reload
- Fixed to replace existing records with the persisted (localStorage) version: localStorage is the source of truth in TEST_MODE

#### 3. PC CSV Importer — Multi-line Chord Charts & Multiple Arrangements

**RFC-4180 compliant CSV parser (`src/features/worship/song-import-service.ts`):**
- Rewrote `parseCsv` to parse character-by-character; newlines inside quoted fields are part of the field value and do NOT start a new row
- Previously: a chord chart with 40 lines of text would create 40 song records from one CSV row

**`chord_chart_text` field:**
- Added `chord_chart_text?: string` to `Song` type
- Added `chord_chart_text` to `SONG_FIELDS` and `PC_COLUMN_MAP` (`'arrangement 1 chord chart'`, `'chord chart'`)
- `commitSongImport` saves `chord_chart_text`; key normalization takes only the first key from "G, Ab, F#m"-style values

**Planning Center multiple arrangements (`applyPcTransforms`):**
- Each CSV row is exactly one song (Arrangement 1 = primary)
- Arrangement 2–4 names and primary keys → "Also available: Acoustic (Ab), Rock (D)" note prepended to `chord_chart_text`
- Arrangement 2–4 chord chart text intentionally ignored
- Themes column leading `, ` stripped (PC always emits `, Adoration, Creator`)

**Import preview:** chord chart snippet column added to preview table for PC imports.

**Tests added:** 19 tests in `src/tests/song-import-service.test.ts` covering multi-line quoted fields, Themes stripping, arrangement note building (2/3/4 arrangements, no-key fallback), PC column mapping, `chord_chart_text` commit, key normalization, and 4-arrangement end-to-end (one CSV row → exactly one song record).

#### 4. Chord Chart Text View in Music Stand

**New component (`src/features/stand/SongView.tsx` — `ChordChartTextView`):**
- Dark background, monospace font, `whitespace-pre-wrap`, 18px base size × zoom multiplier
- Indicator banner: "Text chord chart — upload a PDF for annotation support"
- Zoom controls (A+/A−) active in text view; same zoom state as PDF view
- Auto-initializes to text view when no PDFs exist but `chord_chart_text` is present
- "T" toggle button shown when song has both a PDF and chord chart text — PDF is default when both exist
- Metronome and audio player remain accessible in text view

### Tests added (Session G)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/household-checkout.test.ts` | 11 | Grouped fetch, authorization filtering, pickup notes, edge cases |
| `src/tests/song-import-service.test.ts` | +19 | RFC-4180 multi-line parser, Themes cleanup, arrangement notes, PC columns, chord_chart_text commit |

---

## Session H — PDF.js Rendering, Annotation Canvas & Local QR Codes ✅ Complete (2026-04-17)

**+10 tests (370 total).** Baseline: 360 tests.

### What was built

#### PDF.js loader (`src/features/stand/pdf-js-loader.ts`)

- Dynamically injects a `<script>` tag for PDF.js 3.11.174 from the CDN on first use
- Sets `GlobalWorkerOptions.workerSrc` to the matching worker CDN URL
- Caches the load promise — CDN request happens at most once per page lifetime
- Returns `true` if ready, `false` if CDN is unreachable (offline / blocked)

#### `PdfViewer.tsx` — complete rewrite

**Removed:** `<iframe>` / placeholder `PageFrame` component
**Added:**

| Component | Purpose |
|-----------|---------|
| `PdfPageWithAnnotations` | Renders one PDF page to a `<canvas>` via PDF.js, with a transparent SVG annotation layer on top |
| `AnnotationShape` | Renders saved `pen`/`highlighter` paths and `text` elements inside the SVG layer |
| `FallbackIframe` | Used when PDF.js CDN is unreachable — same `<iframe>` behaviour as before |

**PDF rendering:**
- `page.getViewport({ scale: 1.5 })` → canvas is 1.5× PDF native resolution
- `canvas.style.width = '100%'; height = 'auto'` → fills container at correct aspect ratio
- Dark mode via CSS `filter: invert(1) hue-rotate(180deg)` on the canvas element (zero re-renders)
- Loading spinner shown until `renderTask.promise` resolves
- Render task cancelled via `renderTask.cancel()` on page change / unmount to prevent memory leaks

**SVG annotation layer:**
- `viewBox="0 0 {canvasWidth} {canvasHeight}"` with `preserveAspectRatio="none"` → annotation coordinates are in PDF canvas pixel space
- `svg.getScreenCTM().inverse()` converts pointer clientX/Y to SVG coordinates — automatically accounts for the zoom CSS transform on the parent container
- `setPointerCapture()` ensures smooth pen/highlighter paths when cursor leaves the SVG mid-stroke
- `pen` and `highlighter`: path built incrementally as `M x y L x y ...`, saved on `pointerup` if the path has at least one segment (`L`)
- `text`: click shows a `<foreignObject>` input at the click coordinates; Enter or blur commits the annotation as `JSON.stringify({ text, x, y })`
- SVG `pointerEvents: none` when no tool is active — tap-to-navigate pass-through works as before

**Annotation storage (unchanged service layer):**
- `createAnnotation` called on drawing completion; result pushed to local state
- `getAnnotationsForSong` loads all annotations for the current user + song + PDF URL on mount
- Other-user annotations rendered at 40% opacity (same as before)

**All existing features preserved:**
- Keyboard / foot-pedal navigation (arrow keys)
- Pinch-to-zoom with zoom level persisted per user per PDF
- Page reorder controls
- Two-page landscape layout
- Session sync (page turns via `standBus`)
- Edge-tap navigation

#### New tests (`src/tests/music-stand-service.test.ts`) — +10

| Suite | Tests |
|-------|-------|
| `annotation storage — page-level filtering` | page_number preserved on create; all pages returned when no filter; client-side page filter (PdfViewer pattern); multiple annotations same page |
| `annotation storage — SVG path and text data formats` | pen SVG path preserved exactly; highlighter path preserved; text JSON with position stored/retrieved; color retained |
| `annotation storage — session persistence simulation` | annotations from prior calls visible on subsequent fetch; delete one page doesn't affect others |

#### Local QR code generation (`src/features/embeds/EmbedsPage.tsx`)

Replaced `api.qrserver.com` external service with the `qrcode` npm package (v1.5.4):

- **`QrCanvas` component** — renders a QR code to a `<canvas>` element via `QRCode.toCanvas()` in a `useEffect`; re-renders automatically when the embed URL changes
- **`downloadQr`** — uses `QRCode.toDataURL()` to produce a PNG data URL locally, then triggers a download via a temporary `<a>` element click; no network request, no CORS issue, works offline
- Removed `qrImageUrl()` helper and the `fetch()` → blob → object-URL chain
- Package installed: `qrcode@1.5.4` + `@types/qrcode`

---

## Manually Verified (as of 2026-04-09)

The following flows were confirmed working end-to-end in the running app (`VITE_TEST_MODE=true`):

- **Setup wizard** — runs 9 sections, creates Church entity with correct slug, saves AppConfig, redirects to `/admin` with church name and brand color applied
- **Check-in kiosk** — phone lookup, child selection, label print stub fires, cross-tab checkin visible on staff dashboard immediately
- **Staff checkout** → child appears on `/display` lobby TV the moment code is looked up (before Check Out is clicked)
- **Check Out button** → child disappears from `/display` automatically, print checkout slip stub fires
- **`/display?church=the-venues`** — correctly loads "The Venues" config (brand color, church name) in a fresh tab with no prior auth
- **Cross-tab pickup queue** — staff tab writes to localStorage; display tab in separate browser tab reads it within 2 seconds via polling
- **Auto-expiry** — entries older than 2 hours are pruned from localStorage on next `getActivePickupQueue()` call
- **Manual Clear on display** — first click shows "Confirm?" (red), second click removes the entry from localStorage; disappears on all open display tabs within 2 seconds
- **Background Checks tab** — volunteers with expired or near-expiry checks shown with amber/red indicators
- **Director Override** — staff can move a checked-in child to a different room from the roster; reason logged to DB
- **Worship service builder** — song library, service plan CRUD, item reorder, team assignment, email-team action
- **Logo upload** — PNG/JPG upload in setup wizard and settings; preview shown immediately (data URL in TEST_MODE); logo appears in admin sidebar, kiosk phone entry screen, visitor form embed, and pickup display

---

## Test Summary

| Phase / Session | Tests Added | Cumulative |
|---|---|---|
| Phase 1 | 39 | 39 |
| Phase 2 | 16 | 55 |
| Phase 3 | 19 | 74 |
| Phase 4 | 41 | 108 |
| Multi-Tenancy Refactor | 18 | 136 |
| Phase 5 | 27 | 163 |
| Phase 6 | 25 | 188 |
| Session B (2026-04-09) | 40 | 228 |
| Session C (2026-04-09) | 7 | 235 |
| Session D (2026-04-14) | 41 | 276 |
| Session E (2026-04-15) | 19 | 295 |
| Session F (2026-04-15) | 35 | 330 |
| Session G (2026-04-16) | 30 | 360 |
| Session H (2026-04-17) | 10 | **370** |

All 370 tests pass. TypeScript clean. No Firebase credentials required to run.

---

## Up Next — Build Queue

> **Music Stand is fully operational end to end.** PDF.js renders every chord chart as real pages with a transparent annotation canvas. Worship leaders can highlight, draw, and add text notes that persist across sessions.

### Immediate Queue

1. **Phase 7 — Giving & Finance** — giving record CRUD, Finance Admin gate, Planning Center giving CSV import, YTD dashboard widget
2. **Annotation UX polish** — eraser tool, undo/redo (Ctrl+Z), annotation list panel for reviewing/deleting individual marks
3. **Multi-device annotation sync** — push real-time annotation updates to other musicians in the same session via standBus

> **Recommended: Home church trial before Phase 7.**
> The core feature set is now substantial enough for real use. Running the app with an actual congregation (even a small one) for 2–4 weeks will surface friction, missing edge cases, and priority mismatches that are hard to anticipate in isolation. Suggested trial checklist:
> - Run the setup wizard end-to-end for your church
> - Check in kids for at least one service
> - Log volunteer schedules and confirm/decline flows
> - Create a worship service plan and open it in Music Stand on a real device
> - Import your song library from Planning Center
> - Log group attendance for a small group
>
> Observations from the trial should inform whether bulk PDF upload or Phase 7 (Giving) comes first.

### Phase 7 — Giving Module (`/admin/giving`)

Giving records, Finance Admin access control, and Planning Center giving import.

**What to build:**
- Giving record CRUD: amount, date, fund, method (cash/check/card/online), person link
- Finance Admin gate: `isFinanceAdmin` flag required — hidden from all other tiers including Executive
- Giving dashboard widget: total YTD, monthly trend sparkline, top funds breakdown
- CSV import from Planning Center giving export format (reuse `song-import-service` CSV parser pattern)
- Individual giving history on `PersonDetail.tsx` (Finance Admin only)
- Annual giving statement view per person (printable, tax-year scoped)

**Data model:** `GivingRecord` entity already exists in types and in-memory DB — UI and access control only.

**Routes:** `/admin/giving`, `/admin/giving/import`, `/admin/giving/statements`

---

### Phase 8 — Distribution Polish

Things to finish before wider rollout:

- **Firebase implementation** — fill in the `notImplemented` stubs in `firebase-db.ts` for all methods added since Phase 1 (groups, worship, music stand, group attendance, giving)
- **PWA manifest + service worker** — Music Stand already caches plans offline; wire up a proper web app manifest so it installs to the home screen on iOS/Android
- **Email templates** — the notification service sends plain text; add HTML templates for visitor follow-up, volunteer schedule confirmation, and group signup notifications
- **Print label production path** — `print-server/` exists and works in TEST_MODE; document the PrintNode setup and test with a real Zebra printer
- **Role management UI** — currently tiers are set by a developer; add a simple Admin page to assign roles to people records
- **Error boundaries and loading states** — audit pages for missing error boundaries and add skeleton loading states for slow network conditions

---

## File Map (current)

```
src/
├── App.tsx                              # Route tree
├── main.tsx
├── auth/
│   ├── AuthContext.tsx                  # AuthProvider, useAuth, authReady
│   ├── LoginPage.tsx                    # Test-mode tier switcher
│   └── guards.tsx                       # requireTier(), setCurrentUserForGuards()
├── features/
│   ├── attendance/
│   │   ├── AttendanceEntry.tsx          # /admin/attendance
│   │   └── attendance-service.ts
│   ├── checkin/
│   │   ├── CheckinDashboard.tsx         # /admin/checkin root
│   │   ├── CheckinRoster.tsx            # Live roster; view toggle; Director Override; Late Pickup
│   │   ├── CheckoutPanel.tsx            # 4-digit lookup → display queue → confirm checkout
│   │   ├── FlagAlertBanner.tsx
│   │   ├── MedicalAlertBanner.tsx       # Auto-triggers from Person.allergies/medical_notes
│   │   ├── SessionSetup.tsx
│   │   ├── checkin-hooks.ts             # useActiveSession, useLiveCheckins, useKioskId
│   │   └── checkin-service.ts           # Business logic + cross-tab helpers
│   ├── communications/
│   │   └── CommunicationsLog.tsx        # /admin/communications
│   ├── dashboard/
│   │   └── AdminDashboard.tsx           # /admin — 6 live widgets, module-aware
│   ├── display/
│   │   ├── PickupDisplay.tsx            # /display — unauthenticated lobby TV
│   │   └── pickup-queue-service.ts      # getActivePickupQueue (2hr expiry), addToPickupQueue, clearPickupEntry
│   ├── embeds/
│   │   └── EmbedsPage.tsx               # /admin/embeds — embed code + QR codes
│   ├── events/
│   │   ├── EventBrowser.tsx             # /embed/events
│   │   ├── EventForm.tsx
│   │   ├── EventsManager.tsx            # /admin/events
│   │   └── event-service.ts
│   ├── groups/
│   │   ├── GroupBrowser.tsx             # /embed/groups
│   │   ├── GroupDetail.tsx              # /admin/groups/:id — Members + Attendance tabs
│   │   ├── GroupForm.tsx
│   │   ├── GroupsDirectory.tsx          # /admin/groups — "Attendance →" link per row
│   │   ├── group-attendance-service.ts  # createMeeting, saveAttendance, rates, CSV export
│   │   └── group-service.ts
│   ├── import/
│   │   └── ImportPage.tsx               # /admin/import — CSV import (4-step wizard)
│   ├── kiosk/
│   │   ├── ChildSelector.tsx
│   │   ├── CheckinConfirmation.tsx
│   │   ├── KioskApp.tsx                 # State machine: setup→phone→children→confirm
│   │   ├── KioskSetup.tsx
│   │   ├── NewFamilyForm.tsx
│   │   └── PhoneEntry.tsx               # Logo + church name header when logo is set
│   ├── member/
│   │   ├── GroupLeaderDashboard.tsx     # /leader
│   │   └── MemberDashboard.tsx          # /my
│   ├── people/
│   │   ├── HouseholdDetail.tsx
│   │   ├── HouseholdManager.tsx
│   │   ├── PeopleDirectory.tsx          # /admin/people — includes Archived tab
│   │   ├── PersonDetail.tsx             # Life Events card; Archive/Unarchive
│   │   ├── PersonForm.tsx               # Life event + volunteer fields
│   │   └── people-service.ts            # archivePerson, unarchivePerson
│   ├── settings/
│   │   └── ChurchSettings.tsx           # /admin/settings — 8-section sidebar nav
│   ├── setup/
│   │   └── SetupWizard.tsx              # /setup — 9 sections + Welcome + Done
│   ├── visitors/
│   │   ├── VisitorForm.tsx              # /embed/visitor-form — logo + church name header
│   │   ├── VisitorPipeline.tsx          # /admin/visitors
│   │   └── visitor-service.ts
│   ├── volunteers/
│   │   ├── BackgroundChecksTab.tsx      # (inside VolunteerDashboard)
│   │   ├── BlackoutManager.tsx
│   │   ├── ScheduleGenerator.tsx
│   │   ├── ScheduleView.tsx
│   │   ├── TeamsManager.tsx
│   │   ├── VolunteerDashboard.tsx       # /admin/volunteers — includes Background Checks tab
│   │   └── volunteer-service.ts
│   └── worship/
│       ├── ServiceBuilder.tsx           # /admin/worship/services/:id
│       ├── ServicePlanList.tsx          # /admin/worship/services
│       ├── SongForm.tsx
│       ├── SongImportModal.tsx          # 4-step import wizard (PC + generic CSV)
│       ├── SongLibrary.tsx             # /admin/worship/songs — "Import" button added
│       ├── WorshipDashboard.tsx         # /admin/worship/* layout shell
│       ├── song-import-service.ts       # parseCsv, PC detection, preview, commitSongImport
│       └── worship-service.ts
├── layouts/
│   ├── AdminLayout.tsx                  # Sidebar; module-aware nav
│   ├── EmbedLayout.tsx                  # ?church=slug → setChurchId → reloadConfig
│   ├── KioskLayout.tsx
│   ├── MemberLayout.tsx
│   └── PublicLayout.tsx
├── services/
│   ├── app-config-context.tsx           # AppConfigProvider, useAppConfig, applyPrimaryColor
│   ├── checkin-event-bus.ts             # BroadcastChannel pub/sub
│   ├── church-context.ts                # _churchId + localStorage persistence
│   ├── db-interface.ts                  # DatabaseService interface
│   ├── firebase-db.ts                   # Firebase stub (not fully implemented)
│   ├── in-memory-db.ts                  # Full in-memory implementation + localStorage layers
│   ├── index.ts                         # Exports db, setChurchId, getChurchId, TEST_CHURCH_ID
│   ├── notification-service.ts          # sendSMS + sendEmail; Resend in prod; optional HTML email with logo
│   ├── print-service.ts                 # console in TEST_MODE; HTTP to print-server in prod
│   └── storage-service.ts               # uploadLogo; data URL stub in TEST_MODE; Firebase Storage in prod
├── shared/
│   ├── components/                      # Avatar, Badge, Button, Card, EmptyState,
│   │                                    #   ErrorBoundary, FormFields, LogoUpload, Modal, ModuleGuard, Spinner
│   ├── hooks/
│   │   └── useDebounce.ts
│   ├── types/
│   │   └── index.ts                     # All entity interfaces + 28-field AppConfig
│   └── utils/
│       ├── format.ts
│       └── tierNav.ts
├── test-data/                           # Generated JSON seed files (faker seed 42)
└── tests/
    ├── access-control.test.ts           # 10
    ├── app-config.test.ts               # 9
    ├── attendance-service.test.ts       # 8
    ├── checkin-event-bus.test.ts        # 4
    ├── checkin-service.test.ts          # 12
    ├── communications-log.test.ts       # 6
    ├── event-service.test.ts            # 18
    ├── group-service.test.ts            # 23
    ├── medical-alert.test.tsx           # 8
    ├── module-config.test.ts            # 9
    ├── multi-tenancy.test.ts            # 18
    ├── notification-service.test.ts     # 4
    ├── notification-service-prod.test.ts# 4
    ├── people-directory.test.tsx        # 6
    ├── people-service.test.ts           # 23
    ├── pickup-queue-service.test.ts     # 7
    ├── print-service.test.ts            # 13
    ├── visitor-service.test.ts          # 17
    ├── volunteer-service.test.ts        # 19
    ├── worship-service.test.ts          # 17
    └── setup.ts

print-server/
├── index.js                             # Node 18+; ZPL + PrintNode API
├── package.json
└── .env.example
```

---

## Known Gaps / Not Yet Built

### In-Scope, Deferred to Upcoming Sessions
- **Session D — Music Stand Mode** — `/display/service` read-only service plan view for worship team
- **Session E — Small Group Attendance** — per-meeting attendance log, rate tracking, CSV export
- **Phase 7 — Giving** — giving records, Finance Admin access, giving statements, Planning Center import

### Firebase / Production Wiring
`src/services/firebase-db.ts` exists as a stub but is not fully implemented. To go to production:
1. Complete `firebase-db.ts` against Firestore / RTDB
2. Replace BroadcastChannel/localStorage cross-tab sync with Firebase `onSnapshot`
3. Wire real Firebase Authentication in `AuthContext.tsx`
4. The Resend email key (`VITE_RESEND_API_KEY`) is browser-exposed — proxy through a Firebase Cloud Function for production deployments

### Test Gaps
- No tests for kiosk React components (`KioskApp`, `PhoneEntry`, etc.)
- No tests for `CheckinDashboard`, `CheckinRoster`, `CheckoutPanel`
- Cross-tab behavior cannot be tested in jsdom (single module scope) — manually verified
- No tests for `PickupDisplay` React component (tested at the service layer only)

### Minor UX Gaps
- `admin/people` filter by household (`?household=...`) is not implemented
- The new-family kiosk flow generates a pickup code at registration time and again at check-in; only the `Checkin.pickup_code` matters for pickup — the `ChildPickup.pickup_code` is unused during the session
- Music Stand Mode (Session D) — built at `/stand`; see Session D section above
