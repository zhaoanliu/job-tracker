'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Application, Stage } from '@/lib/types'
import KanbanCard from './KanbanCard'

interface KanbanColumnProps {
  stage: Stage
  applications: Application[]
  onCardClick: (app: Application) => void
  onAddClick: (stageId: string) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

export default function KanbanColumn({
  stage,
  applications,
  onCardClick,
  onAddClick,
  selectedIds,
  onToggleSelect,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className={`flex flex-col rounded-xl border flex-shrink-0 w-64 ${stage.colorClass}`}>
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${stage.headerClass}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dotClass}`} />
          <h3 className="text-xs font-semibold uppercase tracking-wide">{stage.label}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold tabular-nums opacity-70">{applications.length}</span>
          <button
            onClick={() => onAddClick(stage.id)}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
            title={`Add to ${stage.label}`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Droppable + sortable card list */}
      <SortableContext items={applications.map(a => a.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={[
            'kanban-column-body flex flex-col gap-2 p-2',
            isOver ? 'bg-white/60 dark:bg-white/5' : '',
          ].join(' ')}
        >
          {applications.map(app => (
            <KanbanCard
              key={app.id}
              application={app}
              onClick={onCardClick}
              selected={selectedIds?.has(app.id) ?? false}
              onToggleSelect={onToggleSelect}
            />
          ))}

          {/* Empty-column drop target (always rendered so the column accepts drops) */}
          {applications.length === 0 && (
            <div
              className={[
                'rounded-lg border-2 border-dashed p-6 flex items-center justify-center transition-colors',
                isOver ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600',
              ].join(' ')}
            >
              <p className="text-xs text-slate-400 dark:text-slate-500">Drop here</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
