# Church Management System — Full Build Specification

## For Claude Code: Read this entire document before writing any code. Build in the phased order specified. Test each phase before moving to the next.

---

## 1. PROJECT OVERVIEW

### What We're Building
A self-hosted, open-source church management system (CMS) called **"Gather"** (working title — can be renamed) that replaces commercial tools like Planning Center, Breeze, and Gracely. It uses Google products (Sheets, Firebase) as the backend, runs as a React web application, and is designed to be cloned and self-hosted by any church.

### Core Design Principles
- **Individuals first**: People are the primary record, linked to one or more households (not the other way around)
- **Inclusive by default**: Pronouns, preferred names, flexible relationship/family structures, co-parenting support
- **Embeddable**: Public-facing features (group browsing, event sign-up, visitor forms) must work as embeddable widgets (iframe or web components) on any website — NOT a separate destination site
- **Google-native admin experience**: Staff can view and edit core data directly in Google Sheets when needed
- **Clone-and-own distribution**: Each church gets their own copy of the codebase and their own Google backend. A setup guide walks them through configuration.

### Target Scale
- Primary: 1,500 total people, ~400 weekly attendance
- Designed to work for churches from 100–2,000 people
- Google Sheets handles roster/group/scheduling data (structured across multiple sheets to stay under performance limits)
- Firebase handles real-time operations (check-in sync across kiosks)

---

## 2. ARCHITECTURE & TECH STACK

### Frontend
- **React** (with TypeScript)
- **Tailwind CSS** for styling
- **React Router** for navigation
- **PWA-capable** — must work well on iPad Safari for kiosk mode
- Responsive design: works on tablets (kiosks), desktops (admin), and phones (parent self-service)

### Backend / Data Layer
- **Firebase Realtime Database or Firestore** — for real-time check-in sync across kiosks, live dashboard updates, and session management
- **Google Sheets API** — as the "database" for:
  - People directory
  - Households & relationships
  - Groups & group membership
  - Volunteer teams & schedules
  - Events & registrations
  - Giving records (restricted access)
  - Attendance logs
  - Visitor follow-up pipeline
- **Firebase Authentication** — handles all auth flows (email/password, phone number, Google sign-in for staff)
- **Firebase Hosting** — free tier for hosting the web app (or Vercel/Netlify as alternatives)

### Print Server (Local)
- A lightweight **Node.js print server** that runs on a local machine (Raspberry Pi, old laptop, etc.) at the church
- Receives print requests from the web app via local network
- Formats and sends labels to DYMO LabelWriter printers
- Each kiosk is mapped to a specific printer

### External Integrations (Phase 2+)
- **Stripe** — for donation processing and event registration fees
- **Twilio** — for SMS notifications (optional add-on)
- **Mailchimp / Gloo** — churches continue using their existing tools; no duplication needed

---

## 3. DATA SCHEMA (Google Sheets Structure)

### Sheet: `people`
Each row = one person. This is the core table.

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| id | string (UUID) | yes | Primary key |
| first_name | string | yes | Legal first name |
| last_name | string | yes | |
| preferred_name | string | no | Display name used everywhere if set |
| pronouns | string | no | e.g., "he/him", "she/her", "they/them" |
| email | string | no | |
| phone | string | yes | Primary identifier for login; format: +1XXXXXXXXXX |
| date_of_birth | date | no | |
| grade | string | no | For kids: "Pre-K", "K", "1st"–"12th"; blank for adults |
| is_child | boolean | yes | true/false |
| gender_identity | string | no | Open text field |
| relationship_status | string | no | e.g., "married", "single", "partnered", "divorced", "co-parenting", "widowed" |
| membership_status | string | no | e.g., "member", "regular attender", "visitor", "inactive" — opt-in field per church |
| allergies | text | no | Displayed on check-in labels for kids |
| medical_notes | text | no | Staff-only visibility |
| special_needs | text | no | Staff-only visibility |
| custom_field_1 | string | no | Church-configurable label and value |
| custom_field_2 | string | no | Church-configurable label and value |
| photo_url | string | no | Profile photo |
| created_at | datetime | yes | |
| updated_at | datetime | yes | |
| is_active | boolean | yes | Soft delete |
| visitor_source | string | no | "How did you hear about us?" |
| first_visit_date | date | no | |

### Sheet: `households`
| Column | Type | Notes |
|--------|------|-------|
| id | string (UUID) | |
| name | string | e.g., "The Johnson Family", "123 Oak St Household" |
| address_line_1 | string | |
| address_line_2 | string | |
| city | string | |
| state | string | |
| zip | string | |
| primary_contact_id | string | FK → people.id |

### Sheet: `household_members`
Links people to households. A person can belong to multiple households.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| household_id | string | FK → households.id |
| person_id | string | FK → people.id |
| role | string | "adult", "child", "other" |

