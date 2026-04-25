# Gather Church Management System — Full Project Inventory

> **Generated:** 2026-04-24 | **Tests:** 729 passing (37 files) | **Sessions:** A–S
> This is the authoritative reference document for the Gather codebase. Read alongside `PROGRESS.md` and `Gather-Church-Management-System-Spec.md`.

---

## 1. Architecture Overview

### Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | React | 18.3.1 | Functional components + hooks only |
| Language | TypeScript | ~5.6.2 | Strict mode; no `any` except legacy stubs |
| Bundler | Vite | 5.4.10 | Path alias `@/` → `src/` |
| Styling | Tailwind CSS | **3.4.19** | NOT v4 — critical, v4 breaks everything |
| Routing | React Router | 6.30.3 | `createBrowserRouter`, lazy-loaded routes |
| Backend (dev) | In-memory stub | N/A | 100% functional without Firebase |
| Backend (prod) | Firebase | 10.14.1 | Modular SDK; Firestore + Auth |
| Edge functions | Cloudflare Workers | N/A | `functions/` directory (Pages Functions) |
| QR codes | qrcode | 1.5.4 | Local generation, no network call |
| Testing | Vitest | 2.1.9 | jsdom 24, Testing Library React 16.3.2 |
| Test data | @faker-js/faker | bundled | Seeded at 42, pre-generated JSON |
| UUID | uuid | 13.0.0 | |
| Print server | Node.js | local | `print-server/index.js` — PrintNode integration |

### Key Environment Variables

| Variable | Purpose | Location |
|----------|---------|----------|
| `VITE_TEST_MODE=true` | Enables in-memory DB, no Firebase needed | `.env.development` |
| `VITE_FIREBASE_*` | Firebase config (6 vars) | Production only |
| `VITE_RESEND_API_KEY` | Transactional email via Resend | Optional; skips with console.warn |
| `VITE_TWILIO_PROXY_URL` | SMS via server-side proxy | Optional; skips with console.warn |
| `VITE_PRINT_SERVER_URL` | Label printing server | Default: `http://localhost:3001` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe.js browser key | Giving embed |
| `STRIPE_SECRET_KEY` | Stripe server secret | Never in browser |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | Cloudflare Worker |
| `STRIPE_CONNECT_CLIENT_ID` | Connect OAuth | Settings → Giving |
| `VITE_CHURCH_NAME` | Display name fallback | Optional |

### Data Flow

```
Browser (React) ──→ db export (src/services/index.ts)
                       │
                       ├─ VITE_TEST_MODE=true  ──→ InMemoryDatabaseService
                       │                              (src/services/in-memory-db.ts)
                       │                              └─ JSON seed files in src/test-data/
                       │
                       └─ VITE_TEST_MODE=false ──→ FirebaseDatabaseService
                                                     (src/services/firebase-db.ts)
                                                     └─ Firestore (multi-tenant, church_id scoped)

Notifications ──→ notification-service.ts ──→ RESEND (email) or Twilio proxy (SMS)
Labels        ──→ print-service.ts        ──→ print-server/index.js ──→ PrintNode
Stripe (prod) ──→ Cloudflare Worker       ──→ functions/stripe-webhook.js ──→ Firestore
AppConfig     ──→ app-config-context.tsx  ──→ React Context (singleton per church, cached)
```

### Multi-Tenancy

Every database record has `church_id`. The active church ID comes from `getChurchId()` in `src/services/church-context.ts`, which reads from `localStorage`. In-memory DB scopes all queries via `inChurch(collection)` — a filter that rejects rows with a different `church_id`. This ensures complete data isolation in both dev and production.

### Auth / Access Control

Five tiers: `Public(0) < Authenticated(1) < GroupLeader(2) < Staff(3) < Executive(4)` + `isFinanceAdmin` boolean flag (separate from tier).

`src/auth/guards.tsx` holds a module-level `currentUser` variable that **must be set synchronously** before `navigate()` is called — loaders run synchronously relative to navigation. `authReady` promise (from `AuthContext.tsx`) resolves immediately in TEST_MODE so loaders never hang.

Route-level guarding: `src/shared/utils/tierNav.ts` maps tiers to home routes. `ModuleGuard` in `src/shared/components/ModuleGuard.tsx` gates components by `config.modules.*` flag.

---

## 2. File Structure

