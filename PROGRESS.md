# Gather — Build Progress

> Read `Gather-Church-Management-System-Spec.md` alongside this file.
> **Current state: 745 tests passing across 38 test files. Last completed: Session U — Firebase Production Backend (2026-04-24).**

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

## Session I — Email System, Merge Fields, Confirmation Tokens & Volunteer Attendance ✅ Complete (2026-04-18)

**+56 tests (426 total).** Baseline: 370 tests.

### What was built

#### Part 1 — Email Provider Setup

**New `AppConfig` fields (`src/shared/types/index.ts`):**
- `email_provider?: 'gmail' | 'resend'`
- `gmail_address?: string`
- `gmail_app_password?: string` — stored for future server-side proxy; browser SMTP impossible
- `resend_api_key?: string` — overrides `VITE_RESEND_API_KEY` env var when set

**`notification-service.ts` rewrite:**
- Reads `email_provider` from `AppConfig` at send time (lazy import to avoid circular dep)
- Gmail path: logs `console.warn`, does NOT throw (same pattern as Twilio SMS)
- Resend path: uses AppConfig key with fallback to env var
- Added `replaceMergeFields(template, ctx)` and `MERGE_FIELDS` documentation array

**New Settings section (`src/features/settings/ChurchSettings.tsx`):**
- `EmailSection` — provider toggle (Resend / Gmail SMTP), per-provider credential fields, Gmail App Password help link, "Send test email" button with success/failure feedback

#### Part 2 — Merge Fields

| Token | Description |
|-------|-------------|
| `{first_name}` | Recipient's first name |
| `{last_name}` | Recipient's last name |
| `{church_name}` | Church name from settings |
| `{service_date}` | Scheduled service date (volunteers) |
| `{role}` | Volunteer role or team position |
| `{event_name}` | Event name |
| `{group_name}` | Group name |

- Missing context values replaced with empty string (graceful fallback)
- All occurrences of each token replaced (not just first)

#### Part 3 — Confirmation Token System

**New type (`src/shared/types/index.ts`):**
- `ConfirmationToken` — `{ id, church_id, token, person_id, reference_id, purpose, expires_at, used_at?, used_action?, role?, service_date?, event_name?, group_name?, church_name? }`
- `ConfirmationPurpose = 'volunteer' | 'event' | 'group_waitlist'`

**New DB methods (interface + in-memory + Firebase stubs):**
- `getConfirmationToken(token)`, `createConfirmationToken(data)`, `useConfirmationToken(token, action)`

**New service (`src/services/confirmation-token-service.ts`):**
- `createVolunteerConfirmToken`, `createEventConfirmToken`, `createGroupWaitlistConfirmToken`
- `resolveConfirmationToken(tokenString, action)` — validates, marks used, performs DB action
- 7-day expiry, single-use guarantee
- `confirmUrl()` / `declineUrl()` helpers

**New page (`src/features/public-pages/ConfirmPage.tsx`):**
- Route: `/confirm?token=...&action=confirm|decline` (no auth required)
- States: loading, success (purpose-specific message), already_used, expired, not_found
- Registered in `App.tsx`

#### Part 4 — Volunteer Attendance

**New `VolunteerSchedule` fields:**
- `served?: boolean` — `undefined` = not marked, `true` = served, `false` = no-show
- `served_at?: string` — ISO-8601 timestamp when marked

**New service functions (`src/features/volunteers/volunteer-service.ts`):**
- `markServed(id, served: boolean | null)` — mark/unmark attendance; `null` clears the mark
- `getServedVolunteersInMonth(year, month)` — unique person count for Monthly Vital Signs Report

**`ScheduleView.tsx` — attendance column:**
- New `showAttendance` prop (default `false`); set to `true` in coordinator view
- Per-row `AttendanceCell`: green ✓ button, gray ✗ button, undo link after marking
- Per-date summary line: "X of Y confirmed as served · N not yet marked"
- Spinner shown on the cell being updated (not whole row)

### Tests added (Session I)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/merge-fields.test.ts` | 20 | All 7 tokens, multi-token templates, repeated tokens, missing/empty context, unknown tokens, MERGE_FIELDS array |
| `src/tests/confirmation-token.test.ts` | 21 | URL helpers, volunteer/event/group token creation, confirm/decline for all 3 purposes, expiry (fake timers), already_used, not_found, single-use guarantee |
| `src/tests/volunteer-attendance.test.ts` | 16 | `markServed` (true/false/null/flip/undo/scope), `getServedVolunteersInMonth` (deduplication, no-shows excluded, unmarked excluded, month boundaries, zero case) |
| `src/tests/notification-service-prod.test.ts` | updated | Updated mock to include `getAppConfig`, updated warning message to match new multi-provider code |

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
| Session H (2026-04-17) | 10 | 370 |
| Session I (2026-04-18) | 56 | 426 |
| Session J (2026-04-18) | 38 | 464 |
| Session K (2026-04-18) | 66 | 530 |
| Session L (2026-04-18) | 39 | 569 |
| Session M (2026-04-19) | 31 | 600 |
| Session N (2026-04-19) | 32 | 632 |
| Session O (2026-04-22) | 13 | 645 |
| Session P (2026-04-22) | 37 | 682 |
| Session Q (2026-04-22) | 0 | 682 |
| Session R (2026-04-23) | 31 | 713 |
| Session S (2026-04-23) | 16 | 729 |
| Session T (2026-04-24) | 16 | 745 |
| Session U (2026-04-24) | 0 | **745** |

All 745 tests pass. TypeScript clean. No Firebase credentials required to run.

---

## Session J — Giving & Finance ✅ Complete (2026-04-18)

**+38 tests (464 total).** Baseline: 426 tests.

### What was built

#### giving-service.ts

New service at `src/features/giving/giving-service.ts`:
- CRUD wrappers: `getGivingRecords`, `createGivingRecord`, `updateGivingRecord`, `deleteGivingRecord`
- `computeGivingSummary(records)` — pure function, no DB: YTD total, last-12-months monthly buckets, fund breakdown sorted by total desc with percentages
- `getAnnualGivingStatement(personId, year)` — tax-year scoped records + by-fund breakdown
- `parseGivingCsv(csv)` — RFC-4180 Planning Center CSV parser; handles quoted commas, `$`/`,` in amounts, ISO and M/D/YYYY dates
- `commitGivingImport(rows)` — name-matched DB insert with `source: 'imported'`; returns `{ created, skipped }`
- `formatCurrency`, `formatMethod` — display helpers
- **Bug fixed**: `splitCsvRows` was stripping quote characters before passing rows to `parseCsvRow`, breaking quoted fields with commas. Fixed by preserving `"` in the accumulated row string.

