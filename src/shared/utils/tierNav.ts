import { AccessTier } from '@/shared/types'

// Single source of truth: which home page each tier lands on.
// Used by LoginPage, AdminLayout tier switcher, and the root redirect.
export function tierHomePath(tier: AccessTier): string {
  if (tier >= AccessTier.Staff) return '/admin'
  if (tier >= AccessTier.GroupLeader) return '/leader'
  if (tier >= AccessTier.Authenticated) return '/my'
  return '/public'
}
