import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { AccessTier, type AppUser } from '@/shared/types'
import { isTestMode, auth } from '@/config/firebase'
import { setChurchId, getChurchId, TEST_CHURCH_ID } from '@/services/church-context'
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'

// ── Test users (matched from generated test_users.json) ─────────────────────
import testUsersData from '@/test-data/test_users.json'

const TEST_USERS = testUsersData as Array<{
  uid: string
  tier: number
  isFinanceAdmin: boolean
  personId: string
  email: string
}>

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  // TEST_MODE only — switch mock user tier
  setTestTier: (tier: AccessTier, isFinanceAdmin?: boolean) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Auth-ready promise: resolves once we know the initial auth state.
// Router loaders await this before making redirect decisions.
// In TEST_MODE, resolves immediately at module load — no AuthProvider needed.
let authReadyResolve: () => void
export const authReady = new Promise<void>(resolve => {
  authReadyResolve = resolve
})
if (isTestMode) {
  authReadyResolve!()
}

function tierLabel(tier: AccessTier): string {
  const labels: Record<AccessTier, string> = {
    [AccessTier.Public]: 'Public',
    [AccessTier.Authenticated]: 'Authenticated',
    [AccessTier.GroupLeader]: 'Group Leader',
    [AccessTier.Staff]: 'Staff',
    [AccessTier.Executive]: 'Executive',
  }
  return labels[tier]
}

function makeTestUser(tier: AccessTier, isFinanceAdmin = false): AppUser {
  const match = TEST_USERS.find(u => u.tier === tier && u.isFinanceAdmin === isFinanceAdmin)
    ?? TEST_USERS.find(u => u.tier === tier)
    ?? TEST_USERS[0]
  return {
    uid: match.uid,
    tier,
    isFinanceAdmin,
    // Use the already-initialised church context (read from localStorage on module load)
    // rather than hardcoding TEST_CHURCH_ID. This keeps user.church_id consistent with
    // whatever church the admin had active, preventing AuthProvider.useEffect from
    // overwriting _churchId with a stale default when navigating to /stand.
    church_id: getChurchId(),
    personId: match.personId,
    email: match.email,
    displayName: `TEST: ${tierLabel(tier)}${isFinanceAdmin ? ' + Finance' : ''}`,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Default test mode user: Staff tier so the full app is immediately usable
  const [user, setUser] = useState<AppUser | null>(
    isTestMode ? makeTestUser(AccessTier.Staff) : null
  )
  const [loading, setLoading] = useState(!isTestMode)
  const resolvedRef = useRef(false)

  function resolveAuthReady() {
    if (!resolvedRef.current) {
      resolvedRef.current = true
      authReadyResolve()
    }
  }

  // Keep the DB church context in sync with the authenticated user's church.
  // In TEST_MODE we skip this entirely: church-context.ts owns _churchId (initialized
  // from localStorage at module load), and the setup wizard/kiosk calls setChurchId
  // directly. user.church_id is a snapshot captured at useState-init and would be stale
  // after the wizard runs — letting it write here would silently reset _churchId.
  useEffect(() => {
    if (isTestMode) return
    if (!user?.church_id) return
    setChurchId(user.church_id)
  }, [user])

  useEffect(() => {
    if (isTestMode) {
      resolveAuthReady()
      return
    }

    if (!auth) {
      setLoading(false)
      resolveAuthReady()
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // In real mode, derive tier and church_id from custom claims or a Firestore roles document.
        // For now, default to Authenticated tier — production wiring deferred.
        const appUser: AppUser = {
          uid: firebaseUser.uid,
          tier: AccessTier.Authenticated,
          isFinanceAdmin: false,
          // TODO: resolve church_id from Firestore /users/{uid} document or custom claims
          church_id: TEST_CHURCH_ID,
          personId: undefined,
          email: firebaseUser.email ?? undefined,
          displayName: firebaseUser.displayName ?? undefined,
          photoURL: firebaseUser.photoURL ?? undefined,
        }
        setUser(appUser)
      } else {
        setUser(null)
      }
      setLoading(false)
      resolveAuthReady()
    })

    return unsubscribe
  }, [])

  async function signIn(email: string, password: string) {
    if (isTestMode) {
      // Match a test user by email
      const found = TEST_USERS.find(u => u.email === email)
      if (found) {
        setUser({
          uid: found.uid,
          tier: found.tier as AccessTier,
          isFinanceAdmin: found.isFinanceAdmin,
          // Must include church_id so AuthProvider.useEffect calls setChurchId correctly.
          church_id: getChurchId(),
          personId: found.personId,
          email: found.email,
          displayName: `TEST: ${tierLabel(found.tier as AccessTier)}`,
        })
      } else {
        setUser(makeTestUser(AccessTier.Authenticated))
      }
      return
    }
    if (!auth) throw new Error('Firebase auth not initialized')
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function signInWithGoogle() {
    if (isTestMode) {
      setUser(makeTestUser(AccessTier.Staff))
      return
    }
    if (!auth) throw new Error('Firebase auth not initialized')
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  async function signOut() {
    if (isTestMode) {
      setUser(null)
      return
    }
    if (!auth) return
    await firebaseSignOut(auth)
  }

  function setTestTier(tier: AccessTier, isFinanceAdmin = false) {
    if (!isTestMode) return
    setUser(makeTestUser(tier, isFinanceAdmin))
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, signOut, setTestTier }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