```
gather/
├── src/
│   ├── App.tsx                   # Route definitions (createBrowserRouter)
│   ├── main.tsx                  # React root, AuthProvider, AppConfigProvider
│   ├── auth/
│   │   ├── AuthContext.tsx        # Firebase Auth + TEST_MODE stub user
│   │   ├── guards.tsx             # Route loader guards (tierGuard, financeGuard)
│   │   └── LoginPage.tsx         # Email/password login form
│   ├── config/
│   │   ├── app-config.ts         # Tailwind CSS var injection (primary-color → CSS vars)
│   │   └── firebase.ts           # Firebase initialization
│   ├── features/
│   │   ├── attendance/            # Adult attendance entry (aggregate headcounts)
│   │   ├── checkin/               # Kids check-in coordinator dashboard
│   │   ├── communications/        # Bulk messaging + communications log
│   │   ├── dashboard/             # Admin dashboard with widgets
│   │   ├── display/               # Pickup display lobby TV screen
│   │   ├── embeds/                # Embed widget code generator + QR
│   │   ├── events/                # Events CRUD + public browser embed
│   │   ├── giving/                # Giving dashboard + import + embed + statements
│   │   ├── groups/                # Groups CRUD + browser embed + attendance
│   │   ├── import/                # Global people CSV import page
│   │   ├── kiosk/                 # Self-service family check-in kiosk
│   │   ├── member/                # Member-tier and group-leader dashboards
│   │   ├── people/                # People directory + profiles + households
│   │   ├── public-pages/          # Public landing + email confirmation pages
│   │   ├── reports/               # Monthly Vital Signs Report
│   │   ├── settings/              # Church settings (all tabs)
│   │   ├── setup/                 # First-time setup wizard
│   │   ├── shared-pages/          # Unauthorized, placeholder pages
│   │   ├── stand/                 # Music Stand Mode (PDF viewer, annotations)
│   │   ├── visitors/              # Visitor pipeline + follow-up + form embed
│   │   ├── volunteers/            # Volunteer teams, schedule, run sheet
│   │   └── worship/               # Worship planning, song library, CCLI report
│   ├── layouts/
│   │   ├── AdminLayout.tsx        # Staff+ shell with nav sidebar
│   │   ├── EmbedLayout.tsx        # Public iframe-friendly layout (no nav)
│   │   ├── KioskLayout.tsx        # Fullscreen kiosk layout
│   │   ├── MemberLayout.tsx       # Authenticated member shell
│   │   └── PublicLayout.tsx       # Public pages shell
│   ├── services/
│   │   ├── app-config-context.tsx # AppConfig React Context + provider
│   │   ├── checkin-event-bus.ts   # BroadcastChannel cross-tab events (coordinator ↔ kiosk)
│   │   ├── church-context.ts      # getChurchId() / setChurchId() via localStorage
│   │   ├── confirmation-token-service.ts  # Token gen/resolve for email confirmations
│   │   ├── db-interface.ts        # DatabaseService interface (source of truth)
│   │   ├── firebase-db.ts         # Firebase (Firestore) implementation
│   │   ├── in-memory-db.ts        # Full in-memory implementation (dev + test)
│   │   ├── index.ts               # Exports `db` — switches on VITE_TEST_MODE
│   │   ├── notification-service.ts# Email (Resend/Gmail) + SMS (Twilio proxy)
│   │   ├── print-service.ts       # Label printing via print-server HTTP API
│   │   └── storage-service.ts     # Firebase Storage file upload wrapper
│   ├── shared/
│   │   ├── components/            # Avatar, Badge, Button, Card, EmptyState,
│   │   │                          # ErrorBoundary, FormFields, LogoUpload,
│   │   │                          # Modal, ModuleGuard, Spinner
│   │   ├── hooks/useDebounce.ts   # 300ms debounce hook
│   │   ├── types/index.ts         # ALL TypeScript types (single file, ~985 lines)
│   │   └── utils/
│   │       ├── csv.ts             # downloadCsv() shared utility
│   │       ├── format.ts          # formatPhone, formatAge, formatDate, etc.
│   │       └── tierNav.ts         # Tier → home route mapping
│   ├── test-data/                 # Pre-generated seed JSON (21 files)
│   └── tests/                     # 37 test files, 729 tests
├── functions/
│   └── stripe-webhook.js          # Cloudflare Pages Function (POST /api/stripe-webhook)
├── print-server/
│   └── index.js                   # Express server for PrintNode label printing
├── scripts/
│   └── generate-test-data.js      # Faker-based seed data generation
├── .env.example                   # Template for all env vars (with comments)
├── firebase.json                  # Firebase hosting + Firestore rules config
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── PROGRESS.md                    # Session-by-session build log
└── FULL_PROJECT_INVENTORY.md      # This file
```

---

## 3. Route Map

| Path | Component | Auth Level | Notes |
|------|-----------|-----------|-------|
| `/` | Redirect | — | → `/admin` if staff, `/my` if member, etc. |
| `/setup` | `SetupWizard` | Executive | First-run only; redirects away after completion |
| `/login` | `LoginPage` | Public | Firebase Auth login |
| `/public` | `PublicLandingPage` | Public | Marketing/landing page |
| `/confirm` | `ConfirmPage` | Public | Email confirmation link handler |
| `/display` | `PickupDisplay` | Public | Lobby TV — pickup queue display |
| `/stand` | `StandLayout` | Authenticated | Music Stand Mode root |
| `/stand/plans/:planId` | `OrderOfService` | Authenticated | Plan song list |
| `/stand/plans/:planId/songs/:songId` | `SongView` | Authenticated | Full-screen song/PDF view |
| `/my` | `MemberDashboard` | Authenticated | Member home |
| `/leader` | `GroupLeaderDashboard` | GroupLeader | Leader home |
| `/admin` | `AdminDashboard` | Staff | Main dashboard |
| `/admin/people` | `PeopleDirectory` | Staff | Directory + Absent tab |
| `/admin/people/new` | `PersonForm` | Staff | Create person |
| `/admin/people/:id` | `PersonDetail` | Staff | Profile view |
| `/admin/people/:id/edit` | `PersonForm` | Staff | Edit person |
| `/admin/households/:id` | `HouseholdDetail` | Staff | Household view |
| `/admin/checkin` | `CheckinDashboard` | Staff | Kids check-in coordinator |
| `/admin/volunteers` | `VolunteerDashboard` | Staff | Teams + schedule |
| `/admin/groups` | `GroupsDirectory` | GroupLeader | Groups list |
| `/admin/groups/:id` | `GroupDetail` | GroupLeader | Group roster + attendance |
| `/admin/events` | `EventsManager` | Staff | Events CRUD |
| `/admin/visitors` | `VisitorPipeline` | Staff | Visitor pipeline |
| `/admin/giving` | `GivingDashboard` | financeAdmin | Giving records + tabs |
| `/admin/giving/statements` | `GivingStatements` | financeAdmin | Donor statements |
| `/admin/attendance` | `AttendanceEntry` | Staff | Headcount entry |
| `/admin/communications` | `CommunicationsLog` | Staff | Log + bulk messaging |
| `/admin/worship` | `WorshipDashboard` | Staff | Worship module root |
| `/admin/worship/songs` | `SongLibrary` | Staff | Song library |
| `/admin/worship/songs/bulk-pdf` | `BulkPdfUpload` | Staff | Bulk PDF upload |
| `/admin/worship/services` | `ServicePlanList` | Staff | Service plan list |
| `/admin/worship/services/:id` | `ServiceBuilder` | Staff | Service plan editor |
| `/admin/worship/ccli` | `CcliReport` | Staff | CCLI usage report |
| `/admin/volunteers/runsheet` | `RunSheet` | Staff | Volunteer run sheet |
| `/admin/reports/monthly` | `MonthlyReport` | Staff | Monthly Vital Signs |
| `/admin/settings` | `ChurchSettings` | Executive | All settings tabs |
| `/admin/import` | `ImportPage` | Executive | People CSV import |
| `/admin/embeds` | `EmbedsPage` | Staff | Embed code generator |
| `/kiosk` | `KioskApp` | Public | Self-service check-in |
| `/embed/visitor-form` | `VisitorForm` | Public | Embeddable visitor form |
| `/embed/groups` | `GroupBrowser` | Public | Embeddable group browser |
| `/embed/events` | `EventBrowser` | Public | Embeddable event browser |
| `/embed/giving` | `GivingEmbed` | Public | Embeddable giving form |

