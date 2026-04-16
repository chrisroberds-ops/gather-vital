import { redirect, type LoaderFunctionArgs } from 'react-router-dom'
import { authReady } from './AuthContext'
import { AccessTier } from '@/shared/types'

const isTestMode = import.meta.env.VITE_TEST_MODE === 'true'

// Stores the current user reference for use in loaders.
// In TEST_MODE, initialise to Staff so the app is usable without logging in.
let currentUser: { tier: AccessTier; isFinanceAdmin: boolean } | null =
  isTestMode ? { tier: AccessTier.Staff, isFinanceAdmin: false } : null

export function setCurrentUserForGuards(user: { tier: AccessTier; isFinanceAdmin: boolean } | null) {
  currentUser = user
}

export function requireTier(requiredTier: AccessTier, requireFinance = false) {
  return async (_args: LoaderFunctionArgs) => {
    await authReady

    if (!currentUser || currentUser.tier < requiredTier) {
      // Send unauthenticated users to login; authenticated-but-wrong-tier to their home
      if (!currentUser || currentUser.tier === AccessTier.Public) {
        return redirect('/login')
      }
      // User is logged in but doesn't have the required tier — send to their home page
      const { tierHomePath } = await import('@/shared/utils/tierNav')
      return redirect(tierHomePath(currentUser.tier))
    }

    if (requireFinance && !currentUser.isFinanceAdmin) {
      return redirect('/unauthorized')
    }

    return null
  }
}

export function requireAuth() {
  return requireTier(AccessTier.Authenticated)
}

export function requireGroupLeader() {
  return requireTier(AccessTier.GroupLeader)
}

export function requireStaff() {
  return requireTier(AccessTier.Staff)
}

export function requireExecutive() {
  return requireTier(AccessTier.Executive)
}

export function requireFinanceAdmin() {
  return requireTier(AccessTier.Staff, true)
}
