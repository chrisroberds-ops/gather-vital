# Gather — Setup & Deployment Guide

Gather is a multi-tenant church management platform built with React + TypeScript + Vite.
This document covers local development, first-run configuration, and production deployment.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| npm | 9 or later |
| A Firebase project | (free Spark plan is enough to start) |

---

## 1 — Clone and install

```bash
git clone <your-repo-url> gather
cd gather
npm install
```

---

## 2 — Firebase setup

1. Create a new project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication** → sign-in method → **Email/Password**.
3. Create a **Firestore Database** (production mode, pick your region).
4. Go to **Project settings → General** and copy your web app config.

---

## 3 — Environment variables

Copy the example env file and fill in your Firebase credentials:

```bash
cp .env.example .env.local
```

**.env.local**

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

> **Development without Firebase:** Set `VITE_TEST_MODE=true` in your `.env.local`
> to run entirely in-memory with seed data. No Firebase credentials needed.

---

## 4 — Run locally

```bash
# Development server (hot reload)
npm run dev

# Run tests
npm test

# Type-check without building
npm run tsc
```

The app starts at `http://localhost:5173`.

---

## 5 — First-run setup wizard

When a new authenticated user first reaches the admin area (`/admin`), the app
checks `config.setup_complete`. If it is `false`, the user is automatically
redirected to `/setup` — the five-step setup wizard.

The wizard collects:

| Step | What it configures |
|------|--------------------|
| 1 — Welcome | Introduction |
| 2 — Identity | Church name, logo URL → creates the church tenant in the database |
| 3 — Brand Color | Primary color applied as CSS custom properties throughout the UI |
| 4 — Terminology | Labels for Small Groups, Volunteers, Kids Check-In, etc. |
| 5 — Done | Saves all config, marks `setup_complete: true`, redirects to `/admin` |

**You only need to complete the wizard once per church.** After that, any staff member
logging in goes directly to the dashboard.

---

## 6 — Creating the first admin user

### Test mode (no Firebase)

In test mode, the app automatically signs you in as a Staff-level user. You can
switch tiers from the user menu in the sidebar.

### Production (Firebase)

1. Sign up at `/login` with your email and password.
2. In the Firebase console, go to **Firestore → users** (or your user collection)
   and set `tier: 4` (Executive) on the document for your UID.
3. Sign back in — you now have full access.

---

## 7 — Multi-tenancy

Each church is an isolated **tenant**:

- The setup wizard calls `createChurch()` and immediately scopes the session via
  `setChurchId()`.
- Every database record carries a `church_id` field. The service layer
  automatically filters and stamps all queries to the active church.
- A single deployed instance can serve unlimited churches. Each church's admin
  staff only ever sees their own data.

---

## 8 — Access tiers

| Tier | Value | Description |
|------|-------|-------------|
| Public | 0 | Unauthenticated visitors |
| Authenticated | 1 | Logged-in members (self-service only) |
| GroupLeader | 2 | Group leaders (manage their own group) |
| Staff | 3 | Church staff (full admin access) |
| Executive | 4 | Executives (church settings, billing) |

Set the `tier` field on the Firestore user document to grant access.

---

## 9 — Embedding widgets on your church website

Generate embed codes at `/admin/embeds`. Three widgets are available:

| Widget | Path | Description |
|--------|------|-------------|
| Visitor Form | `/embed/visitor-form` | First-time visitor registration |
| Group Browser | `/embed/groups` | Browsable list of open groups |
| Event Browser | `/embed/events` | Upcoming events with registration |

**Script tag (recommended)** — add to any page:
```html
<script
  src="https://your-gather-domain.com/embed.js"
  data-gather-widget="visitor-form"
  data-gather-church="your-church-slug"
  data-gather-height="560px">
</script>
```

**QR codes** — printable PNG QR codes are available from the Embeds admin page
for each widget. Use them on bulletins, slides, or lobby signage.

---

## 10 — Importing data from Planning Center

Go to `/admin/import` to import existing data:

1. Export from Planning Center Online (People → Export, etc.).
2. Upload the CSV file.
3. The importer auto-detects Planning Center column headers and pre-fills the field mapping.
4. Review the **Preview** screen — rows are classified as Ready, Duplicate, or Skipped.
5. Nothing is written to the database until you click **Confirm import**.

Supported import types: **People**, **Households**, **Groups**, **Giving Records**.

---

## 11 — Production build

```bash
npm run build
```

Output is in `dist/`. Deploy to any static host (Vercel, Netlify, Firebase Hosting,
Cloudflare Pages, etc.).