---

## 4. Database Schema

The `DatabaseService` interface (`src/services/db-interface.ts`) defines **40 resource types** across these entity groups. All entities have `id: string` and `church_id: string`.

### Core Entities

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `Church` | id, name, slug, timezone, is_active | ✅ churches.json |
| `Person` | first/last/preferred name, phone, email, is_child, is_active, is_archived, membership_status, date_of_birth, grade, photo_url, created_at | ✅ people.json |
| `Household` | name, address, primary_contact_id | ✅ households.json |
| `HouseholdMember` | household_id, person_id, role, authorized_children[], pickup_notes | ✅ household_members.json |
| `ChildPickup` | child_id, household_id, authorized_person_id, pickup_code | ✅ child_pickups.json |
| `AppConfig` | 40+ fields (see Section 5) | ✅ app_config.json |

### Kids Check-In

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `CheckinSession` | name, date, service_time, status (open/closed) | ❌ starts empty |
| `Checkin` | session_id, child_id, household_id, pickup_code, status, checked_in_at, override_* | ❌ starts empty |
| `CheckinFlag` | person_id, flag_type (custody_alert/behavioral/medical/other), flag_message, is_active | ✅ checkin_flags.json |
| `PickupAttempt` | checkin_id, attempted_by, timestamp, outcome | ❌ starts empty |
| `PickupQueueEntry` | session_id, checkin_id, child_name, room_name, pickup_code, cleared_at? | ❌ starts empty |

### Volunteers

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `Team` | name, description, is_kids_team | ✅ teams.json |
| `TeamMember` | team_id, person_id, role, rotation_preference | ✅ team_members.json |
| `VolunteerSchedule` | team_id, person_id, scheduled_date, position, status, served?, service_time_id? | ✅ volunteer_schedule.json |
| `VolunteerBlackout` | person_id, start_date, end_date, reason | ✅ volunteer_blackouts.json |

### Groups

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `Group` | name, type, description, capacity?, signup_open, is_public, leader_id | ✅ groups.json |
| `GroupMember` | group_id, person_id, status (active/waitlisted/inactive), joined_at | ✅ group_members.json |
| `GroupMeeting` | group_id, date, topic, notes | ❌ starts empty |
| `GroupAttendance` | meeting_id, person_id, status (present/absent/excused) | ❌ starts empty |

### Events

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `Event` | title, description, date, time, location, cost?, capacity?, registration_required, recurrence_rule?, series_id?, series_index? | ✅ events.json |
| `EventRegistration` | event_id, person_id, status (registered/waitlisted/cancelled), payment_status, confirmation_token? | ✅ event_registrations.json |

### Giving & Finance

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `GivingRecord` | person_id, amount, date, method, fund, source, frequency?, is_online?, stripe_payment_intent_id?, stripe_customer_id?, stripe_subscription_id? | ✅ giving_records.json |
| `RecurringSubscription` | person_id, amount, frequency, fund_id, status, donor_name?, donor_email?, stripe_subscription_id?, stripe_customer_id?, created_at, cancelled_at? | ❌ starts empty |

### Visitors & Communications

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `VisitorFollowup` | person_id, step_number, method, status, notes, completed_at? | ✅ visitor_followup.json |
| `FollowupTemplate` | step_number, method, subject?, body_template, delay_days | ✅ followup_templates.json |
| `CommunicationsLogEntry` | channel (email/sms), recipient_name, recipient_contact, subject?, body_preview, sent_at, audience_label?, template_name?, bulk_count? | ❌ starts empty |
| `EmailTemplate` | name, subject, body, tags[] | ❌ starts empty |

### Attendance

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `AttendanceLog` | person_id, date, event_type (sunday_service/group_meeting/event/midweek), event_id?, count_type | ❌ starts empty |
| `AttendanceEntry` | date, service_time_id?, count, headcount_adults, headcount_kids, headcount_total | ❌ starts empty |