### Sheet: `child_pickups`
Authorized pickup people per child, per household. This is what enables split-custody support.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| child_id | string | FK → people.id (the child) |
| household_id | string | FK → households.id (which household context) |
| authorized_person_id | string | FK → people.id (who can pick up) |
| relationship | string | "mother", "father", "grandparent", "stepparent", etc. |
| is_primary | boolean | Primary contact for this child in this household |
| pickup_code | string | 4-digit code, unique per child per household |
| notes | text | e.g., "Court order: no pickup by [name]" — STAFF ONLY |

### Sheet: `checkin_sessions`
One row per Sunday (or event) check-in session.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| name | string | e.g., "Sunday Morning - April 6, 2026" |
| date | date | |
| service_time | string | e.g., "9:00 AM", "10:30 AM" |
| status | string | "open", "closed" |
| created_by | string | Staff person who opened the session |

### Sheet: `checkins`
Individual check-in records. Also synced to Firebase for real-time.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| session_id | string | FK → checkin_sessions.id |
| child_id | string | FK → people.id |
| checked_in_by | string | FK → people.id (the parent) |
| household_id | string | Which household context was used |
| pickup_code | string | The 4-digit code issued for this check-in |
| kiosk_id | string | Which kiosk performed the check-in |
| checked_in_at | datetime | |
| checked_out_at | datetime | null until pickup |
| checked_out_by | string | FK → people.id |
| status | string | "checked_in", "checked_out" |
| label_printed | boolean | |
| notes | text | Any notes from custom fields |

### Sheet: `checkin_flags`
Staff-only flags that trigger alerts during check-in.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| person_id | string | FK → people.id (the child or person) |
| flag_type | string | "custody_alert", "behavioral", "medical", "other" |
| flag_message | text | What staff should know |
| is_active | boolean | Can be toggled on/off |
| created_by | string | Staff who created the flag |
| created_at | datetime | |

### Sheet: `teams`
Volunteer teams / ministry areas.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| name | string | e.g., "Music", "Tech", "Kids", "Greeting" |
| description | text | |
| coordinator_id | string | FK → people.id |
| is_active | boolean | |

### Sheet: `team_members`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| team_id | string | FK → teams.id |
| person_id | string | FK → people.id |
| role | string | "member", "leader", "coordinator" |
| rotation_preference | string | "every_week", "1st_sunday", "2nd_sunday", "3rd_sunday", "4th_sunday", "5th_sunday", "every_other", "as_needed" |
| joined_at | date | |

### Sheet: `volunteer_schedule`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| team_id | string | FK → teams.id |
| person_id | string | FK → people.id |
| scheduled_date | date | |
| position | string | Specific role within team, e.g., "Lead Vocals", "Camera 1" |
| status | string | "pending", "confirmed", "declined", "cancelled" |
| confirmed_at | datetime | |
| reminder_sent | boolean | |
| reminder_sent_at | datetime | |

### Sheet: `volunteer_blackouts`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| person_id | string | FK → people.id |
| start_date | date | |
| end_date | date | |
| reason | string | Optional |

### Sheet: `groups`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| name | string | |
| description | text | |
| group_type | string | "small_group", "class", "ministry", "support", etc. |
| meeting_day | string | "Monday", "Tuesday", etc. |
| meeting_time | string | "6:30 PM" |
| location | string | Address or "Online" |
| childcare_available | boolean | |
| leader_id | string | FK → people.id |
| max_capacity | integer | null = unlimited |
| is_open | boolean | true = accepting sign-ups |
| is_visible | boolean | true = shows in public browse; false = hidden/closed group tracked internally |
| image_url | string | Group graphic or photo |
| hook_text | text | Short marketing description |
| category | string | e.g., "Men's", "Women's", "Mixed", "Young Adults", "Couples", "Recovery" |
| semester | string | e.g., "Spring 2026" |
| is_active | boolean | |

### Sheet: `group_members`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| group_id | string | FK → groups.id |
| person_id | string | FK → people.id |
| status | string | "active", "waitlisted", "inactive" |
| joined_at | date | |

### Sheet: `events`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| name | string | |
| description | text | |
| event_date | date | |
| event_time | string | |
| location | string | |
| max_capacity | integer | null = unlimited |
| registration_required | boolean | |
| has_cost | boolean | |
| cost_amount | number | |
| cost_description | string | e.g., "T-shirt included" |
| image_url | string | |
| is_active | boolean | |

### Sheet: `event_registrations`
| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| event_id | string | FK → events.id |
| person_id | string | FK → people.id |
| status | string | "registered", "waitlisted", "cancelled" |
| payment_status | string | "not_required", "pending", "paid" |
| payment_amount | number | |
| registered_at | datetime | |

### Sheet: `giving_records`
**ACCESS: Finance/Giving Admin tier ONLY.**

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| person_id | string | FK → people.id |
| amount | number | |
| date | date | |
| method | string | "online_card", "online_ach", "cash", "check" |
| fund | string | "general", "missions", "building", etc. |
| source | string | "stripe", "square", "manual", "imported" |
| transaction_id | string | External reference |
| notes | text | |

