import {
  Application,
  ApplicationPriority,
  Filters,
  PRIORITY_RANK,
  SortField,
} from './types'

export function filterApplications(apps: Application[], filters: Filters): Application[] {
  const q = filters.search.trim().toLowerCase()
  return apps.filter(app => {
    if (q && !app.company.toLowerCase().includes(q)) return false
    if (filters.priority.length && !filters.priority.includes(app.priority)) return false
    if (filters.type.length && (app.type == null || !filters.type.includes(app.type))) return false
    if (filters.workmode.length && !filters.workmode.includes(app.workmode)) return false
    if (filters.location.length && (app.location == null || !filters.location.includes(app.location))) return false
    return true
  })
}

export function sortApplications(apps: Application[], sortBy: SortField): Application[] {
  return [...apps].sort((a, b) => {
    switch (sortBy) {
      case 'order':
        return a.order - b.order
      case 'date':
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      case 'company':
        return (a.company ?? '').localeCompare(b.company ?? '')
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      default:
        return a.order - b.order
    }
  })
}

export function getStageApplications(
  apps: Application[],
  stageId: string,
  filters: Filters,
  sortBy: SortField,
): Application[] {
  const staged = apps.filter(a => a.status === stageId)
  const filtered = filterApplications(staged, filters)
  return sortApplications(filtered, sortBy)
}

export function computeStats(apps: Application[]) {
  const total = apps.length
  const active = apps.filter(a => !['future', 'watchlist', 'closed'].includes(a.status)).length
  const interviewing = apps.filter(a => ['hr', 'hm', 'interview'].includes(a.status)).length
  const offers = apps.filter(a => a.status === 'offer').length
  return { total, active, interviewing, offers }
}

export function priorityColor(priority: ApplicationPriority): string {
  switch (priority) {
    case 'High':   return 'bg-red-100 text-red-700 border-red-200'
    case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'Low':    return 'bg-green-100 text-green-700 border-green-200'
  }
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year.slice(2)}`
}

export function todayLocalDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.priority.length > 0 ||
    filters.type.length > 0 ||
    filters.workmode.length > 0 ||
    filters.location.length > 0
  )
}