### Worship / Music Stand

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `Song` | title, artist, ccli_number?, key?, tempo_bpm?, themes[], chord_chart_text?, arrangements[], pdf_url?, lyrics? | ✅ songs.json |
| `ServicePlan` | title, date, service_time, status (draft/published), notes? | ❌ starts empty |
| `ServicePlanItem` | plan_id, type (song/reading/prayer/announcement/other), song_id?, title, duration_minutes?, order | ❌ starts empty |
| `ServiceAssignment` | plan_id, person_id, role | ❌ starts empty |
| `MusicStandSession` | plan_id, current_song_id?, current_page?, participants[] | ❌ starts empty |
| `MusicStandAnnotation` | user_id, song_id?, pdf_url?, tool (highlighter/pen/text), color, paths[], text?, page | ❌ starts empty |
| `UserPdfPreferences` | user_id, pdf_url, zoom, scroll_position, last_page | ❌ starts empty |

### Other

| Entity | Key Fields | Seed Data? |
|--------|-----------|-----------|
| `ConfirmationToken` | token (UUID), purpose (volunteer/event/group_waitlist), ref_id, person_id, expires_at, used_at?, action? | ❌ starts empty |
| `MonthlyReportHistory` | year, month, attendance_avg, giving_total, volunteer_count, group_count, visitor_count, kids_count, notes? | ❌ starts empty |

---

## 5. AppConfig Fields

The `AppConfig` interface has 40+ fields organized into sections. The `DEFAULT_APP_CONFIG` constant provides all defaults.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `church_id` | string | — | Tenant key |
| `church_name` | string | 'My Church' | |
| `logo_url` | string? | — | |
| `icon_url` | string? | — | |
| `address`, `phone`, `website` | string? | — | |
| `congregation_term` | string? | — | e.g. 'Members', 'Family' |
| `primary_color` | string | '#6366f1' | Hex; drives CSS vars |
| `secondary_color` | string? | — | |
| `service_times` | ServiceTime[]? | — | `{ id, name, day, time }` |
| `campuses` | string[]? | — | |
| `kids_rooms` | KidsRoom[]? | 5 defaults | `{ id, name, min_age, max_age }` |
| `label_print_fields` | LabelPrintFields? | `{allergies:true, parent_phone:true, photo:false}` | |
| `auto_flag_allergies` | boolean? | true | |
| `pickup_policy` | 'code'\|'visual'? | 'code' | |
| `kiosk_count` | number? | — | |
| `group_types` | string[]? | 3 defaults | |
| `group_leaders_see_roster` | boolean? | true | |
| `group_signup_requires_approval` | boolean? | false | |
| `terminology` | TerminologyConfig | defaults | 24 church-specific term overrides |
| `serving_teams` | string[]? | 8 defaults | |
| `schedule_advance` | 'weekly'\|'bi-weekly'\|'monthly'? | 'weekly' | |
| `volunteer_scheduling` | 'self'\|'coordinator'? | 'coordinator' | |
| `volunteer_notification` | 'email'\|'sms'\|'both'? | 'email' | |
| `primary_outreach` | 'email'\|'sms'\|'both'? | 'email' | |
| `visitor_followup_steps` | number? | 3 | |
| `visitor_followup_owner` | string? | — | |
| `weekly_report` | boolean? | false | |
| `weekly_report_email` | string? | — | |
| `email_provider` | 'gmail'\|'resend'? | 'resend' | |
| `gmail_address`, `gmail_app_password`, `resend_api_key` | string? | — | |
| `dashboard_metrics` | string[]? | 6 defaults | |
| `show_yoy` | boolean? | true | |
| `modules` | ModuleConfig? | all true | Feature flag object |
| `track_adult_attendance` | 'individual'\|'aggregate'\|'none'? | 'aggregate' | |
| `late_pickup_minutes` | number? | 30 | |
| `worship_roles` | string[]? | 10 defaults | |
| `annual_giving_budget` | number? | — | |
| `report_recipients` | string? | — | Comma-separated emails |
| `stripe_account_id` | string?\|null? | — | Set after Connect onboarding |
| `giving_preset_amounts` | number[]? | [25,50,100,250] | |
| `giving_funds` | GivingFund[]? | [{id:'general',name:'General Fund'}] | |
| `absence_threshold_days` | number? | 28 | Days before absent flag |
| `setup_complete` | boolean | false | |
| `updated_at` | string | '' | |

### Module Config (`ModuleConfig`)

All boolean flags; default `true` unless noted:

| Module | Meaning |
|--------|---------|
| `checkin` | Kids check-in coordinator + kiosk |
| `volunteers` | Volunteer teams + scheduling |
| `groups` | Small groups directory + attendance |
| `events` | Events CRUD + registration |
| `visitors` | Visitor pipeline + follow-up |
| `giving` | Giving dashboard (finance admin only) |
| `communications` | Bulk messaging + log |
| `worship` | Worship planning + Music Stand |
| `reports` | Monthly Vital Signs Report |
| `embeds` | Embed widget generator |
| `import` | People CSV import |

---

## 6. Complete Feature Inventory

### Session A — Foundation
- ✅ **Project scaffold**: React + TypeScript + Vite + Tailwind CSS v3 + React Router v6
- ✅ **Multi-tenant architecture**: `church_id` on every record, `church-context.ts`
- ✅ **In-memory DB**: Full `DatabaseService` implementation with seed data
- ✅ **Firebase DB**: Stub (Firestore wiring for production)
- ✅ **Auth system**: TEST_MODE stub user + Firebase Auth production path
- ✅ **Access tier guards**: `tierGuard()` route loaders for each tier
- ✅ **Layouts**: Admin, Member, Kiosk, Embed, Public

### Session B — People & Households
- ✅ **People directory**: Search, filter (all/adults/children), status (active/all/archived), pagination (25/page)
- ✅ **Person profiles**: Full detail view with all fields, edit form
- ✅ **Household management**: CRUD, members, roles, authorized pickups
- ✅ **People service**: `displayName()`, `searchPeople()`, `getActivePeople()`, `formatAge()`
- ✅ **CSV export**: People directory export