#### GivingDashboard.tsx

Three-tab UI at `/admin/giving` (Finance Admin + giving module required):
- **Records tab** — filterable table (person/fund/method), inline edit/delete, `RecordForm` modal for add/edit
- **Summary tab** — YTD stat card, 12-month bar chart sparkline, fund breakdown with progress bars
- **Import tab** — embeds `GivingImport` component

#### GivingImport.tsx

Step-flow CSV importer:
- Upload step: drag-and-drop + file input, reads Planning Center CSV
- Preview step: table of parsed rows before commit, warning about unmatched names
- Done step: shows created/skipped counts

#### GivingStatements.tsx

Annual giving statement at `/admin/giving/statements`:
- Person selector + year dropdown (current + 4 prior years)
- Printable donation history table + fund summary + tax disclaimer
- `window.print()` for Print/Save PDF

#### Finance Admin gating

- Nav item: `requireFinance: true` — visible only to `isFinanceAdmin` users
- Routes: both `/admin/giving` and `/admin/giving/statements` use `requireFinanceAdmin()` loader
- PersonDetail: giving history section (`PersonGivingHistory`) conditionally rendered when `user?.isFinanceAdmin`

### Tests added (Session J)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/giving-service.test.ts` | 38 | CRUD, computeGivingSummary (YTD, monthly, fund breakdown, empty), getAnnualGivingStatement (year filter, total, empty year), parseGivingCsv (all field types, error rows, quoted commas), commitGivingImport (match, skip, source), formatCurrency, formatMethod |

---

## Session K — Monthly Vital Signs Report ✅ Complete (2026-04-18)

**+66 tests (530 total).** Baseline: 464 tests.

### What was built

#### New types + DB layer

- `MonthlyReportHistory` type — one row per month per church; `is_imported` flag distinguishes CSV-imported rows from live data snapshots
- `AppConfig` fields: `annual_giving_budget?: number`, `report_recipients?: string` (comma-separated emails)
- `DatabaseService` methods: `getMonthlyReportHistory(year?, month?)`, `upsertMonthlyReportHistory(data)`
- In-memory DB + Firebase stub implementations

#### monthly-report-service.ts

Pure calculation functions (all testable without DB):
- `countSundaysInMonth(year, month)` — counts Sundays in any calendar month
- `avgWeeklyAttendance(headcounts, sundayCount)` — sum of headcounts ÷ Sundays
- `engagementPct`, `servicePct`, `givingPct`, `kidsPct`, `studentsPct` — n / avgWeekly × 100
- `budgetPct(givingTotal, monthlyBudget)` — giving vs monthly target
- `trendArrow(current, previous)` — ↑ / ↓ / → / null
- `trendPct(current, previous)` — % change, null when no prior data
- `parseHistoricalCsv(csv)` — validates year/month required columns, parses 7 optional numeric columns, row-level errors don't block other rows
- `commitHistoricalImport(rows)` — upserts rows to DB as `is_imported: true`

DB-dependent aggregation:
- `getAttendanceHeadcountsForMonth(year, month)` — reads AttendanceEntry.auditorium_count
- `getEngagedPeopleInMonth(year, month)` — groups that held meetings; if individual attendance recorded use 'present' records; otherwise count all active members
- `getCheckinKidsInMonth(year, month)` — CheckinSession → Checkin → Person.grade; deduplicates within month; splits by KIDS_GRADES (Pre-K–5th) and STUDENT_GRADES (6th–12th)
- `computeMonthlyReport(year, month, monthlyBudget?)` — aggregates all five sections into MonthlyReportData
- `getStoredMonthData(year, month)` — fallback to MonthlyReportHistory for prior-period comparisons

#### MonthlyReport.tsx (`/admin/reports/monthly`)

- Month/year selector (current + 4 prior years)
- Five metric sections: Attendance, Engagement, Service, Giving, Kids & Students
- Trend arrows on every metric with a prior period; N/A shown gracefully
- Attendance comparisons: vs previous month, vs rolling 12-month average, vs same month last year
- Giving section: Finance Admin sees dollar amounts and budget %; other Staff see participation rate only
- Budget color: green ≥100%, amber 80–99%, red <80%
- "Print / PDF" button → `window.print()` with print-optimized layout (church logo/name header, no nav chrome)
- "Email report" button → sends HTML email to `config.report_recipients` (alerts if not configured)
- "Import historical data" button → 3-step modal (upload CSV → row-by-row preview → done count)
- Links to `/admin/attendance`, `/admin/giving`, `/admin/checkin` when data is missing for the selected month

#### Navigation + Settings

- **Reports** nav item in AdminLayout sidebar (Staff+, chart icon, before Import)
- **Settings → Dashboard & Reports section**: annual giving budget field + year-over-year toggle
- **Settings → Communications section**: Report Recipients field (comma-separated emails for monthly report)

### Tests added (Session K)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/monthly-report.test.ts` | 66 | countSundaysInMonth (5 tests), avgWeeklyAttendance (6), engagementPct/servicePct/givingPct/budgetPct/kidsPct/studentsPct (11), trendArrow/trendPct (9), parseHistoricalCsv (12), commitHistoricalImport (2), getAttendanceHeadcountsForMonth (3), getEngagedPeopleInMonth (3), getCheckinKidsInMonth (3), computeMonthlyReport (5), grade classification constants (3) |

---

## Session R — Stripe Connect Online Giving Scaffold ✅ Complete (2026-04-23)

**+31 tests (713 total).** Baseline: 682 tests.

### What was built