**Firebase Hosting example:**

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # point public dir to "dist", SPA rewrite to index.html
npm run build
firebase deploy
```

After deploying, update your embed codes to use the production URL instead of
`localhost`.

---

## 12 — Kiosk mode

The kids check-in kiosk runs at `/kiosk`. Open it on a dedicated tablet or
touch-screen PC in your kids ministry area. It is fully self-contained and
requires an active check-in session (created from `/admin/checkin`) to operate.

---

## 13 — Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Yes (prod) | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes (prod) | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes (prod) | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes (prod) | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes (prod) | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Yes (prod) | Firebase app ID |
| `VITE_TEST_MODE` | No | Set `true` to bypass Firebase and use in-memory seed data |

---

## 14 — Label printing and the print server

Gather's kiosk prints two labels per check-in: a **child name badge** (worn by the child)
and a **parent pickup tag** (kept by the parent). In test mode, labels are logged to the
browser console. In production, the kiosk posts jobs to the Gather Print Server, which
forwards them to PrintNode's cloud printing API.

### How it works

```
Kiosk (browser)  →  POST /print  →  Gather Print Server (Node, localhost:3001)
                                           ↓
                                    PrintNode API (cloud)
                                           ↓
                              Physical label printer (USB/network)
```

### Supported printers

Any printer visible to PrintNode works. Recommended for churches:

| Model | Size | Notes |
|-------|------|-------|
| Zebra ZD220 / ZD230 | 2.25" × 1.25" | Best value, USB + network |
| Zebra ZD410 | 2" × 1" | Compact, USB |
| DYMO LabelWriter 450 | 1.1" × 3.5" | Common in offices |

### Step 1 — Create a PrintNode account

1. Sign up at [printnode.com](https://www.printnode.com) (free trial; paid plans from $9/mo).
2. Download and install the **PrintNode client** on the computer connected to the printer.
3. Note your **API key** (Account → API Keys) and your **printer ID**
   (`curl -u YOUR_API_KEY: https://api.printnode.com/printers`).

### Step 2 — Configure the print server

```bash
cd print-server
cp .env.example .env
# Edit .env — fill in PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID
```

The `print-server/.env` file is separate from the main `.env.local` so it never
gets bundled into the Vite app.

### Step 3 — Run the print server

**Development (foreground):**
```bash
node print-server/index.js
# → 🖨  Gather Print Server running on http://127.0.0.1:3001
```

**Production (background, auto-restart with PM2):**
```bash
npm install -g pm2
pm2 start print-server/index.js --name gather-print
pm2 save          # persist across reboots
pm2 startup       # generate OS startup script (follow its instructions)
```

Verify the server is running:
```bash
curl http://localhost:3001/health
# → {"status":"ok","printer":"12345"}
```

### Step 4 — Point the kiosk at the print server

In your main `.env.local`:
```
VITE_PRINT_SERVER_URL=http://localhost:3001
```

If the kiosk browser runs on a **different machine** from the print server, use the
print server machine's local IP address instead of `localhost`:
```
VITE_PRINT_SERVER_URL=http://192.168.1.50:3001
```

### iPad kiosk note

iOS does not support USB printing. If your kiosk runs on an iPad:

1. Run the print server on a **Windows, macOS, or Linux computer** on the same Wi-Fi network.
2. Set `VITE_PRINT_SERVER_URL` to that computer's local IP (e.g. `http://192.168.1.50:3001`).
3. The printer must be connected (USB or network) to that companion computer, not the iPad.

---

## 15 — Live Pickup Display

The pickup display runs at `/display` — no authentication required. Open it on any
screen in your kids ministry lobby (TV, monitor, tablet) so parents can see when their
child is ready to be collected.

### How it works

1. When a parent initiates checkout at the kiosk or staff dashboard, the child's name,
   room, and pickup code are pushed to the display queue in real time.
2. The display page refreshes instantly via BroadcastChannel (same browser) and polls
   every 2 seconds for cross-device updates.
3. Staff tap **Clear** next to a child's name once the child has been handed off —
   the entry disappears from all connected screens immediately.

### Setup

1. Open `https://your-gather-domain.com/display` on the lobby screen.
2. The page reads church name, logo, and brand color from app config — no extra
   configuration needed.
3. Keep the browser tab open; it self-updates without any page refresh.

### iPad kiosk + PrintNode note (checkout slip)

When a child is checked out, Gather also sends a **checkout slip** print job
(child name, room, pickup code). In test mode this is logged to the console.
In production, the same PrintNode setup described in section 14 handles it.

> **iPad reminder:** iOS does not support USB printing. If your kiosk is an iPad,
> the PrintNode client must run on a companion Windows/macOS/Linux computer on the
> same Wi-Fi network. See section 14 for full instructions.

---

## 17 — Running the test suite

```bash
npm test               # watch mode
npm run test -- --run  # single pass (CI)
```

All 163+ tests run against the in-memory database. No Firebase account or network
connection is required. Tests are located in `src/tests/`.