### Session C — Kids Check-In
- ✅ **Check-in coordinator dashboard**: Session management (open/close), real-time roster, flag alerts
- ✅ **Kiosk app**: Phone entry → family lookup → child selector → confirmation → pickup code
- ✅ **New family registration**: Full form from kiosk, creates person + household
- ✅ **Checkin event bus**: `BroadcastChannel`-based cross-tab sync (coordinator ↔ kiosk)
- ✅ **Pickup display**: TV lobby screen showing pickup queue, auto-clears
- ✅ **Medical/allergy flags**: Auto-flag on check-in, FlagAlertBanner component
- ✅ **Label printing**: PrintNode integration via local print-server, ZPL labels
- ✅ **Checkout flow**: Pickup code verification, household checkout group
- ✅ **Pickup attempts**: Log of failed/successful pickup attempts
- ✅ **Late pickup flagging**: Configurable minutes threshold

### Session D — Music Stand Mode
- ✅ **Song library**: CRUD, search, chord charts, keys, tempo, themes, CCLI numbers
- ✅ **Service plan builder**: Drag-order items (songs/readings/prayers/etc.), assignments
- ✅ **Music Stand live view**: Tablet-optimized full-screen song view
- ✅ **PDF viewer**: Per-page annotations (highlighter, pen, text tool)
- ✅ **Session sync**: Multi-device conductor sync (page turns, song changes) via BroadcastChannel
- ✅ **Metronome**: Beat visualization synced to song tempo
- ✅ **Audio player**: Playback controls for reference tracks
- ✅ **PDF preferences**: Per-user zoom/scroll position persistence
- ✅ **Bulk PDF upload**: Mass import PDF charts

### Session E — Volunteer Management
- ✅ **Teams manager**: CRUD teams, assign members, roles, rotation preferences
- ✅ **Schedule generator**: Coordinator-mode auto-scheduling with blackout awareness
- ✅ **Schedule view**: Weekly/monthly volunteer calendar per team
- ✅ **Run sheet**: Service-day printable roster by team/role
- ✅ **Blackout manager**: Person date-range blackouts
- ✅ **Served marking**: Coordinator marks volunteers served/no-show
- ✅ **Volunteer confirmation emails**: Token-based confirm/decline flow
- ✅ **Email notifications**: Resend integration with fallback

### Session F — Groups
- ✅ **Groups directory**: Filter by type, open/closed, capacity
- ✅ **Group detail**: Roster, waitlist, member status management
- ✅ **Group form**: CRUD with all fields
- ✅ **Public group browser**: `/embed/groups` iframe embed
- ✅ **Group sign-up**: With approval flow + confirmation token email
- ✅ **Group attendance**: Per-meeting present/absent/excused tracking
- ✅ **Group meetings**: CRUD meeting records
- ✅ **Waitlist promotion**: Auto-promote when capacity opens

### Session G — Events
- ✅ **Events manager**: CRUD events with all fields
- ✅ **Recurring events**: Recurrence rules (daily/weekly/biweekly/monthly), series management
- ✅ **Event registration**: Register/waitlist/cancel with capacity enforcement
- ✅ **Public event browser**: `/embed/events` iframe embed
- ✅ **Event confirmation emails**: Token-based confirm/cancel flow
- ✅ **Waitlist promotion**: Auto-promote on cancellation

### Session H — Giving & Finance (Phase 1)
- ✅ **Giving dashboard**: All Giving tab, Online Only tab, Recurring tab, Summary, Import
- ✅ **Giving records**: CRUD, manual entry
- ✅ **Giving import**: CSV import (Tithe.ly, Planning Center, generic)
- ✅ **Giving statements**: Per-donor annual statements (printable)
- ✅ **Giving summary**: YTD, monthly trend, fund breakdown, bar charts
- ✅ **Format utilities**: `formatCurrency()`, `formatFrequency()`, `formatMethod()`

### Session I — Visitors
- ✅ **Visitor pipeline**: Kanban-style follow-up pipeline
- ✅ **Visitor form embed**: `/embed/visitor-form` public form
- ✅ **Follow-up tracking**: Multi-step workflow (call/email/text/task)
- ✅ **Follow-up templates**: Configurable step templates
- ✅ **Visitor stats**: Dashboard widget with recent visitors, conversion tracking

### Session J — Dashboard Widgets
- ✅ **Attendance widget**: This-week headcount vs prior week
- ✅ **Volunteers widget**: Confirmed count for next service
- ✅ **Groups widget**: Active groups count, total members
- ✅ **Visitors widget**: Last 30 days new visitors
- ✅ **Kids widget**: Last check-in session count
- ✅ **Events widget**: Upcoming events, registration counts
- ✅ **Giving widget**: This month total, YTD, unique givers (finance admin only)
- ✅ **Absent Members widget**: Regular attenders not seen in N days

### Session K — Monthly Report
- ✅ **Monthly Vital Signs Report**: Auto-computed from all data sources
- ✅ **KPI calculations**: attendance rate, volunteer rate, engagement %, giving %, budget %, kids %, students %
- ✅ **Trend indicators**: YoY comparison arrows, percentage delta
- ✅ **Historical import**: CSV import for pre-Gather data
- ✅ **Report history**: Stored per month, persistent across sessions
- ✅ **Report recipients**: Email delivery (configurable)

### Session L — Communications
- ✅ **Bulk messaging**: 4-step compose flow (audience → filter → message → confirm)
- ✅ **Audience filters** (7): All members, Active adults, Children families, Visitors (last N days), Group members, Volunteers, Birthday this month
- ✅ **Merge fields**: `{{first_name}}`, `{{church_name}}`, `{{date}}`, etc.
- ✅ **Templates**: Save/load message templates
- ✅ **Communications log**: Full history with BULK badge, channel, recipient count
- ✅ **SMS + Email**: Both channels supported