### Sheet: `visitor_followup`
Configurable pipeline with 3–7 steps.

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| person_id | string | FK → people.id |
| step_number | integer | 1, 2, 3, etc. |
| step_name | string | e.g., "Sunday text", "Welcome email", "Follow-up call" |
| due_date | date | |
| status | string | "pending", "completed", "skipped" |
| completed_at | datetime | |
| completed_by | string | FK → people.id (staff) |
| notes | text | |

### Sheet: `followup_templates`
Defines the pipeline steps (configurable per church).

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| step_number | integer | |
| step_name | string | |
| method | string | "text", "email", "call", "task" |
| delay_days | integer | Days after first visit |
| template_text | text | Message template with merge fields |
| is_active | boolean | |

### Sheet: `attendance_log`
General attendance tracking (non-kids, for adults/services).

| Column | Type | Notes |
|--------|------|-------|
| id | string | |
| person_id | string | FK → people.id |
| date | date | |
| event_type | string | "sunday_service", "group_meeting", "event", "midweek" |
| event_id | string | Optional FK |
| count_type | string | "headcount" or "individual" |

### Sheet: `app_config`
Church-specific settings.

| Column | Type | Notes |
|--------|------|-------|
| key | string | Setting name |
| value | string | Setting value |
| description | string | What this setting does |

Example rows:
- `church_name` / `"Community Church"`
- `custom_field_1_label` / `"Pronouns"`
- `custom_field_2_label` / `"Special Instructions"`
- `checkin_label_field_1` / `"pronouns"`
- `checkin_label_field_2` / `"parent_phone"`
- `enable_membership_tracking` / `"false"`
- `enable_giving_module` / `"true"`
- `giving_access_role` / `"finance_admin"`
- `kiosk_1_printer` / `"DYMO-Front-Lobby"`
- `kiosk_2_printer` / `"DYMO-Side-Entrance"`
- `kiosk_3_printer` / `"DYMO-Kids-Wing"`
- `visitor_followup_steps` / `"5"`

---

## 4. ACCESS CONTROL (4 Tiers + 1 Special)

### Tier 1: Public (no login)
- Browse open/visible groups
- Browse events
- View visitor registration form
- View general church info

### Tier 2: Authenticated User (phone + password or email + password)
- Everything in Tier 1
- "I'm in" group sign-up
- Event registration
- View own profile, own family, own group memberships
- View own volunteer schedule
- Confirm/decline volunteer assignments

### Tier 3: Group Leader
- Everything in Tier 2
- View roster of their own group(s) only
- See who's signed up, waitlisted
- Basic group attendance tracking

### Tier 4: Staff
- Everything in Tier 3
- Full people directory access
- All groups (including hidden/closed)
- Volunteer scheduling and management
- Check-in management (open/close sessions, view flags)
- Visitor follow-up pipeline
- Attendance reports and dashboard
- Event management
- Can create/edit check-in flags

### Tier 5: Executive
- Everything in Tier 4
- Can edit system configuration
- Can manage user roles
- Can edit/delete any record
- Access to all reports

### Special Tier: Finance/Giving Admin
- All giving records
- Giving reports and trends
- End-of-year giving statements
- This role is assignable by the Executive tier
- Configurable per church (who gets this role)
- **NOT automatically given to Executive tier** — must be explicitly assigned

---

## 5. FEATURE SPECIFICATIONS

### 5.1 Kids Check-In System

#### Kiosk Mode
- Kiosks run the app in a special "kiosk mode" URL (`/kiosk`)
- Kiosk mode is a locked-down interface: no navigation to admin, no access to other people's data
- Each kiosk is identified by a `kiosk_id` stored in localStorage
- Kiosk setup: staff logs in once, assigns the kiosk an ID and a printer, then the kiosk stays in kiosk mode

#### Check-In Flow (Parent Experience)
1. Parent sees a simple screen: "Enter your phone number"
2. Parent types phone number on a large numeric keypad UI
3. System looks up the phone number → finds the parent → finds all children linked to any household where this parent is an authorized pickup person
4. Screen shows checkboxes for each child with their name and grade
5. Parent checks the kids they're dropping off
6. System generates a unique 4-digit pickup code for each child for this session
7. Print request sent to the local print server → labels print on the kiosk's assigned DYMO printer
8. Confirmation screen: "You're all set! Your pickup codes are: [codes]"
9. Screen resets to phone number entry after 10 seconds

#### Check-In Label (Printed)
```
┌─────────────────────────────┐
│  EMMA JOHNSON               │
│  Grade: 3rd                 │
│  ⚠ ALLERGY: Peanuts         │
│  Pronouns: she/her          │
│  Parent Phone: 555-123-4567 │
│                             │
│  Code: 4829                 │
│  Sunday 4/6/2026 • 10:30 AM│
└─────────────────────────────┘
```
- The two lines after the allergy line are the custom/editable fields configured in `app_config`
- If no allergy, that line is omitted (not blank)
- Label layout should be designed for DYMO LabelWriter 450 standard labels (2.25" x 1.25" or similar)