#### Types (`src/shared/types/index.ts`)
- Added `GivingFrequency` type: `'one_time' | 'weekly' | 'bi_weekly' | 'monthly' | 'annually'`
- Added `GivingFund` interface: `{ id: string; name: string }`
- Extended `GivingRecord` with optional Stripe/frequency fields: `frequency`, `is_online`, `stripe_payment_intent_id`, `stripe_customer_id`, `stripe_subscription_id`, `created_at`, `updated_at` — all optional for backward compat with existing records
- Added `RecurringSubscription` interface and `RecurringSubscriptionStatus` type
- Added to `AppConfig`: `stripe_account_id?`, `giving_preset_amounts?`, `giving_funds?`
- Updated `DEFAULT_APP_CONFIG`: preset amounts `[25, 50, 100, 250]`, funds `[{ id: 'general', name: 'General Fund' }]`

#### Database layer
- Added `RecurringSubscription` CRUD to `DatabaseService` interface
- Implemented in `in-memory-db.ts`: `getRecurringSubscriptions`, `createRecurringSubscription`, `updateRecurringSubscription`, `cancelRecurringSubscription` (sets `status: 'cancelled'` + `cancelled_at`)

#### Giving service (`src/features/giving/giving-service.ts`)
- Extended `createGivingRecord` to accept frequency/is_online/stripe fields
- Added `createOnlineGivingRecord` — TEST_MODE: skips Stripe, creates GivingRecord with `source: 'stripe'`, `is_online: true`; production TODO documented
- Added `createRecurringSubscription`, `getRecurringSubscriptions`, `cancelRecurringSubscription` service wrappers
- Added `formatFrequency(freq)` helper

#### Part 1 — Giving tab in `/admin/settings`
**`src/features/settings/ChurchSettings.tsx`** — new `GivingSection`:
- **Stripe Connect status widget**: green/amber/gray indicator; 'Start Stripe Connect' button (logs TODO + explains real OAuth flow); 'Disconnect' button (TEST_MODE clears `stripe_account_id`; production TODO comment)
- **Funds editor**: add/remove funds by name; auto-generates stable `fund_id` from name; minimum 1 fund enforced in UI
- **Preset amounts editor**: add/remove dollar amounts; sorted ascending; saved with same 'Save changes' button as funds

#### Part 2 — Giving embed (`/embed/giving`)
**`src/features/giving/GivingEmbed.tsx`** (new file):
- Church logo + name header from `AppConfig`
- Preset amount buttons (from `giving_preset_amounts`) + custom amount input
- Fund designation dropdown (only shown if `giving_funds.length > 1`)
- Frequency toggle: One-time / Weekly / Bi-weekly / Monthly / Annually
- 'Cover processing fee' checkbox: grosses up amount using Stripe's 2.9% + $0.30 rate
- Email field for receipt (optional, validated)
- Stripe Payment Element placeholder div with full wiring TODO comments
- Validation: amount required, min $1, max $10,000; fund required if multi-fund; email format
- Submit: TEST_MODE skips Stripe, creates `GivingRecord` + `RecurringSubscription` (if recurring); logs donation data
- Full-screen success confirmation: amount, fund, frequency, receipt email message

Route added to `App.tsx`: `/embed/giving` inside `EmbedLayout` under `ModuleGuard module="giving"`

#### Part 3 — Giving dashboard updates (`src/features/giving/GivingDashboard.tsx`)
- Renamed 'Records' tab → 'All Giving'; added 'Online Only', 'Recurring', 'Summary', 'Import' tabs
- **Online Only panel** (`OnlineGivingPanel`): filters records where `is_online === true`; shows YTD/gift count/fund count; 12-month bar chart; fund breakdown bar chart + breakdown table (fund, total, % of online giving)
- **Recurring panel** (`RecurringPanel`): active count card; estimated monthly recurring total (frequency-normalized); table of all subscriptions (name, amount, frequency, fund, status, start date); Cancel button per row (TEST_MODE: `cancelRecurringSubscription`; production TODO comment)

#### Part 4 — Cloudflare Worker webhook handler
**`functions/stripe-webhook.js`** (new file):
- Cloudflare Pages Function — POST `/api/stripe-webhook`
- Logs incoming event type immediately
- TODO comment block for `stripe.webhooks.constructEvent` signature verification
- Handles `payment_intent.succeeded`, `invoice.payment_succeeded`, `customer.subscription.deleted` — each with detailed TODO comments showing exact implementation steps and expected metadata fields
- Returns `200 { received: true }` immediately

#### Part 5 — Embeds page update (`src/features/embeds/EmbedsPage.tsx`)
- Added `'giving'` widget to `WIDGETS` array
- Added `GIVING_WIDTH_PRESETS`: Responsive (100%), Fixed 400px, Fixed 600px
- Width selector shown only when giving widget is selected
- `makeScriptTag` / `makeIframeTag` updated to accept and apply `givingWidth`

#### Part 6 — Environment variables (`.env.example`)
- Added `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` with full documentation comments

#### Tests (`src/tests/stripe-giving.test.ts`) — 31 new tests
- `DEFAULT_APP_CONFIG` giving defaults
- `createOnlineGivingRecord`: is_online, source, frequency, stripe ids, subscription id suppressed for one-time, date today, method
- `GivingRecord` backward compatibility
- `computeGivingSummary` with online-only filtering
- `createRecurringSubscription` CRUD: status, email, stripe ids, timestamps
- `getRecurringSubscriptions` with status filter and sort order
- `cancelRecurringSubscription`: status, cancelled_at, persistence, error on not-found
- `db.updateRecurringSubscription`: amount, fund_id, error on not-found
- `formatFrequency`: all 5 values

### How to wire Stripe (when ready)
1. Create a Stripe account and get publishable + secret keys
2. Set up Stripe Connect in the dashboard, get `STRIPE_CONNECT_CLIENT_ID`
3. Fill in `.env.example` values in `.env.local`
4. Wire the 'Start Stripe Connect' button in `GivingSection` to redirect to `stripe.oauth.authorizeUrl()`
5. Build a `/stripe-connect/callback` route to exchange the code and save `stripe_account_id`
6. In `GivingEmbed.tsx`, replace the Payment Element placeholder with real `loadStripe` + `<Elements>`
7. Build a server endpoint to create `PaymentIntent` / `Subscription` and return `clientSecret`
8. Wire signature verification in `functions/stripe-webhook.js`
9. Deploy the function as a Cloudflare Pages Function on your giving domain

---

## Session Q — CSV Export Buttons ✅ Complete (2026-04-22)

