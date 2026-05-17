import { Application } from '@/lib/types'
import { computeStats } from '@/lib/utils'

interface StatsBarProps {
  applications: Application[]
}

export default function StatsBar({ applications }: StatsBarProps) {
  const { total, active, interviewing, offers } = computeStats(applications)

  const stats = [
    { label: 'Total', value: total, color: 'text-slate-700' },
    { label: 'Active', value: active, color: 'text-indigo-600' },
    { label: 'Interviewing', value: interviewing, color: 'text-amber-600' },
    { label: 'Offers', value: offers, color: 'text-emerald-600' },
  ]

  return (
    <div
      className="h-[var(--stats-height)] flex items-center gap-6 px-4 bg-white border-b border-slate-200"
      style={{ height: 'var(--stats-height)' }}
    >
      {stats.map(s => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
          <span className="text-xs text-slate-500 font-medium">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
