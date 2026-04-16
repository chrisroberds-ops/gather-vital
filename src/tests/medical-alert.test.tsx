import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MedicalAlertBanner from '@/features/checkin/MedicalAlertBanner'

describe('MedicalAlertBanner', () => {
  it('renders with allergies field', () => {
    render(
      <MedicalAlertBanner
        childName="Emma Smith"
        allergies="Peanuts, tree nuts"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Emma Smith')).toBeInTheDocument()
    expect(screen.getByText('Peanuts, tree nuts')).toBeInTheDocument()
  })

  it('renders with medicalNotes field', () => {
    render(
      <MedicalAlertBanner
        childName="Liam Jones"
        medicalNotes="Carries EpiPen — see parent"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Liam Jones')).toBeInTheDocument()
    expect(screen.getByText('Carries EpiPen — see parent')).toBeInTheDocument()
  })

  it('renders both allergies and medicalNotes when provided', () => {
    render(
      <MedicalAlertBanner
        childName="Ava Brown"
        allergies="Dairy"
        medicalNotes="Lactose intolerant — no cheese snacks"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByText('Dairy')).toBeInTheDocument()
    expect(screen.getByText('Lactose intolerant — no cheese snacks')).toBeInTheDocument()
  })

  it('does not render the allergies section when allergies is absent', () => {
    render(
      <MedicalAlertBanner
        childName="Noah Davis"
        medicalNotes="Asthma inhaler in bag"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Allergies:/i)).not.toBeInTheDocument()
  })

  it('does not render the medical-notes section when medicalNotes is absent', () => {
    render(
      <MedicalAlertBanner
        childName="Olivia Wilson"
        allergies="Shellfish"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Medical notes:/i)).not.toBeInTheDocument()
  })

  it('calls onAcknowledge when the Acknowledge button is clicked', () => {
    const onAcknowledge = vi.fn()
    render(
      <MedicalAlertBanner
        childName="Sophia Taylor"
        allergies="Eggs"
        onAcknowledge={onAcknowledge}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('hides the banner after the Acknowledge button is clicked', () => {
    render(
      <MedicalAlertBanner
        childName="Mason Anderson"
        allergies="Wheat"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has accessible role="alert" so screen readers announce it', () => {
    render(
      <MedicalAlertBanner
        childName="Isabella Thomas"
        allergies="Pollen"
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
