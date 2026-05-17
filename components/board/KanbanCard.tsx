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
}

export default function KanbanCard({ application, onClick, isDragOverlay = false }: KanbanCardProps) {
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
        'group bg-white rounded-xl border border-slate-200 p-3 cursor-pointer select-none',
        'shadow-card hover:shadow-card-hover transition-shadow',
        isDragging ? 'dragging' : '',
        isDragOverlay ? 'rotate-1 shadow-xl' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-1">
          {application.company}
        </p>
        <PriorityBadge priority={application.priority} />
      </div>

      {application.role && (
        <p className="text-xs text-slate-500 leading-snug line-clamp-1 mb-2">
          {application.role}
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
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-[10px] text-slate-500 line-clamp-1">
            <span className="font-medium text-slate-600">Next: </span>
            {application.next_step}
          </p>
        </div>
      )}
    </div>
  )
}
