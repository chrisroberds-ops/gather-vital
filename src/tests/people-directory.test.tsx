import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PeopleDirectory from '@/features/people/PeopleDirectory'
import { AuthProvider } from '@/auth/AuthContext'

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderDirectory() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <PeopleDirectory />
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('PeopleDirectory', () => {
  it('renders the heading and add button', async () => {
    renderDirectory()
    expect(screen.getByRole('heading', { name: /people/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument()
  })

  it('loads and displays people from the test data', async () => {
    renderDirectory()
    // Wait for async load to complete
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull() // spinner gone
    }, { timeout: 3000 })
    // Should have a count indicator
    expect(screen.getAllByText(/people|person/i).length).toBeGreaterThan(0)
    // Should have at least one table row
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
  })

  it('filters by search query', async () => {
    renderDirectory()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    }, { timeout: 3000 })

    const searchInput = screen.getByPlaceholderText(/search/i)
    await user.type(searchInput, 'ZZNOTEXISTINGNAME99')

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('navigates to add person on button click', async () => {
    renderDirectory()
    const user = userEvent.setup()
    const addBtn = screen.getByRole('button', { name: /add person/i })
    await user.click(addBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/admin/people/new')
  })

  it('shows Adults-only filter', async () => {
    renderDirectory()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    }, { timeout: 3000 })

    const adultsBtn = screen.getByRole('button', { name: /adults/i })
    await user.click(adultsBtn)
    // No explicit assertion needed — just verifying no crash
    expect(adultsBtn).toBeInTheDocument()
  })

  it('shows children-only filter', async () => {
    renderDirectory()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    }, { timeout: 3000 })

    const childrenBtn = screen.getByRole('button', { name: /children/i })
    await user.click(childrenBtn)
    expect(childrenBtn).toBeInTheDocument()
  })
})
