// ── Church context ────────────────────────────────────────────────────────────
// Module-level state that scopes every DatabaseService call to a specific church.
// The test mode always uses TEST_CHURCH_ID.
//
// Production flow:
//   1. User authenticates → AppUser.church_id is resolved from Firestore/custom claims
//   2. AuthContext calls setChurchId(user.church_id)
//   3. All subsequent db.* calls operate within that church's namespace
//
// This module is deliberately framework-free (no React) so it can be imported
// by both the service layer and the auth layer without circular deps.

export const TEST_CHURCH_ID = 'church-test-default'
const STORAGE_KEY = 'gather:church_id'

function readPersistedChurchId(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? TEST_CHURCH_ID } catch { return TEST_CHURCH_ID }
}

// Restored from localStorage so that kiosk/embed pages retain the correct church
// across browser refreshes without requiring re-authentication.
let _churchId: string = readPersistedChurchId()

export function setChurchId(id: string): void {
  _churchId = id
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore – SSR or private-mode restriction */ }
}

export function getChurchId(): string {
  return _churchId
}