**+0 tests (682 total).** No new test infrastructure needed — behavior is browser download mechanics (not unit-testable without jsdom file system mocks).

### What was built

#### `src/shared/utils/csv.ts` (new file)
Shared `downloadCsv(filename, rows)` utility:
- Accepts a 2-D string array (first row = headers)
- RFC-4180 escapes: wraps each cell in `"`, doubles internal `"` characters
- Creates a `Blob`, uses `URL.createObjectURL` + a synthetic `<a>` click for download
- Revokes the object URL after triggering the download

#### People Directory (`/admin/people`)
- "Export CSV" button in header (shown only when filtered list is non-empty)
- Exports **all filtered records** (not just the current page)
- Columns: Name, Email, Phone, Membership Status, Household
- Household name resolved via `db.getPersonHouseholds(person.id)` at export time (first household listed)
- Filename: `people-export.csv`

#### Groups Directory (`/admin/groups`)
- "Export CSV" button in filter bar (shown only when filtered list is non-empty)
- Columns: Group Name, Type, Member Count, Leader
- Active member count resolved via `db.getGroupMembers(group.id)` at export time
- Leader name resolved via `db.getPerson(group.leader_id)` at export time
- Filename: `groups-export.csv`

#### Events Manager (`/admin/events`)
- "Export CSV" button next to "New event" (shown only when event list is non-empty)
- Exports events visible on the current tab (upcoming or past)
- Columns: Event Name, Date, Registered, Waitlisted
- Registration counts resolved via `db.getEventRegistrations(event.id)` at export time
- Filename: `events-upcoming-export.csv` or `events-past-export.csv`

#### Group Attendance (`/admin/groups/:id` → Attendance tab)
- Replaced the previous meeting-row format export with a per-member summary export
- Columns: Member Name, Dates Attended (semicolon-separated YYYY-MM-DD list), Attendance Rate (%)
- New function `buildMemberAttendanceCsvRows(groupId)` added to `group-attendance-service.ts`
- Uses existing `getMemberAttendanceRates` for rate data; cross-references all attendance records to build the dates-attended list
- Old `exportGroupAttendanceCsv` retained in the service (unchanged) but no longer called from the UI
- Filename: `group-attendance.csv`

---

## Session P — Recurring Event Support ✅ Complete (2026-04-22)

**+37 tests (682 total).** Baseline: 645 tests.

### What was built

#### `src/shared/types/index.ts`
- Added `recurrence_series_id?: string` to the `Event` interface — UUID shared by all events in a recurring series

#### `src/features/events/recurrence-service.ts` (new file)
Pure functions for recurring event date generation — zero DB calls, fully testable:
- `RecurrencePattern` type: `'none' | 'weekly' | 'biweekly' | 'monthly'`
- `RECURRENCE_LABELS` — human-readable labels for each pattern
- `MAX_OCCURRENCES = 26`, `DEFAULT_OCCURRENCES = 8`
- `generateOccurrenceDates(startDate, pattern, count)` — returns `count - 1` YYYY-MM-DD strings after the base date. Returns `[]` for `pattern='none'` or `count <= 1`.
- `buildSeriesData(baseData, pattern, count, seriesId)` — returns an array of `count` event data objects: base + occurrences, all stamped with `recurrence_series_id`.
- Local date arithmetic (`new Date(y, m-1, d, 12, 0, 0)`) avoids UTC midnight timezone shifts.
- Month-end clamping: `addMonths` checks `result.getDate() !== originalDay` after construction; calls `result.setDate(0)` to clamp to last day of target month (Jan 31 + 1 month → Feb 28, not Mar 3).

#### `src/features/events/event-service.ts`
- Added `createRecurringSeries(baseData, pattern, count)` — generates a UUID series ID, calls `buildSeriesData`, inserts all events concurrently via `Promise.all`. Returns `{ events, seriesId }`.

#### `src/features/events/EventForm.tsx`
- Added `recurrence` state (`RecurrencePattern`, default `'none'`) and `occurrenceCount` state (default 8, clamped 2–26).
- Recurrence radio buttons section (None / Weekly / Bi-weekly / Monthly) shown only for new events.
- Occurrence count number input (min 2, max 26) shown when a non-`'none'` pattern is selected.
- Submit button label adapts: "Create event" / "Generate N occurrences" / "Save changes".
- Success screen shown after series generation (auto-closes after 1800 ms).
- When editing an event with `recurrence_series_id`: shows "Part of a recurring series — editing this occurrence only" note.

#### `src/features/events/EventsManager.tsx`
- `EventRow` now shows a purple "Recurring series" badge when `event.recurrence_series_id` is set.

### Tests added (Session P)

`src/tests/recurrence-service.test.ts` — 37 tests:

**`generateOccurrenceDates — none`** (2 groups, 5 tests):
- Returns `[]` for `pattern='none'` regardless of count
- Returns `[]` when `count=1` for any pattern

**`generateOccurrenceDates — weekly`** (7 tests):
- Generates `count - 1` dates
- First date is exactly 7 days after start
- Subsequent dates each 7 days apart
- Crosses month boundary (Apr 27 + 7 weeks = Jun 15)
- Crosses year boundary (Dec 28 + 7 days = Jan 4)
- DEFAULT_OCCURRENCES and MAX_OCCURRENCES smoke tests

**`generateOccurrenceDates — biweekly`** (4 tests):
- Generates `count - 1` dates
- First date 14 days after start
- Subsequent dates 14 days apart
- Crosses year boundary

**`generateOccurrenceDates — monthly`** (8 tests):
- Generates `count - 1` dates
- Advances one calendar month per occurrence
- Dec → Jan year rollover
- Month-end clamping: Jan 31 → Feb 28, Mar 31 → Apr 30, Aug 31 → Sep 30
- Chained clamping: Jan 31 → Feb 28 → Mar 28
- Leap year: Jan 31 2028 → Feb 29 2028

**`buildSeriesData`** (5 tests):
- Returns exactly `count` items with base as first element
- All items share the provided `seriesId`
- Subsequent dates match `generateOccurrenceDates` output
- All items inherit name and other fields from base
- Count=1 returns single-item array

