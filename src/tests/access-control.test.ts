import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccessTier } from '@/shared/types'
import { setCurrentUserForGuards, requireTier, requireStaff, requireFinanceAdmin } from '@/auth/guards'

// Mock react-router-dom redirect
vi.mock('react-router-dom', () => ({
  redirect: (path: string) => ({ redirectPath: path }),
}))

// Minimal mock for LoaderFunctionArgs
const mockArgs = {} as Parameters<ReturnType<typeof requireTier>>[0]

describe('Access control guards', () => {
  beforeEach(() => {
    setCurrentUserForGuards(null)
  })

  it('redirects to /login when user is null', async () => {
    setCurrentUserForGuards(null)
    const loader = requireTier(AccessTier.Authenticated)
    const result = await loader(mockArgs)
    expect(result).toEqual({ redirectPath: '/login' })
  })

  it('allows access when tier matches exactly', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Staff, isFinanceAdmin: false })
    const loader = requireTier(AccessTier.Staff)
    const result = await loader(mockArgs)
    expect(result).toBeNull()
  })

  it('allows access when user tier exceeds required tier', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Executive, isFinanceAdmin: false })
    const loader = requireTier(AccessTier.Staff)
    const result = await loader(mockArgs)
    expect(result).toBeNull()
  })

  it('blocks access when user tier is below required — redirects to their home', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Authenticated, isFinanceAdmin: false })
    const loader = requireTier(AccessTier.Staff)
    const result = await loader(mockArgs)
    // Logged-in user with wrong tier goes to their own home, not /login
    expect(result).toEqual({ redirectPath: '/my' })
  })

  it('group leader cannot access staff-only routes — redirects to /leader', async () => {
    setCurrentUserForGuards({ tier: AccessTier.GroupLeader, isFinanceAdmin: false })
    const loader = requireStaff()
    const result = await loader(mockArgs)
    expect(result).toEqual({ redirectPath: '/leader' })
  })

  it('requireFinanceAdmin blocks non-finance staff', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Staff, isFinanceAdmin: false })
    const loader = requireFinanceAdmin()
    const result = await loader(mockArgs)
    expect(result).toEqual({ redirectPath: '/unauthorized' })
  })

  it('requireFinanceAdmin allows finance admin staff', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Staff, isFinanceAdmin: true })
    const loader = requireFinanceAdmin()
    const result = await loader(mockArgs)
    expect(result).toBeNull()
  })

  it('executive without finance admin cannot access finance routes', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Executive, isFinanceAdmin: false })
    const loader = requireFinanceAdmin()
    const result = await loader(mockArgs)
    expect(result).toEqual({ redirectPath: '/unauthorized' })
  })

  it('finance admin is independent of tier level', async () => {
    // A Staff-level finance admin can access finance routes
    setCurrentUserForGuards({ tier: AccessTier.Staff, isFinanceAdmin: true })
    const loader = requireFinanceAdmin()
    const result = await loader(mockArgs)
    expect(result).toBeNull()
  })

  it('public user is blocked from all protected routes', async () => {
    setCurrentUserForGuards({ tier: AccessTier.Public, isFinanceAdmin: false })
    for (const tier of [AccessTier.Authenticated, AccessTier.GroupLeader, AccessTier.Staff, AccessTier.Executive]) {
      const loader = requireTier(tier)
      const result = await loader(mockArgs)
      expect(result).toEqual({ redirectPath: '/login' })
    }
  })
})
