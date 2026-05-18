import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriorityBadge, TypeBadge } from '@/components/ui/Badge'

describe('PriorityBadge', () => {
  it('renders the priority label', () => {
    render(<PriorityBadge priority="High" />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('applies red styling for High priority', () => {
    const { container } = render(<PriorityBadge priority="High" />)
    expect(container.firstChild).toHaveClass('text-red-700')
  })

  it('applies yellow styling for Medium priority', () => {
    const { container } = render(<PriorityBadge priority="Medium" />)
    expect(container.firstChild).toHaveClass('text-yellow-700')
  })

  it('applies green styling for Low priority', () => {
    const { container } = render(<PriorityBadge priority="Low" />)
    expect(container.firstChild).toHaveClass('text-green-700')
  })
})

describe('TypeBadge', () => {
  it('renders null when type is null', () => {
    const { container } = render(<TypeBadge type={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the type label when provided', () => {
    render(<TypeBadge type="Security Engineer" />)
    expect(screen.getByText('Security Engineer')).toBeInTheDocument()
  })

  it('renders each valid type', () => {
    const types = ['Principal Engineer', 'Security Engineer', 'Security Architect', 'Other'] as const
    types.forEach(type => {
      const { unmount } = render(<TypeBadge type={type} />)
      expect(screen.getByText(type)).toBeInTheDocument()
      unmount()
    })
  })
})