**`createRecurringSeries`** (9 tests, integration):
- Creates exactly `count` events in DB
- All events share the same `recurrence_series_id`
- Events have correct ascending dates
- Each call generates a unique `seriesId`
- Created events retrievable individually from DB
- All events inherit registration settings from base
- Count=1 creates exactly one event
- Monthly series over 12 months has correct year rollover
- Created events appear in `getEvents()` result

**`constants`** (2 tests):
- `DEFAULT_OCCURRENCES === 8`
- `MAX_OCCURRENCES === 26`

---

## Session O — One-Click Email Confirmation Wiring ✅ Complete (2026-04-22)

**+13 tests (645 total).** Baseline: 632 tests.

### Context

The confirmation token infrastructure (`confirmation-token-service.ts`, `ConfirmPage.tsx`, DB methods, tests) was already fully built in a prior session. What was missing was the **email wiring** — the service-layer functions that create tokens and embed confirm/decline URLs in outbound emails.

### What was built

#### `volunteer-service.ts` — `sendVolunteerScheduleEmail`

New exported function that coordinators can call after scheduling a volunteer:
- Looks up the `VolunteerSchedule` entry and the person
- Creates a `ConfirmationToken` with `purpose=volunteer` via `createVolunteerConfirmToken`
- Sends a personalized email with two one-click URLs in the body
- Marks `reminder_sent: true` and `reminder_sent_at` on the schedule entry
- No-ops silently if the person has no email on file or the schedule ID is invalid

#### `group-service.ts` — updated `promoteFromWaitlist`

When a group slot opens and a waitlisted member is promoted to `active`:
- **Before:** sent a plain text email with no action links
- **After:** creates a `ConfirmationToken` with `purpose=group_waitlist`, embeds confirm/decline URLs in the email body. If they click "Release my spot", the token resolution sets `status: inactive`. SMS still sent as a brief heads-up pointing to the email.

#### `event-service.ts` — updated `cancelRegistration`

When a waitlisted registrant is promoted to `registered`:
- **Before:** sent a plain text email
- **After:** creates a `ConfirmationToken` with `purpose=event`, embeds confirm/decline URLs. If they click "Release my spot", the token resolution sets `status: cancelled`. SMS still sent as a brief heads-up.

### Tests added (Session O)

`src/tests/email-confirmation-wiring.test.ts` — 13 tests:

**`sendVolunteerScheduleEmail`** (6):
- Email body contains `/confirm?token=`, `action=confirm`, `action=decline`
- Subject contains role and service date
- No-ops when schedule ID is invalid
- No-ops when person has no email
- Body includes volunteer first name
- `reminder_sent` flag and timestamp set on entry after send

**Group waitlist promotion** (3):
- Promoted person receives email with confirm/decline URLs
- Email mentions the group name
- No email sent when promoted person has no email address

**Event waitlist promotion** (3):
- Promoted person receives email with confirm/decline URLs
- Email mentions the event name
- No email sent when promoted person has no email address

### Already-existing coverage (not new, but relevant)

- `src/tests/merge-fields.test.ts` — 14 tests: `replaceMergeFields`, `MERGE_FIELDS` array, all token types, edge cases
- `src/tests/confirmation-token.test.ts` — 26 tests: URL helpers, token creation for all 3 purposes, expiry TTL, uniqueness, `resolveConfirmationToken` (confirm/decline for volunteer/event/group_waitlist, not_found, already_used, expired, single-use guarantee)

---

## Session N — Bulk Messaging UI ✅ Complete (2026-04-19)

**+32 tests (632 total).** Baseline: 600 tests.

### What was built

#### Type additions (`src/shared/types/index.ts`)
- Added `is_bulk?`, `recipient_count?`, `sender_name?` to `CommunicationsLogEntry`
- Added new `EmailTemplate` interface (id, church_id, name, subject, body, created_at, updated_at)

#### DB layer
- `db-interface.ts`: Added `getEmailTemplates()`, `saveEmailTemplate()`, `deleteEmailTemplate()`
- `in-memory-db.ts`: Implemented all three methods with `gather_email_templates` localStorage key using `mergeIntoStore` pattern; added `emailTemplates` to the store
- `firebase-db.ts`: Added `notImplemented` stubs for all three methods

#### `notification-service.ts`
- Added `options?: { skipLog?: boolean }` parameter to `sendEmail`
- When `skipLog: true`, the per-message `logNotification` call is skipped (used by bulk sends to prevent N individual log entries)

#### `bulk-messaging-service.ts` (new — `src/features/communications/`)

Pure audience filter functions (all unit-tested):
- `filterAllMembers(people)` — active, non-child, non-archived
- `filterAllVolunteers(people, teamMembers)` — anyone on any team
- `filterAllGroupLeaders(people, groups)` — anyone who is `leader_id` of a group
- `filterVisitorsLastNDays(people, days, refDate?)` — people with `first_visit_date` within N days
- `filterGroupMembers(people, groupMembers, groupId)` — active members of specific group
- `filterTeamVolunteers(people, teamMembers, teamId)` — members of specific team
- `filterBirthdayThisMonth(people, refDate?)` — `date_of_birth` month matches current month
- `renderForRecipient(template, person, churchName)` — renders merge fields for one person

DB-aware functions:
- `resolveAudienceFromDb(filter)` — resolves any `AudienceFilter` against the live DB
- `sendBulkEmail(recipients, subject, body, senderName, churchName)` — sends personalized emails with `skipLog: true`, writes one summary `CommunicationsLogEntry` with `is_bulk: true`

#### `BulkMessageModal.tsx` (new — `src/features/communications/`)

Four-step modal wizard:
- **Step 1 — Audience**: Radio buttons for all 7 filter types; sub-controls for days/group/team selectors; live recipient count that updates as filter changes; zero-audience warning blocks Next
- **Step 2 — Compose**: Subject + body textarea; merge field insert buttons ({first_name}, {last_name}, {church_name}, etc.); template picker (loads saved templates); "Save as template" flow with name input; SMS option shown but disabled with "Coming soon" label
- **Step 3 — Preview**: Renders first 5 email-having recipients with merge fields substituted
- **Step 4 — Confirm & send**: Summary table (recipients, with-email count, subject, sender); disabled send button when no email addresses; progress indicator while sending; success screen with sent/failed counts