### Session M — Attendance
- ✅ **Aggregate headcount entry**: Date + service time + count fields
- ✅ **Individual adult logs**: `AttendanceLog` creation from service events
- ✅ **Attendance service**: `getAttendanceHeadcountsForMonth()`, `getEngagedPeopleInMonth()`
- ✅ **track_adult_attendance** config: 'individual' | 'aggregate' | 'none'

### Session N — Settings
- ✅ **Church settings page** (10 tabs): Identity, Branding, Services, Kids, Groups, Volunteers, Communications, Worship, Reports, Giving
- ✅ **Setup wizard**: First-run guided setup (5 steps)
- ✅ **Logo upload**: Firebase Storage integration
- ✅ **Service times**: CRUD array with day/time picker
- ✅ **All AppConfig fields** configurable via UI

### Session O — Embeds Page
- ✅ **Embed code generator**: Script tag + iframe code for all 4 widgets
- ✅ **QR code generator**: Local QR generation (no network), download as PNG
- ✅ **Width/height presets**: Multiple size options per widget
- ✅ **Live preview**: Embedded iframe preview

### Session P — Worship Enhancements
- ✅ **Song import**: Planning Center CSV import with field mapping
- ✅ **CCLI report**: Song usage CSV export for CCLI SongSelect reporting
- ✅ **Bulk PDF**: Mass PDF upload for chord charts

### Session Q — Verification pass (0 new tests)
- ✅ Verified recurring events already implemented from Session G
- ✅ Verified bulk messaging already complete

### Session R — Stripe Connect Online Giving Scaffold
- ✅ **Giving embed**: `/embed/giving` — presets, fund dropdown, frequency toggle, cover-fee checkbox
- ✅ **Stripe settings tab**: Church onboarding UI, Connect status, fund + preset config
- ✅ **Online giving record creation**: `createOnlineGivingRecord()` (TEST_MODE: skips Stripe)
- ✅ **Recurring subscriptions**: `RecurringSubscription` entity, full CRUD
- ✅ **Webhook handler**: `functions/stripe-webhook.js` — 3 event types with TODO stubs
- ✅ **Stripe env vars**: All 4 keys in `.env.example`
- ⚠️ **PARTIAL**: Stripe API calls are TODO stubs — no real payment processing

### Session S — Absence Tracking
- ✅ **Absence detection**: `detectAbsentMembers()` pure function
- ✅ **Multi-source aggregation**: AttendanceLogs + Checkins + VolunteerSchedule
- ✅ **Dismissal system**: localStorage-based 30-day "mark as contacted" dismissal
- ✅ **Absent Members widget**: Dashboard widget with count + advisory message
- ✅ **Absent tab in People directory**: Sorted by days-absent, with last-seen, avg frequency, dismiss button
- ✅ **Configurable threshold**: `absence_threshold_days` in AppConfig (default 28)
- ✅ **URL persistence**: `?tab=absent` query param (widget links directly to tab)

---

## 7. Test Coverage

### Summary
- **Total tests:** 729 passing (37 files, 0 failing)
- **Run command:** `npx vitest run`

### Test File Breakdown

| Test File | Tests | What's Covered |
|-----------|-------|---------------|
| `monthly-report.test.ts` | 66 | All KPI calculations, trend arrows, historical import, report computation |
| `song-import-service.test.ts` | 54 | PC CSV parsing, field mapping, chord charts, key normalization |
| `runsheet.test.ts` | 39 | Run sheet grouping, filtering, sort, served marking |
| `giving-service.test.ts` | 38 | CRUD, summary, import parse, CSV commit, statements |
| `recurrence-service.test.ts` | 37 | Weekly/biweekly/monthly occurrence gen, series |
| `music-stand-service.test.ts` | 33 | Sessions, sync events, annotations, PDF prefs |
| `bulk-messaging.test.ts` | 32 | All 7 filters, merge fields, template storage |
| `stripe-giving.test.ts` | 31 | createOnlineGivingRecord, RecurringSubscription CRUD, formatFrequency |
| `ccli-report.test.ts` | 31 | Song usage aggregation, CSV format, series data |
| `confirmation-token.test.ts` | 21 | Token creation, URL generation, resolve, expire |
| `multi-tenancy.test.ts` | 18 | church_id isolation across all entity types |
| `event-service.test.ts` | 18 | Events CRUD, registration, waitlist, recurrence |
| `session-sync.test.ts` | 18 | Music Stand cross-device sync events |
| `merge-fields.test.ts` | 19 | All merge field replacements, per-recipient rendering |
| `people-service.test.ts` | 23 | displayName, search, filter functions |
| `group-service.test.ts` | 23 | Groups CRUD, members, waitlist, capacity |
| `group-attendance-service.test.ts` | 19 | Meeting CRUD, attendance upsert, filtering |
| `volunteer-service.test.ts` | 19 | Schedule CRUD, blackouts, filtering |
| `worship-service.test.ts` | 19 | Songs, plans, items, assignments |
| `volunteer-attendance.test.ts` | 16 | Served marking, run sheet served status |
| `absence-service.test.ts` | 16 | Absence detection, all edge cases, dismissal |
| `email-confirmation-wiring.test.ts` | 13 | End-to-end confirmation flow for 3 purposes |
| `checkin-service.test.ts` | 12 | performCheckin, performCheckout, new family |
| `household-checkout.test.ts` | 11 | Household checkout group, multi-child |
| `access-control.test.ts` | 10 | Tier guards, finance admin flag |
| `app-config.test.ts` | 9 | Default config, updateAppConfig, church isolation |
| `module-config.test.ts` | 8 | Module toggles, DEFAULT_MODULES, spread pattern |
| `medical-alert.test.tsx` | 8 | MedicalAlertBanner React component |
| `pickup-queue-service.test.ts` | 7 | Queue creation, clearing |
| `attendance-service.test.ts` | 7 | Headcount entry, date range |
| `visitor-service.test.ts` | 17 | Visitor stats, followup pipeline |
| `communications-log.test.ts` | 6 | Log creation, channel filter |
| `print-service.test.ts` | 13 | Label building, TEST_MODE behavior |
| `notification-service.test.ts` | 4 | TEST_MODE notification skip |
| `notification-service-prod.test.ts` | 4 | Production Resend path |
| `checkin-event-bus.test.ts` | 4 | BroadcastChannel events |
| `people-directory.test.tsx` | 6 | React component: heading, search, filters, navigation |

