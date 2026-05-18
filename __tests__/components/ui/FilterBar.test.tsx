import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from '@/components/ui/FilterBar'
import { Filters } from '@/lib/types'

const emptyFilters: Filters = { priority: [], type: [], workmode: [], location: [] }

describe('FilterBar', () => {
  it('renders all filter dimension labels', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    // "Priority" appears twice: as section label and as a sort <option> — use getAllByText
    expect(screen.getAllByText('Priority').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Type').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Mode')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
    expect(screen.getByText('Sort')).toBeInTheDocument()
  })

  it('renders priority chip options', () => {
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'High' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Low' })).toBeInTheDocument()
  })

  it('calls onFilterChange with toggled priority when a chip is clicked', async () => {
    const onFilterChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={onFilterChange} onSortChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'High' }))
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ priority: ['High'] })
    )
  })

  it('removes a priority from active filters when clicked again', async () => {
    const onFilterChange = vi.fn()
    render(
      <FilterBar
        filters={{ ...emptyFilters, priority: ['High'] }}
        sortBy="order"
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'High' }))
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ priority: [] })
    )
  })

  it('shows "Clear filters" button only when filters are active', () => {
    const { rerender } = render(
      <FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={vi.fn()} />
    )
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument()

    rerender(
      <FilterBar
        filters={{ ...emptyFilters, priority: ['High'] }}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    expect(screen.getByText('Clear filters')).toBeInTheDocument()
  })

  it('calls onFilterChange with all-empty filters when "Clear filters" is clicked', async () => {
    const onFilterChange = vi.fn()
    render(
      <FilterBar
        filters={{ ...emptyFilters, priority: ['High'] }}
        sortBy="order"
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('Clear filters'))
    expect(onFilterChange).toHaveBeenCalledWith(emptyFilters)
  })

  it('calls onSortChange when the sort select changes', async () => {
    const onSortChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={onSortChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'company')
    expect(onSortChange).toHaveBeenCalledWith('company')
  })
})