#### `CommunicationsLog.tsx` (updated)
- Added "**+ New message**" button in page header that opens `BulkMessageModal`
- After a bulk send completes, log is refreshed
- Bulk entries displayed with a purple **BULK** badge alongside the channel badge
- Recipient column shows "N recipients" for bulk entries instead of email address

### Tests added (Session N)

`src/tests/bulk-messaging.test.ts` — 32 tests:
- `filterAllMembers` (5): active adults only, excludes children/archived/inactive, empty input
- `filterAllVolunteers` (4): team membership, no team, duplicate teams, excludes children
- `filterAllGroupLeaders` (3): leader detection, non-leaders, empty groups
- `filterVisitorsLastNDays` (5): within window, outside window, exact cutoff, no visit date, excludes children
- `filterGroupMembers` (3): active members only, waitlisted/inactive excluded, empty
- `filterTeamVolunteers` (3): team scoping, empty team, excludes archived
- `filterBirthdayThisMonth` (4): matching month, different month, no DOB, excludes children
- `renderForRecipient` (5): first_name, last_name, church_name, no fields, multiple fields

---

## Session M — CCLI Song Usage Report ✅ Complete (2026-04-19)

**+31 tests (600 total).** Baseline: 569 tests.

### What was built

#### ccli-report-service.ts (`src/features/worship/ccli-report-service.ts`)

Pure functions:
- `defaultDateRange()` — today back 6 months using local date arithmetic
- `filterPlansByDateRange(plans, from, to)` — inclusive YYYY-MM-DD string comparison
- `aggregateSongUsage(plans, items, songMap)` — groups song items by song_id; `timesUsed` = total appearances; `serviceDates` = sorted deduplicated list; unknown songs appear as "Unknown Song"; rows sorted by timesUsed desc then title asc
- `formatCcliCsv(rows)` — RFC-4180 CSV with header `Title,Artist,CCLI Number,Times Used,Service Dates`; service dates joined with `; `; all string fields double-quoted with `""` escaping

Async function:
- `computeCcliReport(from, to)` — fetches plans, filters, fetches items per plan, resolves songs via `db.getSong()` (not `getSongs()` so soft-deleted songs are included)

Types exported: `CcliSongRow`, `CcliReport`

#### CcliReport.tsx (`/admin/worship/ccli`)

- Date range pickers defaulting to last 6 months
- Permanent compliance banner: "Gather Vital tracks your song usage but does not automatically file CCLI reports..."
- Summary line: "X songs used across Y services in this period"
- Table: Song Title, Artist/Author, CCLI # (⚠ Not set for missing), Times Used, Services Used In
- Yellow warning banner when any song lacks a CCLI number
- Download CSV button (triggers browser download of `ccli-usage-{from}-to-{to}.csv`)
- Print Report button (`window.print()`) with print-optimized layout (church name + date range header, no nav chrome)
- Empty state with link to service planning when no songs found

#### Navigation

- **CCLI Report** tab added to WorshipDashboard tab bar
- **CCLI Report** nav item in AdminLayout sidebar (Staff+, worship module, document icon)
- **CCLI Report** link button added to SongLibrary header
- Route: `admin/worship/ccli` as child of WorshipDashboard (inherits tab bar)

#### SETUP.md

- Added Section 17 explaining CCLI licensing: what it is, why churches need it, how to get a license, how to file the bi-annual report using Gather Vital's export, how to add CCLI numbers to songs

### Tests added (Session M)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/ccli-report.test.ts` | 31 | filterPlansByDateRange (7), aggregateSongUsage (13), formatCcliCsv (8), defaultDateRange (2), edge cases: unknown songs, non-song items, items without song_id, items outside plan set |

---

## Session L — Sunday Volunteer Run Sheet ✅ Complete (2026-04-18)

**+39 tests (569 total).** Baseline: 530 tests.

### What was built

#### New types + DB layer

- `service_time_id?: string` added to `VolunteerSchedule` — allows assignments to be filtered by service time

#### runsheet-service.ts (`src/features/volunteers/runsheet-service.ts`)

Pure functions:
- `isFirstTimeInRole(entry, allHistory)` — true if no prior `served === true` record in same position before this date
- `filterByServiceTime(entries, serviceTimeId)` — null/empty returns all; entries without `service_time_id` appear in every view
- `groupEntriesByTeam(entries, allTeams, teamMembersMap, allHistory)` — groups by team_id; detects leads via `role === 'leader' | 'coordinator'`; sorts leads first then alpha by last name; `confirmedCount` excludes declined; `totalCount` excludes both cancelled and declined
- `nextServiceDate(serviceTimes, fromDate)` — finds next calendar date matching a service day; uses local date arithmetic (`new Date(y, m, d+i)`) to avoid UTC midnight timezone shifts; defaults to Sunday when no service times configured
- `isKidsTeam(team)` — true if team name contains "kids" (case-insensitive)

Types exported: `RunSheetEntry`, `RunSheetTeamGroup`

#### RunSheet.tsx (`/admin/volunteers/runsheet`)

- Date selector defaulting to next upcoming service date
- Service time filter (shown only when >1 service time exists; "All services" default)
- Volunteers grouped by team, sorted leads first then alpha
- Per-volunteer row: checkbox (on-screen), name with badges (★ lead, confirmed checkmark, NEW first-time, Declined muted), role/position, phone number
- Kids teams show room alongside role
- Team header: "X of Y confirmed" count
- Checking a box calls `markServed(id, true)`; unchecking calls `markServed(id, null)`
- Restores `checkedIn` state from `entry.served === true` on load
- Live summary banner: "X of Y checked in" across all visible teams
- Reset all button clears all check-ins
- Print layout: Tailwind `print:hidden` / `print:block` classes; empty checkboxes, badges, phone numbers, no nav chrome

#### Navigation

- **Run Sheet** button in VolunteerDashboard schedule tab (links to `/admin/volunteers/runsheet`)
- **Run Sheet** nav item in AdminLayout sidebar (clipboard icon, Staff+, `moduleKey: 'volunteers'`)
- Route: `admin/volunteers/runsheet` — Staff+, wrapped in `<Wrap>`

### Tests added (Session L)