#### Parent Pickup Tag (Also Printed)
```
┌─────────────────────────────┐
│  PARENT PICKUP              │
│  Emma J. — Code: 4829       │
│  Sunday 4/6/2026            │
└─────────────────────────────┘
```
- One parent tag per child

#### Staff Dashboard During Check-In
- Real-time list of all checked-in kids, updated via Firebase
- Shows: child name, grade, room assignment, checked-in time, pickup code
- **Flag alerts**: When a flagged child is checked in, a visual + audio alert appears on the staff dashboard
  - The alert shows the flag message (e.g., "Does not get along with [other child name] — separate rooms")
  - Flags are NEVER visible on the kiosk or to the parent
  - Staff can acknowledge the alert to dismiss it
- Checkout: staff enters the pickup code → confirms the match → marks the child as checked out

#### Real-Time Sync (Firebase)
- All check-in/checkout events are written to Firebase in real-time
- All three kiosks read from Firebase so if one kiosk checks in a child, the other kiosks immediately reflect that (prevents double check-in)
- The staff dashboard subscribes to Firebase for live updates
- Firebase data is periodically synced back to Google Sheets for reporting

#### First-Time Child Registration
- If a phone number is not found, offer: "New here? Let's get you set up!"
- Short form: Parent name, phone, email, child name, child grade, date of birth, allergies, authorized pickups
- This creates records in `people`, `households`, `household_members`, and `child_pickups`
- Also triggers the visitor follow-up pipeline

### 5.2 Volunteer Scheduling

#### Team Management (Staff/Executive)
- Create and manage teams (name, description, coordinator)
- Add/remove team members
- Set each member's rotation preference: every week, 1st/2nd/3rd/4th/5th Sunday, every other week, as needed
- Define positions within each team (e.g., Music team has "Lead Vocals", "Keys", "Drums", "Electric Guitar")

#### Schedule Generation
- Staff can auto-generate a schedule for a date range (e.g., next 3 months)
- Auto-generation respects:
  - Rotation preferences
  - Blackout dates
  - Conflict detection: no person scheduled for two teams on the same date
  - Team capacity / position requirements
- Staff can manually override any assignment after generation
- Volunteers can also sign up for open dates themselves

#### Volunteer Experience
- Volunteers log in and see their upcoming schedule
- For each assignment, they can: Confirm, Decline, or Request Swap
- If they decline, the coordinator is notified and the slot opens up
- Blackout date management: "I'll be out these dates" interface

#### Reminders
- Automated email reminders sent N days before (configurable, default: 3 days)
- Reminder includes: date, team, position, and a confirm/decline link
- Phase 2: SMS reminders via Twilio (architecture should support this but implementation deferred)

#### Coordinator View
- See their team's full schedule
- See confirmations/declines
- Get notified of declines
- Fill open slots by browsing available team members

### 5.3 Groups

#### Public Group Browser
- Embeddable widget showing all visible, open groups
- Filter/search by: name, day of week, category, childcare available
- Each group shows: name, description/hook, meeting day/time, location, childcare, spots available (if capped)
- Optional group image

#### Group Sign-Up
- If user is logged in: one-click "I'm in" → person added to group, leader notified via email
- If group is at capacity: added to waitlist, notified when a spot opens
- If not logged in: prompted to log in or create account first

#### Hidden/Closed Groups
- `is_visible = false` groups do not appear in the public browser
- Staff can still see them in the admin interface
- Membership can still be tracked and managed
- Useful for: established groups not accepting new members, staff-only groups, support groups with privacy needs

#### Leader View
- See their group roster: names, contact info (phone, email)
- See who's active vs. waitlisted
- Can remove members or move from waitlist to active
- Cannot see other groups' data

### 5.4 Events

#### Event Listing
- Embeddable widget showing upcoming events
- Each event shows: name, description, date/time, location, spots available, cost (if any)
- Optional event image

#### Event Registration
- Logged-in users: "Sign me up" button
- If capacity-limited: waitlist when full
- If event has a cost: redirect to Stripe checkout (Phase 2; for now, mark as "payment pending" and handle offline)

### 5.5 Visitor Onboarding

#### Digital Visitor Form
- Embeddable form on the church website
- Fields: First name, last name, email, phone (required), how did you hear about us (optional)
- On submit: creates a `people` record, triggers the follow-up pipeline
- Can also be filled out on a tablet at the welcome desk

#### QR Code Option
- Generate a QR code that links to the visitor form
- Printable for bulletin inserts, welcome desk signage, etc.

#### Follow-Up Pipeline
- Configurable 3–7 step workflow defined in `followup_templates`
- Each step has: name, method (text/email/call/task), delay (days after first visit), template text
- Example default pipeline:
  1. Day 0 (Sunday by 1 PM): Welcome text
  2. Day 3: Welcome email with info about groups and next steps
  3. Day 6: Follow-up email or call before next Sunday
  4. Day 10: Personal invitation to a group or event
  5. Day 21: Check-in call/text
