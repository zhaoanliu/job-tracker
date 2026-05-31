'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Application } from '@/lib/types'
import { PriorityBadge, TypeBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

interface KanbanCardProps {
  application: Application
  onClick: (app: Application) => void
  isDragOverlay?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export default function KanbanCard({
  application,
  onClick,
  isDragOverlay = false,
  selected = false,
  onToggleSelect,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? {} : style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      onClick={() => !isDragging && onClick(application)}
      className={[
        'group bg-white dark:bg-slate-800 rounded-xl border p-3 cursor-pointer select-none',
        'shadow-card hover:shadow-card-hover transition-shadow',
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500'
          : 'border-slate-200 dark:border-slate-700',
        isDragging ? 'dragging' : '',
        isDragOverlay ? 'rotate-1 shadow-xl' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-start gap-2 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(application.id)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={`Select ${application.company} application`}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
            />
          )}
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight line-clamp-1">
            {application.company}
          </p>
        </div>
        <PriorityBadge priority={application.priority} />
      </div>

      {application.role && (
        <p className="text-xs text-slate-500 leading-snug line-clamp-1 mb-2">
          {application.role}
        </p>
      )}

      {application.team && (
        <p className="text-xs text-slate-500 leading-snug line-clamp-1">
          {application.team}
        </p>
      )}

      <div className="flex items-center justify-between gap-1 mt-2">
        <TypeBadge type={application.type} />
        <div className="flex items-center gap-1.5 ml-auto">
          {application.location && (
            <span className="text-[10px] text-slate-400">{application.location}</span>
          )}
          {application.date && (
            <span className="text-[10px] text-slate-400 tabular-nums">{formatDate(application.date)}</span>
          )}
        </div>
      </div>

      {application.next_step && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">Next: </span>
            {application.next_step}
          </p>
        </div>
      )}
    </div>
  )
}