### Zero-Coverage Areas (Red Flags)

These areas have **no automated tests** — they are functional but rely on manual testing:

| Area | Reason / Risk |
|------|--------------|
| `GivingDashboard.tsx` React component | Complex tabs, charts — no component test |
| `ChurchSettings.tsx` React component | 10-tab settings page — no component test |
| `SetupWizard.tsx` | Multi-step wizard — no test |
| `KioskApp.tsx` React component | Flow tested at service layer only |
| `AdminDashboard.tsx` React component | Widget rendering — no component test |
| `VisitorPipeline.tsx` | Kanban UI — no test |
| `BulkMessageModal.tsx` | UI tested at service layer only |
| `EmbedsPage.tsx` | Code generation logic — no test |
| Firebase DB (`firebase-db.ts`) | Production code path — no integration tests |
| `storage-service.ts` | File upload — cannot test in jsdom |
| Print server (`print-server/index.js`) | External process — no integration test |
| `GivingEmbed.tsx` | Payment form UI — manual only |

---

## 8. Known Issues & Technical Debt

### Active TODOs in Source Code

| File | TODO | Impact |
|------|------|--------|
| `functions/stripe-webhook.js:25` | Stripe signature verification not wired | **Security risk in production** — accepts unverified webhooks |
| `functions/stripe-webhook.js:61` | `payment_intent.succeeded` → GivingRecord not created | Payments received but not recorded |
| `functions/stripe-webhook.js:95` | `invoice.payment_succeeded` → GivingRecord not created | Recurring charges not recorded |
| `functions/stripe-webhook.js:125` | `customer.subscription.deleted` → not cancelled in DB | Subscription status stale |
| `giving-service.ts:69` | `createOnlineGivingRecord` — no Stripe API call | TEST_MODE only; no real payments |
| `giving-service.ts:395` | `createRecurringSubscription` — no Stripe Subscription created | Subscriptions are local-only |
| `giving-service.ts:410` | `cancelRecurringSubscription` — no Stripe API call | Cancellation is local-only |
| `GivingEmbed.tsx:192` | Stripe PaymentElement not mounted | Form collects no real card data |
| `GivingEmbed.tsx:206` | Server-side PaymentIntent creation not implemented | |
| `ChurchSettings.tsx:1094` | Stripe Connect onboarding redirect not wired | Connect button shows alert only |
| `ChurchSettings.tsx:1109` | Stripe account deauthorization not implemented | |
| `in-memory-db.ts:769` | Stripe subscription cancel API not called in DB layer | |
| `AuthContext.tsx:124` | church_id not resolved from Firestore in production | Admin must manually set church |
| `print-service.ts:130` | PrintNode live API call not wired | Labels only print in TEST_MODE stub |

### Console Output in Production Code

| File | Pattern | Safe? |
|------|---------|-------|
| `notification-service.ts:165` | `console.warn` when Resend key missing | ✅ graceful degradation |
| `notification-service.ts:202,213` | `console.warn` when SMS proxy missing | ✅ graceful degradation |
| `checkin-service.ts:246,397` | `console.error` on print failure | ✅ non-fatal |
| `CheckoutPanel.tsx:99,158,168` | `console.error` on queue write failure | ✅ non-fatal |
| `PickupDisplay.tsx:57` | `console.warn` when no BroadcastChannel | ✅ expected in non-kiosk context |
| `giving-service.ts:69,395,410` | `console.log` TODO messages | ⚠️ remove before launch |

### Cross-Tab Communication (BroadcastChannel) Gotchas

- `CheckinEventBus` uses `BroadcastChannel('gather-checkin')` — not available in Safari < 15.4
- Cannot be tested in jsdom (single module scope) — all BroadcastChannel tests use a manual stub
- The coordinator dashboard and kiosk must run in the **same browser profile** (same origin) for sync to work
- Pickup display at `/display` is a separate page — it also subscribes to the same bus

### Performance / Scaling Concerns

| Area | Concern |
|------|---------|
| In-memory DB | Entire dataset loaded into memory at boot — fine for hundreds of records, breaks at thousands |
| `getCheckins(sessionId)` | Called per session in AbsentMembersWidget — could be N+1 if many sessions |
| `computeGivingSummary` | Loops all records in memory — fine for <10k records |
| `BulkPdfUpload` | No size/count limits enforced client-side |
| Monthly report | `getEngagedPeopleInMonth` scans all AttendanceLogs — no index |
| People search | Case-insensitive substring match in memory — no full-text index |

### Known Behavioral Gaps

- `admin/people` filter by household (`?household=...`) is not implemented (mentioned in PROGRESS.md)
- Firebase DB (`firebase-db.ts`) is a stub — most methods throw `Not implemented` — production deployment requires full wiring
- Stripe Connect OAuth callback handler is not implemented — the `stripe_account_id` must be manually set in AppConfig
- CCLI report download is client-side CSV — no API submission to CCLI SongSelect
- Giving statements are print-dialog only — no PDF generation
- Email templates are stored in DB but the UI to manage them is not exposed in a dedicated page (only bulk messaging uses them)