- Staff dashboard shows pipeline status for each visitor
- Staff can mark steps complete, skip steps, or add notes

### 5.6 Dashboard

#### Staff Dashboard
- Customizable widgets based on the staff person's role
- Available widgets:
  - **Sunday Overview**: Total checked-in kids, volunteers confirmed, alerts
  - **Attendance Trend**: Chart showing weekly attendance over time (configurable: 6 weeks, 3 months, 6 months, 1 year)
  - **Volunteer Schedule**: This week's volunteers by team, confirmation status, cancellations
  - **Group Health**: Number of people in groups, sign-up trends
  - **Visitor Pipeline**: New visitors in pipeline, next actions due
  - **Giving Summary** (Finance Admin only): Weekly/monthly giving totals, year-over-year comparison
  - **New People**: Recent additions to the directory
  - **Kids Currently Checked In**: Live count and list (during active sessions)
- Each staff person can arrange which widgets they see
- Data sourced from Google Sheets, synthesized and displayed in the app
- Live data (check-in) from Firebase

#### Executive Dashboard
- Everything in Staff Dashboard plus:
  - Giving trends (if they have Finance Admin role)
  - System health / usage stats
  - The "big 6" metrics: attendance, people in groups, people volunteering, people giving, new people, kids attendance
  - Ability to add custom tracked metrics (opt-in for other churches)

### 5.7 Giving (Phase 2 — Architecture Now, Build Later)

#### Data Import
- Import giving records from Planning Center export (CSV)
- Import from other platforms as they're identified
- Manual entry for cash/check gifts

#### Giving Statements
- Generate end-of-year giving statements (PDF)
- Per-person statements showing all tax-deductible gifts
- Include church name, EIN, required IRS language
- Bulk generate for all donors or individual

#### Donation Processing (Future)
- Integrate with existing Stripe/Square accounts
- Simple donation form embeddable on church website
- Recurring giving support

---

## 6. EMBEDDABLE WIDGETS

The following features must be available as embeddable widgets that work inside an iframe on any website (e.g., Squarespace):

1. **Group Browser** — `/embed/groups`
2. **Event Listing** — `/embed/events`
3. **Visitor Form** — `/embed/visitor-form`
4. **Donation Form** — `/embed/give` (Phase 2)

### Embed Implementation
- Each embed route renders a standalone, minimal-chrome version of that feature
- Include a small JavaScript snippet that churches paste into their website:
```html
<div id="gather-groups"></div>
<script src="https://[church-app-url]/embed.js" data-widget="groups" data-target="gather-groups"></script>
```
- The embed.js script creates an iframe with appropriate sizing
- Supports `postMessage` for cross-origin communication (e.g., login state)
- Responsive — works on mobile and desktop

---

## 7. PRINT SERVER

### Architecture
- Standalone Node.js application
- Runs on a local machine at the church (Raspberry Pi recommended)
- Connects to the same Firebase project to receive print jobs
- Uses the `dymo-connect` or `dymojs` npm package to communicate with DYMO LabelWriter printers

### Print Job Flow
1. Kiosk web app writes a print job to Firebase: `{ kiosk_id, label_data, status: "pending" }`
2. Print server subscribes to print jobs in Firebase
3. Print server picks up the job, formats the label (using a label template), sends to the DYMO printer mapped to that kiosk
4. Print server updates the job status to "printed" or "error"

### Label Template
- Use DYMO Label Framework or direct XML label format
- Template supports the fields: child name, grade, allergies, custom field 1, custom field 2, pickup code, date, service time
- Parent pickup tag is a simpler template

### Configuration
- `print-server-config.json`:
```json
{
  "firebase_project": "gather-church-xxxxx",
  "printers": {
    "kiosk_1": "DYMO_LabelWriter_450_USB1",
    "kiosk_2": "DYMO_LabelWriter_450_USB2",
    "kiosk_3": "DYMO_LabelWriter_450_NET3"
  }
}
```

---

## 8. AUTHENTICATION

### Public Users (Parents, Attendees)
- **Phone number + password** login
- First-time flow: enter phone number → system finds them in the directory (from data migration) → prompt to create a password → account created
- If phone number not found: offer to register as a new visitor
- Session persisted via Firebase Auth — user stays logged in on their device (localStorage/cookies)
- Also support email + password as an alternative

### Staff
- **Google sign-in** via Firebase Auth (since they already use Google Workspace)
- Role assigned in the system (Staff, Executive, Finance Admin)

### Kiosk Mode
- Staff logs in once on the kiosk device
- Selects "Enter Kiosk Mode" → device enters a locked-down check-in-only interface
- Kiosk mode persists until a staff person exits it (requires staff login to exit)

---

## 9. DATA MIGRATION TOOL

### Planning Center Import
Build a migration utility that:
1. Accepts Planning Center CSV exports (People, Groups, Giving, Check-ins)
2. Maps Planning Center fields to Gather schema
3. Handles Planning Center's household structure → converts to Gather's flexible individual-linked model
4. Preserves phone numbers (critical — this is how people will first log in)
5. Outputs Google Sheets-ready data
6. Provides a summary report: X people imported, Y households created, Z groups migrated, any data issues flagged

