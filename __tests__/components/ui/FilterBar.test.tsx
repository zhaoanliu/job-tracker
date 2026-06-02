import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from '@/components/ui/FilterBar'
import { Filters } from '@/lib/types'

const emptyFilters: Filters = { priority: [], type: [], workmode: [], location: [], search: '' }

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

  it('renders the search input', () => {
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search company…')).toBeInTheDocument()
  })

  it('calls onFilterChange with updated search when typing', async () => {
    const onFilterChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={onFilterChange} onSortChange={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Search company…'), 'G')
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'G' }))
  })

  it('shows "Clear filters" when search is non-empty', () => {
    render(
      <FilterBar
        filters={{ ...emptyFilters, search: 'Google' }}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    expect(screen.getByText('Clear filters')).toBeInTheDocument()
  })

  it('does not render the clear-search button when search is empty', () => {
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('renders the clear-search button when search is non-empty', () => {
    render(
      <FilterBar
        filters={{ ...emptyFilters, search: 'Google' }}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('clears only the search field when the clear-search button is clicked', async () => {
    const onFilterChange = vi.fn()
    render(
      <FilterBar
        filters={{ ...emptyFilters, search: 'Google', priority: ['High'] }}
        sortBy="order"
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onFilterChange).toHaveBeenCalledWith({
      ...emptyFilters,
      search: '',
      priority: ['High'],
    })
  })

  it('calls onSortChange when the sort select changes', async () => {
    const onSortChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={onSortChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'company')
    expect(onSortChange).toHaveBeenCalledWith('company')
  })

  it('does not render the match badge when matchInfo is not provided', () => {
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={vi.fn()} onSortChange={vi.fn()} />)
    expect(screen.queryByText(/match/i)).not.toBeInTheDocument()
  })

  it('shows "No matches" when matchInfo.total is 0', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        matchInfo={{ total: 0, byStage: [] }}
      />
    )
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('calls onFilterChange with toggled type when a type chip is clicked', async () => {
    const onFilterChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={onFilterChange} onSortChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Other', exact: true }))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ type: ['Other'] }))
  })

  it('removes a type from active filters when clicked again', async () => {
    const onFilterChange = vi.fn()
    render(
      <FilterBar
        filters={{ ...emptyFilters, type: ['Other'] }}
        sortBy="order"
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Other', exact: true }))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ type: [] }))
  })

  it('calls onFilterChange with toggled workmode when a mode chip is clicked', async () => {
    const onFilterChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={onFilterChange} onSortChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'On-site', exact: true }))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ workmode: ['On-site'] }))
  })

  it('calls onFilterChange with toggled location when a location chip is clicked', async () => {
    const onFilterChange = vi.fn()
    render(<FilterBar filters={emptyFilters} sortBy="order" onFilterChange={onFilterChange} onSortChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bellevue WA', exact: true }))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ location: ['Bellevue WA'] }))
  })

  it('renders matchInfo with matches when total > 0', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        matchInfo={{ total: 3, byStage: [{ label: 'Applied', count: 2 }, { label: 'HR', count: 1 }] }}
      />
    )
    expect(screen.getByText('3 matches')).toBeInTheDocument()
    expect(screen.getByText('Applied 2 · HR 1')).toBeInTheDocument()
  })

  it('renders matchInfo with singular "match" when total is 1', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        matchInfo={{ total: 1, byStage: [{ label: 'Applied', count: 1 }] }}
      />
    )
    expect(screen.getByText('1 match')).toBeInTheDocument()
  })

  it('shows singular "1 match" and stage breakdown when total is 1', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        matchInfo={{ total: 1, byStage: [{ label: 'Applied', count: 1 }] }}
      />
    )
    expect(screen.getByText('1 match')).toBeInTheDocument()
    expect(screen.getByText('Applied 1')).toBeInTheDocument()
  })

  it('shows plural "N matches" and multi-stage breakdown when total is > 1', () => {
    render(
      <FilterBar
        filters={emptyFilters}
        sortBy="order"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        matchInfo={{ total: 3, byStage: [{ label: 'Applied', count: 2 }, { label: 'Interviewing', count: 1 }] }}
      />
    )
    expect(screen.getByText('3 matches')).toBeInTheDocument()
    expect(screen.getByText('Applied 2 · Interviewing 1')).toBeInTheDocument()
  })
})
