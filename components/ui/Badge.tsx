import { ApplicationPriority, ApplicationType } from '@/lib/types'
import { priorityColor } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: ApplicationPriority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor(priority)}`}
    >
      {priority}
    </span>
  )
}

interface TypeBadgeProps {
  type: ApplicationType | null
}

const TYPE_COLORS: Record<ApplicationType, string> = {
  'Principal Engineer': 'bg-violet-100 text-violet-700 border-violet-200',
  'Security Engineer': 'bg-sky-100 text-sky-700 border-sky-200',
  'Security Architect': 'bg-teal-100 text-teal-700 border-teal-200',
  Other: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function TypeBadge({ type }: TypeBadgeProps) {
  if (!type) return null
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[type]}`}
    >
      {type}
    </span>
  )
}
