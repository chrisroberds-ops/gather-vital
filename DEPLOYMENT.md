# Deploying Gather to Cloudflare Pages

Gather is a pure React/Vite frontend. Cloudflare Pages hosts the static build; Firebase provides backend services when not in TEST_MODE.

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- This repository pushed to GitHub or GitLab
- Node.js 18+ installed locally (for a local build test)

---

## Initial trial deployment (TEST_MODE — no Firebase needed)

For a home church trial you can deploy with `VITE_TEST_MODE=true`. The app runs entirely in-browser using in-memory seed data persisted to localStorage. No Firebase project is required.

### Step 1 — Push the repo to GitHub

```bash
git remote add origin https://github.com/YOUR_ORG/gather.git
git push -u origin main
```

### Step 2 — Create a Cloudflare Pages project

1. Go to **Cloudflare dashboard → Workers & Pages → Create application → Pages**
2. Click **Connect to Git** and authorise Cloudflare to access your repository
3. Select the `gather` repo and click **Begin setup**

### Step 3 — Configure the build

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |
| Node.js version | `18` (set under **Environment variables → NODE_VERSION=18** or in the build settings) |

### Step 4 — Set environment variables

In the Cloudflare Pages project: **Settings → Environment variables → Production** (and optionally Preview).

For a TEST_MODE trial, you only need one variable:

| Variable | Value |
|---|---|
| `VITE_TEST_MODE` | `true` |

Click **Save and deploy**.

> All `VITE_*` variables are embedded into the browser bundle at build time by Vite. They must be set **before** the build runs — Cloudflare re-builds on every push, so changes to env vars require triggering a new deployment.

### Step 5 — Deploy

Cloudflare will clone the repo, run `npm run build`, and deploy `dist/` to its CDN. The `public/_redirects` file is automatically picked up and enables client-side routing (all paths return `index.html`).

Your site will be live at `https://gather-<hash>.pages.dev` within a minute or two.

---

## Switching to a real Firebase backend

When you're ready to move off TEST_MODE:

### Step 1 — Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Enable **Authentication** (Email/Password provider)
3. Enable **Realtime Database** (or Firestore if you migrate the DB layer)
4. In **Project settings → Your apps** add a Web app and copy the config

### Step 2 — Update Cloudflare environment variables

In **Pages → Settings → Environment variables → Production**, add:

| Variable | Value |
|---|---|
| `VITE_TEST_MODE` | *(delete this variable or set to `false`)* |
| `VITE_FIREBASE_API_KEY` | from Firebase console |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from Firebase console |
| `VITE_FIREBASE_APP_ID` | from Firebase console |
| `VITE_FIREBASE_DATABASE_URL` | `https://your-project-default-rtdb.firebaseio.com` |

### Step 3 — Trigger a new deploy

Push a commit or go to **Deployments → Retry deployment** to rebuild with the new variables.

---

## Optional integrations

### Email — Resend

Sign up at [resend.com](https://resend.com), verify a domain, create an API key, and add:

| Variable | Value |
|---|---|
| `VITE_RESEND_API_KEY` | `re_xxxxxxxxxxxx` |
| `VITE_RESEND_FROM` | `Gather <notifications@yourchurch.com>` |

> The Resend key is included in the browser bundle. For production workloads, proxy the call through a Firebase Cloud Function and keep the key server-side only.

### Church name

| Variable | Value |
|---|---|
| `VITE_CHURCH_NAME` | `First Community Church` |

---

## Custom domain

In **Pages → Custom domains → Set up a custom domain**, enter your domain (e.g. `app.yourchurch.com`) and follow the DNS instructions. Cloudflare handles TLS automatically.

---

## Local build test

Before deploying, confirm the production build is clean:

```bash
cp .env.example .env.local   # already has VITE_TEST_MODE=true
npm run build                 # vite build → dist/
npx vite preview              # serves dist/ locally at http://localhost:4173
```

To run the strict TypeScript type checker separately (catches type errors without blocking the build):

```bash
npm run type-check
```

> Note: `npm run build` runs Vite only (esbuild transpilation). Strict TypeScript checking is a separate step via `npm run type-check`. This is intentional — esbuild handles transpilation, while `tsc` is used for IDE feedback and CI enforcement.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Page refreshes return 404 | Confirm `public/_redirects` contains `/* /index.html 200` and was committed |
| Blank page / white screen | Open browser DevTools → Console; usually a missing env variable |
| TypeScript type errors | Run `npm run type-check` locally; they don't block the Vite build |
| Old env vars still in effect | Env var changes require a new build — go to Deployments → Retry |