---

## 9. Service Layer Reference

### `notification-service.ts`
- `sendEmail({ to, subject, body, replyTo? })` — Resend or Gmail (server-side proxy pattern)
- `sendSMS({ to, body })` — Twilio via VITE_TWILIO_PROXY_URL (skips with console.warn if not set)

### `print-service.ts`
- `buildLabelData(checkin, person, session)` → `LabelData`
- `printLabel(labelData)` — POSTs to `VITE_PRINT_SERVER_URL/print` (TEST_MODE returns mock)
- `printCheckoutSlip(checkin, person)` — checkout confirmation label

### `checkin-event-bus.ts`
- `CheckinEventBus` class: `emit(event)`, `on(type, handler)`, `off(type, handler)`
- Event types: `checkin`, `checkout`, `session_opened`, `session_closed`, `flag_cleared`, `queue_updated`

### `confirmation-token-service.ts`
- `createVolunteerConfirmToken(scheduleId, personId)` → token
- `createEventConfirmToken(registrationId, personId)` → token
- `createGroupWaitlistConfirmToken(groupId, personId)` → token
- `confirmUrl(token)` / `declineUrl(token)` → absolute URLs
- `resolveConfirmationToken(token, action)` → performs DB side-effect + returns token

### `absence-service.ts`
- `detectAbsentMembers(opts)` → `AbsentPerson[]` — pure function, sorted by days-absent desc
- `dismissAbsenceFlag(personId)` — writes 30-day dismissal to localStorage
- `getDismissedPersonIds(today?)` — reads + auto-cleans expired dismissals from localStorage

### `giving-service.ts`
- `getGivingRecords(personId?)`, `createGivingRecord()`, `updateGivingRecord()`, `deleteGivingRecord()`
- `createOnlineGivingRecord({ personId, amount, fund, frequency, stripe* })` — TEST_MODE stub
- `createRecurringSubscription()`, `getRecurringSubscriptions()`, `cancelRecurringSubscription()`
- `computeGivingSummary(records)` → `{ ytd, thisMonth, totalRecords, fundBreakdown, monthlyData }`
- `formatCurrency(amount)`, `formatFrequency(freq)`, `formatMethod(method)`

---

## 10. Module Status by Phase

| Phase | Features | Status |
|-------|---------|--------|
| **Phase 1** — Core | People, Households, Auth, Settings, Setup Wizard | ✅ Complete |
| **Phase 2** — Kids | Check-in coordinator, Kiosk, Label printing, Pickup display | ✅ Complete |
| **Phase 3** — Volunteers | Teams, Schedule, Run sheet, Blackouts, Confirmations | ✅ Complete |
| **Phase 4** — Groups & Events | Groups, Events, Registration, Recurrence, Embeds | ✅ Complete |
| **Phase 5** — Giving | Dashboard, Import, Statements, CSV export | ✅ Complete |
| **Phase 5b** — Online Giving | Stripe embed, Connect scaffold, Webhook handler | ⚠️ Scaffolded (Stripe API stubs) |
| **Phase 6** — Communications | Bulk messaging, merge fields, templates, log | ✅ Complete |
| **Phase 6b** — Visitors | Pipeline, follow-up, embed form | ✅ Complete |
| **Phase 7** — Analytics | Monthly report, KPIs, trend, history import | ✅ Complete |
| **Phase 7b** — Attendance | Headcount entry, individual logs, absence detection | ✅ Complete |
| **Phase 8** — Worship | Song library, service plans, Music Stand, CCLI | ✅ Complete |
| **Phase 9** — Embeds & QR | All 4 embeds, code generator, QR download | ✅ Complete |

### What's Needed for Production Launch

1. **Firebase DB wiring** — implement all methods in `firebase-db.ts` (largest remaining task)
2. **Stripe API integration** — wire PaymentIntent creation, subscription management, webhook verification
3. **Stripe Connect OAuth** — implement callback handler to save `stripe_account_id`
4. **Auth church_id resolution** — look up church from Firestore on login
5. **PrintNode live API** — wire `print-service.ts` production path
6. **Remove debug console.logs** — 3 TODO log statements in `giving-service.ts`

---

## 11. Seed Data Reference

Pre-generated by `scripts/generate-test-data.js` using `@faker-js/faker` seeded at 42. Regenerate with `node scripts/generate-test-data.js`.

| File | Description |
|------|------------|
| `churches.json` | 1 sample church ("Sample Community Church") |
| `people.json` | ~50 people (adults + children) |
| `households.json` | ~20 households |
| `household_members.json` | People → household links |
| `child_pickups.json` | Authorized pickups per child |
| `checkin_flags.json` | Sample custody/medical flags |
| `teams.json` | 8 serving teams |
| `team_members.json` | Team→person assignments |
| `team_positions.json` | Position definitions |
| `volunteer_schedule.json` | Schedule entries |
| `volunteer_blackouts.json` | Date blackouts |
| `groups.json` | ~10 small groups |
| `group_members.json` | Group→person memberships |
| `events.json` | ~5 upcoming events |
| `event_registrations.json` | Registration records |
| `giving_records.json` | ~2 years of giving history |
| `songs.json` | ~15 worship songs |
| `visitor_followup.json` | Follow-up pipeline entries |
| `followup_templates.json` | 3-step follow-up template |
| `app_config.json` | Single church config record |
| `test_users.json` | Test user credentials by tier |

---

*Last updated: 2026-04-24 — Session S complete. 729 tests. 37 test files.*