| File | Tests | Coverage |
|------|-------|---------|
| `src/tests/runsheet.test.ts` | 39 | isFirstTimeInRole (7), filterByServiceTime (5), groupEntriesByTeam (11), confirmation status display (3), served status update integration (3), nextServiceDate (6), isKidsTeam (2), service time filtering integration (2) |

---

## Up Next — Build Queue

> **Music Stand is fully operational end to end.** PDF.js renders every chord chart as real pages with a transparent annotation canvas. Worship leaders can highlight, draw, and add text notes that persist across sessions.

### Immediate Queue

1. **Annotation UX polish** — eraser tool, undo/redo (Ctrl+Z), annotation list panel for reviewing/deleting individual marks
2. **Multi-device annotation sync** — push real-time annotation updates to other musicians in the same session via standBus

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

---

## Session S — Absence Tracking ✅ Complete (2026-04-23)

**+16 tests (729 total).** Baseline: 713 tests.

### What was built

#### Types (`src/shared/types/index.ts`)
- Added `absence_threshold_days?: number` to `AppConfig` (default 28)
- Updated `DEFAULT_APP_CONFIG`: `absence_threshold_days: 28`

#### Absence Detection Service (`src/features/people/absence-service.ts`) — NEW
- `detectAbsentMembers(opts)`: pure function identifying regular attenders who haven't been seen recently
  - "Regular attender" = 3+ attendance events in the past 90 days
  - "Absent" = last attendance before `thresholdDays` days ago (default 28)
  - Aggregates across 3 sources: `AttendanceLogs`, `Checkins` (via session dates), `VolunteerSchedule` (served=true only)
  - Deduplicates dates across sources using a `Set`
  - Excludes `!is_active` and `is_archived` people
  - Excludes dismissed personIds
  - Returns sorted by `daysSinceLastSeen` descending (longest absent first)
  - Returns `AbsentPerson[]`: `{ person, lastSeenDate, daysSinceLastSeen, avgFrequencyDays }`
- `dismissAbsenceFlag(personId)`: writes to `localStorage` with 30-day dismissal window
- `getDismissedPersonIds(today?)`: reads dismissals, auto-cleans expired entries, returns `Set<string>`

#### Dashboard (`src/features/dashboard/AdminDashboard.tsx`)
- Added `AbsentMembersWidget` (always visible, no module gate needed):
  - Loads all people, AttendanceLogs, CheckinSessions + Checkins, VolunteerSchedule on mount
  - Shows count of absent regular attenders with amber "needs follow-up" message if count > 0
  - Shows green "all accounted for" message if count === 0
  - Links to `/admin/people?tab=absent`
- Added `detectAbsentMembers` and `getDismissedPersonIds` imports

#### People Directory (`src/features/people/PeopleDirectory.tsx`)
- Added `DirectoryTab = 'directory' | 'absent'` type
- Added tab switcher UI (underline style, count badge on Absent tab)
- Added `useSearchParams` to persist `?tab=absent` in the URL (from dashboard widget link)
- Added `useAppConfig` to read `absence_threshold_days`
- Added Absent tab panel:
  - Loads all required data on tab switch
  - Table: Name (clickable → person profile), Last Seen date, Days Absent (amber badge), Avg Frequency, "Mark as contacted" button
  - "Mark as contacted" calls `dismissAbsenceFlag()` and removes from list immediately
  - `EmptyState` when no absent members found
  - Spinner while loading
- Updated test wrapper in `people-directory.test.tsx` to include `AppConfigProvider`

### Test coverage (`src/tests/absence-service.test.ts`)
16 new tests:
- `DEFAULT_APP_CONFIG.absence_threshold_days` = 28
- Flags regular attender absent after threshold days
- Does NOT flag someone seen within threshold
- Does NOT flag someone with <3 attendances in 90 days
- Excludes inactive people
- Excludes archived people
- Excludes dismissed people
- Respects custom thresholdDays
- Only counts logs within the 90-day window
- Aggregates attendance from checkins
- Aggregates from volunteer schedule (served=true only)
- Does NOT count volunteer slots with served=false
- Deduplicates dates across sources
- Sorts by daysSinceLastSeen descending
- Computes avgFrequencyDays correctly
- Sets avgFrequencyDays=90 for single unique attendance date

### Test file breakdown
| File | Tests |
|------|-------|
| `src/tests/absence-service.test.ts` | 16 |

---

## Session T — Service Stage Display ✅ Complete (2026-04-24)

**+16 tests (745 total).** Baseline: 729 tests.

### What was built

`/display/service` — a read-only stage confidence monitor for the worship team.
Designed to run on a TV or monitor at the back of the stage so the entire worship team can see what song is currently active without needing their own device. No auth required (same pattern as the kids pickup display at `/display`).

#### New function: `getAnyActiveSession()` (`src/features/stand/session-sync-service.ts`)
- Scans all service plans within a ±7-day past / +30-day future window
- Returns `{ session: MusicStandSession, planId: string } | null`
- Used by `ServiceDisplay` on mount and during 5-second polling
- Skips ended sessions, returns first active one found

#### New component: `src/features/display/ServiceDisplay.tsx`
**Three display states:**
1. **Waiting** — no active `MusicStandSession`; animated ellipsis, shows plan name if known
2. **Live** — active session with a song selected; two-pane layout:
   - Large "Now" card: song title (6xl), key, BPM, artist, position badge
   - Dimmed "Up next" card below a divider
3. **Session ended** — brief amber "Session ended" banner (8s), then reverts to waiting

**Data sync (two layers):**
- `standBus.subscribe()` — real-time BroadcastChannel events: `session_started`, `session_ended`, `song_changed`
- 5-second `setInterval` polling via `getAnyActiveSession()` — handles cross-device / page-refresh recovery; `page_turned` events are intentionally ignored (page number not relevant to this display)

**Footer song strip:** When a session is live, shows all songs as pills — current song highlighted in white, past songs dimmed, upcoming songs in muted gray.

**Live status header:** Red pulsing dot + "Live" badge + musician count when session is active.

#### Route: `App.tsx`
- Added `/display/service` route (no auth, no layout shell)
- Added lazy import for `ServiceDisplay`

#### WorshipDashboard link (`src/features/worship/WorshipDashboard.tsx`)
- Added "Stage Display" button (monitor icon) alongside existing "Open Music Stand"
- Opens `/display/service` in a new tab
- Tooltip: "Open the read-only stage confidence monitor on a TV or display screen"

