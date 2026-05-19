'use client'

import {
  ApplicationPriority,
  ApplicationType,
  ApplicationWorkmode,
  ApplicationLocation,
  APPLICATION_PRIORITIES,
  APPLICATION_TYPES,
  APPLICATION_WORKMODES,
  APPLICATION_LOCATIONS,
  Filters,
} from '@/lib/types'
import { SortField } from '@/lib/types'
import { hasActiveFilters } from '@/lib/utils'

interface FilterBarProps {
  filters: Filters
  sortBy: SortField
  onFilterChange: (filters: Filters) => void
  onSortChange: (sort: SortField) => void
}

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]
}

interface MultiChipProps<T extends string> {
  label: string
  options: T[]
  selected: T[]
  onToggle: (v: T) => void
}

function MultiChip<T extends string>({ label, options, selected, onToggle }: MultiChipProps<T>) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={`rounded-full px-2 py-0.5 text-xs font-medium border transition-colors whitespace-nowrap ${
            selected.includes(opt)
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function FilterBar({ filters, sortBy, onFilterChange, onSortChange }: FilterBarProps) {
  const active = hasActiveFilters(filters)

  function clearFilters() {
    onFilterChange({ priority: [], type: [], workmode: [], location: [], search: '' })
  }

  return (
    <div
      className="h-[var(--filter-height)] flex items-center gap-4 px-4 bg-white border-b border-slate-200 overflow-x-auto scrollbar-none"
      style={{ height: 'var(--filter-height)' }}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <div className="relative">
          <input
            type="text"
            value={filters.search}
            onChange={e => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Search company…"
            className={`w-36 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${filters.search ? 'pr-6' : ''}`}
          />
          {filters.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onFilterChange({ ...filters, search: '' })}
              className="absolute inset-y-0 right-1.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="h-4 w-px bg-slate-200 flex-shrink-0" />
      <MultiChip
        label="Priority"
        options={APPLICATION_PRIORITIES}
        selected={filters.priority}
        onToggle={v => onFilterChange({ ...filters, priority: toggleItem(filters.priority, v as ApplicationPriority) })}
      />

      <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

      <MultiChip
        label="Type"
        options={APPLICATION_TYPES}
        selected={filters.type}
        onToggle={v => onFilterChange({ ...filters, type: toggleItem(filters.type, v as ApplicationType) })}
      />

      <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

      <MultiChip
        label="Mode"
        options={APPLICATION_WORKMODES}
        selected={filters.workmode}
        onToggle={v => onFilterChange({ ...filters, workmode: toggleItem(filters.workmode, v as ApplicationWorkmode) })}
      />

      <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

      <MultiChip
        label="Location"
        options={APPLICATION_LOCATIONS}
        selected={filters.location}
        onToggle={v => onFilterChange({ ...filters, location: toggleItem(filters.location, v as ApplicationLocation) })}
      />

      <div className="h-4 w-px bg-slate-200 flex-shrink-0" />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Sort</span>
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as SortField)}
          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="order">Manual</option>
          <option value="date">Date</option>
          <option value="company">Company</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      {active && (
        <button
          onClick={clearFilters}
          className="ml-auto flex-shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
