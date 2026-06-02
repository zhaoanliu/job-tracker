import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import MetricCard from '@/components/admin/MetricCard'

describe('MetricCard', () => {
  it('renders the label', () => {
    render(<MetricCard label="Total Users" value={42} />)
    expect(screen.getByText('Total Users')).toBeInTheDocument()
  })

  it('renders the formatted value', () => {
    render(<MetricCard label="Signups" value={1234567} />)
    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })
})