### CSV Field Mapping (Planning Center → Gather)
Provide a documented mapping file that shows which Planning Center fields map to which Gather fields. Include handling for:
- PC's "First Name" → `first_name`
- PC's "Nickname" → `preferred_name`
- PC's "Gender" → `gender_identity` (map M/F but preserve any other values)
- PC's household model → create `households` and `household_members` records
- PC's "Child" flag → `is_child`
- PC's phone/email fields → normalize phone format

### Other Platforms
- Document the general CSV import format so churches using Breeze, Church Community Builder, Shelby, etc. can manually map their exports
- Provide a template CSV with all required and optional fields

---

## 10. SETUP & DEPLOYMENT GUIDE

Create a comprehensive setup document (`SETUP.md`) that walks a non-technical church admin through:

1. **Prerequisites**: Google account, Firebase account (free tier), domain (optional)
2. **Clone the repository** from GitHub
3. **Create a Firebase project**: step-by-step with screenshots described
4. **Enable Firebase services**: Authentication (Email/Password, Phone, Google), Firestore, Hosting
5. **Create a Google Cloud project** and enable Sheets API
6. **Create the Google Sheets** from a provided template (or run a setup script that creates them)
7. **Configure environment variables**: Firebase config, Sheets API credentials, church-specific settings
8. **Deploy**: `firebase deploy` or push to Vercel/Netlify
9. **Import data**: Run the migration tool with their Planning Center (or other) export
10. **Set up kiosks**: Open the app on iPads, log in, enter kiosk mode
11. **Set up print server**: Install Node.js on a local machine, configure printer mappings, start the service
12. **Test**: Walk through a complete check-in flow with test data

---

## 11. TESTING STRATEGY

### Fake Data Generation
Create a script (`generate-test-data.js`) that produces realistic test data:

- **150 adults** with realistic names, phone numbers, emails (use a library like Faker.js)
- **75 children** linked to households
- **50 households** with various structures:
  - Traditional two-parent households
  - Single-parent households
  - Divorced/co-parenting: child appears in 2 households with different authorized pickups
  - Blended families
  - Single adults
  - Couples without children
  - Roommate households
- **8 volunteer teams** with 10–25 members each, with rotation preferences set
- **6 small groups** (mix of open/visible, open/hidden, closed/hidden) with 5–15 members each
- **3 upcoming events** (one free, one with cost, one at capacity with waitlist)
- **10 recent visitors** at various stages of the follow-up pipeline
- **Kids with various flags**: allergies, behavioral notes, custody alerts
- **Giving records**: 6 months of giving data for ~50 people
- All phone numbers should use a test format: `+1555XXXXXXX`
- Include people with pronouns set, preferred names different from legal names, various relationship statuses

### Test Scenarios (Automated & Manual)
The test suite should verify:

1. **Check-in flow**: Phone lookup → select kids → generate codes → "print" (log to console in test mode)
2. **Split custody**: Parent A checks in child → child shows as checked in on all kiosks → Parent B sees child already checked in
3. **Flagged child**: Check in a flagged child → verify staff dashboard shows alert
4. **New family registration**: Unknown phone number → complete registration → check in immediately
5. **Volunteer scheduling**: Generate a month of schedules → verify no conflicts, rotation preferences honored, blackout dates respected
6. **Group sign-up**: Browse groups → sign up → verify leader is notified → try to sign up for a full group → verify waitlist
7. **Visitor pipeline**: New visitor submits form → verify pipeline steps created with correct dates
8. **Access control**: Group leader can't see other groups. Staff can't see giving. Finance admin can see giving.
9. **Embed widgets**: Groups browser renders correctly in an iframe
10. **Data migration**: Import a sample Planning Center CSV → verify all records created correctly
11. **Real-time sync**: Simulate two kiosks checking in simultaneously → verify no conflicts in Firebase

### Test Mode
- When `NODE_ENV=test` or a `TEST_MODE=true` environment variable is set:
  - Skip actual Google Sheets API calls — use in-memory data store loaded from CSVs
  - Skip actual Firebase calls — use a local emulator or mock
  - Skip actual printing — log label data to console
  - Load the fake data set automatically
- This allows the entire system to be tested without any Google/Firebase setup

---

## 12. BUILD PHASES

### Phase 1: Foundation (Build First)
1. Project setup: React + TypeScript + Tailwind + Firebase
2. Data schema: create all Google Sheets templates (or CSV equivalents for testing)
3. Fake data generation script
4. Authentication: phone+password, email+password, Google sign-in
5. People directory: CRUD operations, search, household linking
6. Basic routing and layout (admin shell, public shell, kiosk shell)
7. Access control middleware