### Test coverage (`src/tests/service-display.test.ts`)
16 new tests across two suites:

**`getAnyActiveSession`** (9 tests):
- Returns null when no plans exist
- Returns null when plans have no sessions
- Returns null when sessions all inactive
- Returns active session when one exists
- Includes planId in result
- Respects future window (35-day plan excluded)
- Respects past window (10-day-old plan excluded)
- Plans 5 days ago are within window
- Skips ended sessions, finds next active

**`session state consumed by ServiceDisplay`** (7 tests):
- `current_song_id` starts null on session creation
- `emitSongChange` updates `current_song_id`
- `endSession` marks `is_active` false
- `endSession` sets `ended_at` timestamp
- `getAnyActiveSession` returns null after session ended
- Multiple song changes: last one wins

---

## Session U — Firebase Production Backend ✅ Complete (2026-04-24)

**+0 tests (745 total).** Baseline: 745 tests. No new tests — this session is pure production wiring; TEST_MODE and all existing tests are unaffected.

### What was built

#### `src/services/firebase-db.ts` — complete rewrite

Replaced all `notImplemented` stubs with full Firestore implementations. Every method is multi-tenant: all reads/writes are automatically scoped to the church returned by `getChurchId()`.

**Firestore schema (all subcollections under `churches/{church_id}/`):**

| Subcollection | Entity |
|---|---|
| `people` | Person |
| `households` | Household |
| `household_members` | HouseholdMember |
| `child_pickups` | ChildPickup |
| `checkin_sessions` | CheckinSession |
| `checkins` | Checkin |
| `checkin_flags` | CheckinFlag |
| `teams` | Team |
| `team_members` | TeamMember |
| `volunteer_schedules` | VolunteerSchedule |
| `volunteer_blackouts` | VolunteerBlackout |
| `groups` | Group |
| `group_members` | GroupMember |
| `group_meetings` | GroupMeeting |
| `group_attendance` | GroupAttendance |
| `events` | Event |
| `event_registrations` | EventRegistration |
| `giving_records` | GivingRecord |
| `recurring_subscriptions` | RecurringSubscription |
| `visitor_followups` | VisitorFollowup |
| `followup_templates` | FollowupTemplate |
| `attendance_logs` | AttendanceLog |
| `communications_log` | CommunicationsLogEntry |
| `email_templates` | EmailTemplate |
| `attendance_entries` | AttendanceEntry |
| `pickup_attempts` | PickupAttempt |
| `songs` | Song |
| `service_plans` | ServicePlan |
| `service_plan_items` | ServicePlanItem |
| `service_assignments` | ServiceAssignment |
| `pickup_queue` | PickupQueueEntry |
| `music_stand_sessions` | MusicStandSession |
| `annotations` | MusicStandAnnotation |
| `user_pdf_prefs` | UserPdfPreferences |
| `confirmation_tokens` | ConfirmationToken |
| `monthly_report_history` | MonthlyReportHistory |
| `settings/app_config` | AppConfig (singleton doc) |

**Top-level collections (not church-scoped):**

| Collection | Entity |
|---|---|
| `churches/{id}` | Church |
| `users/{uid}` | User role document (church_id, tier, isFinanceAdmin, personId) |

**Implementation details:**

- Firestore instance is lazily initialized on first use (`fs()` helper) — no-op in TEST_MODE since `firebaseDb` is never imported there
- IDs: `crypto.randomUUID()` — globally unique, browser-native
- Timestamps: all stored as ISO-8601 strings (matches the in-memory DB pattern, avoids Firestore Timestamp serialization)
- `deletePerson` soft-deletes (sets `is_archived: true`) — matches in-memory DB behaviour
- `searchPeople` — client-side substring match on first_name, last_name, email, phone (Firestore has no native full-text search)
- `getGroups(includeHidden)` — fetches all, filters `is_visible` client-side (avoids composite index on a rarely-queried field)
- `getAnnotations` — queries by `user_id` only, filters `song_id`/`pdf_url` client-side (avoids requiring a multi-field composite index)
- `getUserPdfPreferences` — queries by `user_id`, filters `pdf_url` client-side (same reason)
- `getVolunteerSchedule(teamId, personId)` — queries by `team_id` first (most selective), then filters `person_id` client-side
- `deleteGroupMeeting` — cascades via `writeBatch`: deletes meeting doc + all its `group_attendance` records atomically
- `reorderServicePlanItems` — batch-updates `position` field on each item in one Firestore write
- `upsertGroupAttendance` — queries by meeting_id + person_id; updates if found, creates otherwise
- `saveUserPdfPreferences` — same upsert pattern
- `upsertMonthlyReportHistory` — upserts by year + month
- `useConfirmationToken` — validates not-used and not-expired before marking used; throws descriptive errors matching the in-memory DB

#### `src/auth/AuthContext.tsx` — production login wiring

Replaced the `TODO: resolve church_id` placeholder in `onAuthStateChanged` with a real Firestore lookup:

```
onAuthStateChanged → getDoc('users/{uid}') → { church_id, tier, isFinanceAdmin, personId }
```

- If the `users/{uid}` document exists: uses its fields for tier, isFinanceAdmin, church_id, personId
- If the document is missing (first-time login): defaults to `AccessTier.Authenticated`, empty church_id → redirects to `/setup`
- If Firestore is unreachable (offline / misconfigured): falls back to `AccessTier.Authenticated` with empty church_id — non-fatal
- `setChurchId(church_id)` is called immediately after resolving, so all subsequent `db.*` calls are correctly scoped
- Import: `getFirestore`, `doc`, `getDoc` added from `firebase/firestore`; `app` added from `@/config/firebase`
- TEST_MODE: the `if (isTestMode) return` guard in the effect prevents any Firestore access in test runs

### Firestore security rules (to be deployed separately)

The `users/{uid}` document should be writable only by an admin Cloud Function or the Firebase console — never from the client. Suggested rules sketch:

```
match /users/{uid} {
  allow read: if request.auth.uid == uid;
  allow write: if false; // server-side only
}
match /churches/{churchId}/{document=**} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.church_id == churchId;
}
```
