'use client'

interface SelectionToolbarProps {
  count: number
  onArchive: () => void
  onClear: () => void
  isArchiving?: boolean
}

export default function SelectionToolbar({
  count,
  onArchive,
  onClear,
  isArchiving = false,
}: SelectionToolbarProps) {
  if (count === 0) return null

  return (
    <div
      role="toolbar"
      aria-label="Bulk selection actions"
      className="sticky top-0 z-20 flex items-center gap-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-200 dark:border-indigo-800"
    >
      <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100 tabular-nums">
        {count} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onArchive}
          disabled={isArchiving}
          aria-label="Archive selected applications"
          className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Archive selected
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