### Phase 2: Kids Check-In (Core Feature)
1. Kiosk mode UI
2. Phone number lookup flow
3. Child selection and code generation
4. Firebase real-time sync for check-ins
5. Staff check-in dashboard with live updates
6. Flag system (create, view, alert)
7. First-time family registration flow
8. Print server architecture (print to console in test mode)
9. Label template design
10. Checkout flow

### Phase 3: Volunteer Scheduling
1. Team management CRUD
2. Team member management with rotation preferences
3. Blackout date management
4. Schedule auto-generation algorithm
5. Manual schedule editing
6. Volunteer self-serve: view schedule, confirm/decline
7. Coordinator view
8. Email reminder system (use a configurable email service)

### Phase 4: Groups & Events
1. Group CRUD (including visibility controls)
2. Public group browser (embeddable)
3. Group sign-up flow with capacity/waitlist
4. Leader group view
5. Event CRUD
6. Public event listing (embeddable)
7. Event registration with capacity/waitlist

### Phase 5: Visitor & Dashboard
1. Digital visitor form (embeddable)
2. QR code generation
3. Follow-up pipeline engine
4. Staff pipeline management view
5. Dashboard framework (widget-based, customizable)
6. Dashboard widgets: attendance, volunteers, groups, visitors, kids
7. Reporting views (pull from Sheets, synthesize)

### Phase 6: Migration & Distribution
1. Planning Center CSV import tool
2. General CSV import with field mapping
3. SETUP.md documentation
4. Embed.js script for widget embedding
5. Configuration UI for church-specific settings
6. Polish, error handling, edge cases

### Phase 7: Giving & Advanced (Future)
1. Giving record management
2. Giving import from PC/Stripe/Square
3. End-of-year statement generation
4. Stripe integration for online giving
5. Twilio integration for SMS
6. Advanced reporting and analytics

---

## 13. FILE STRUCTURE

```
gather/
├── README.md
├── SETUP.md                          # Church setup guide
├── package.json
├── firebase.json
├── .env.example
├── src/
│   ├── App.tsx
│   ├── index.tsx
│   ├── config/
│   │   ├── firebase.ts               # Firebase initialization
│   │   ├── sheets.ts                 # Google Sheets API config
│   │   └── app-config.ts            # Church-specific settings
│   ├── auth/
│   │   ├── AuthContext.tsx
│   │   ├── LoginPage.tsx
│   │   ├── PhoneLogin.tsx
│   │   ├── GoogleLogin.tsx
│   │   └── guards.tsx                # Route guards per access tier
│   ├── layouts/
│   │   ├── AdminLayout.tsx
│   │   ├── PublicLayout.tsx
│   │   ├── KioskLayout.tsx
│   │   └── EmbedLayout.tsx
│   ├── features/
│   │   ├── people/
│   │   │   ├── PeopleDirectory.tsx
│   │   │   ├── PersonDetail.tsx
│   │   │   ├── PersonForm.tsx
│   │   │   ├── HouseholdManager.tsx
│   │   │   └── people-service.ts
│   │   ├── checkin/
│   │   │   ├── KioskCheckin.tsx       # Parent-facing kiosk UI
│   │   │   ├── PhoneEntry.tsx
│   │   │   ├── ChildSelector.tsx
│   │   │   ├── CheckinConfirmation.tsx
│   │   │   ├── StaffDashboard.tsx     # Staff live check-in view
│   │   │   ├── CheckoutFlow.tsx
│   │   │   ├── FlagAlert.tsx
│   │   │   ├── NewFamilyForm.tsx
│   │   │   ├── checkin-service.ts     # Firebase operations
│   │   │   └── label-service.ts      # Print job creation
│   │   ├── volunteers/
│   │   │   ├── TeamManager.tsx
│   │   │   ├── ScheduleGenerator.tsx
│   │   │   ├── ScheduleView.tsx
│   │   │   ├── VolunteerSelfServe.tsx
│   │   │   ├── CoordinatorView.tsx
│   │   │   ├── BlackoutManager.tsx
│   │   │   └── volunteer-service.ts
│   │   ├── groups/
│   │   │   ├── GroupBrowser.tsx        # Public browsing
│   │   │   ├── GroupDetail.tsx
│   │   │   ├── GroupManager.tsx        # Staff CRUD
│   │   │   ├── LeaderGroupView.tsx
│   │   │   └── group-service.ts
│   │   ├── events/
│   │   │   ├── EventListing.tsx
│   │   │   ├── EventDetail.tsx
│   │   │   ├── EventManager.tsx
│   │   │   └── event-service.ts
│   │   ├── visitors/
│   │   │   ├── VisitorForm.tsx
│   │   │   ├── FollowupPipeline.tsx
│   │   │   ├── PipelineManager.tsx
│   │   │   └── visitor-service.ts
│   │   ├── giving/
│   │   │   ├── GivingDashboard.tsx
│   │   │   ├── StatementGenerator.tsx
│   │   │   └── giving-service.ts
│   │   └── dashboard/
│   │       ├── Dashboard.tsx
│   │       ├── widgets/
│   │       │   ├── AttendanceWidget.tsx
│   │       │   ├── VolunteerWidget.tsx
│   │       │   ├── GroupsWidget.tsx
│   │       │   ├── VisitorWidget.tsx
│   │       │   ├── KidsWidget.tsx
│   │       │   └── GivingWidget.tsx
│   │       └── dashboard-service.ts
│   ├── embed/
│   │   ├── EmbedRouter.tsx
│   │   └── embed.js                   # Script for churches to include
│   ├── shared/
│   │   ├── components/                # Reusable UI components
│   │   ├── hooks/                     # Custom React hooks
│   │   ├── utils/                     # Helper functions
│   │   └── types/                     # TypeScript interfaces
│   └── services/
│       ├── sheets-api.ts              # Google Sheets read/write
│       ├── firebase-db.ts            # Firebase Realtime DB operations
│       └── email-service.ts          # Email sending
├── print-server/
│   ├── package.json
│   ├── index.js                       # Main print server
│   ├── label-templates/
│   │   ├── child-checkin.js
│   │   └── parent-pickup.js
│   └── print-server-config.json
├── migration/
│   ├── import-planning-center.js
│   ├── import-generic-csv.js
│   ├── field-mappings/
│   │   ├── planning-center.json
│   │   └── template.json
│   └── sample-exports/               # Example PC exports for reference
├── scripts/
│   ├── generate-test-data.js
│   ├── setup-sheets.js               # Creates Google Sheets from templates
│   └── seed-firebase.js              # Seeds Firebase with test data
└── tests/
    ├── checkin.test.ts
    ├── volunteers.test.ts
    ├── groups.test.ts
    ├── access-control.test.ts
    ├── migration.test.ts
    └── test-utils/
        ├── mock-sheets.ts
        ├── mock-firebase.ts
        └── test-data.ts
```

---

## 14. KEY IMPLEMENTATION NOTES

### Google Sheets Performance
- Separate data across multiple sheets (already done in schema above)
- Cache sheet data in memory on the server — don't make a Sheets API call for every request
- Use batch reads/writes when possible
- For the people directory (~1,500 rows), read the full sheet on app load and cache. Invalidate cache on writes.
- Never perform complex queries in Sheets — read data, process in JavaScript

### Firebase Data Structure
Keep Firebase lean — only data that needs real-time sync:
```
/checkin_sessions/{sessionId}
  /status: "open"
  /date: "2026-04-06"
/checkins/{sessionId}/{checkinId}
  /child_id: "..."
  /child_name: "Emma Johnson"
  /grade: "3rd"
  /pickup_code: "4829"
  /checked_in_at: timestamp
  /checked_out_at: null
  /kiosk_id: "kiosk_1"
  /flags: [{type, message}]  // Only sent to staff dashboard
/print_jobs/{jobId}
  /kiosk_id: "kiosk_1"
  /label_data: {...}
  /status: "pending" | "printed" | "error"
```

### Security Rules (Firebase)
- Kiosk mode can only write to `/checkins` and `/print_jobs`
- Staff can read all check-in data including flags
- Public cannot read any Firebase data
- All writes require Firebase Auth

### Offline Considerations
- Kiosks should gracefully handle brief network interruptions
- Queue print jobs locally if Firebase is momentarily unavailable
- Show a clear "offline" indicator on the kiosk if connection is lost

---

## 15. ADDITIONAL NOTES

### Inclusive Design Details
- All forms that ask for gender should use an open text field, not a dropdown with only M/F
- Relationship status field should include: "married", "single", "partnered", "divorced", "co-parenting", "separated", "widowed", "other", "prefer not to say"
- Pronouns field is always optional but visible — never hidden behind a "click to add"
- When displaying a person's name, always use `preferred_name` if set, falling back to `first_name`
- Family/household language should be neutral: "household" not "family" in the data model; "adults in household" not "parents"
- The check-in label uses preferred name, not legal name
- Co-parenting support: a child can exist in multiple households, each with independent pickup authorizations and codes. Neither household's information is visible to the other household.

### Distribution / Licensing Model
- The codebase is self-contained and clone-able
- Each church sets up their own Firebase project and Google Sheets (no shared infrastructure)
- The SETUP.md guide is the primary onboarding tool
- Future consideration: a 1-week trial that freezes access after expiry unless a license key is provided. Architecture should support this (a simple license key check in app_config) but implementation is deferred.

### Error Handling Philosophy
- User-facing errors should be friendly and actionable: "We couldn't find that phone number. Are you new here?" not "404: Record not found"
- Staff-facing errors can be more technical but should still suggest next steps
- All errors logged to console in dev, to a log sheet or Firebase in production
- Check-in system should NEVER crash or show a broken state — it's used during live services with a line of parents

---

## END OF SPECIFICATION

This document is the complete specification for the Gather church management system. Claude Code should read this entire document, then build in the phased order specified in Section 12. For each phase, generate test data, build the features, test against the scenarios in Section 11, and fix any issues before moving to the next phase.
